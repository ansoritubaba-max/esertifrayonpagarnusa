"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function createCertificateGenerationJob(formData: FormData) {
  const { user } = await requireAdmin();
  const eventId = String(formData.get("event_id") ?? "").trim();
  if (!eventId) redirect("/admin/sertifikat?error=job-event");
  const supabase = createSupabaseAdminClient();
  const { data: registrations, error: registrationsError } = await supabase.from("event_participants")
    .select("id").eq("event_id", eventId).eq("hasil_ukt", "LULUS").limit(5000);
  if (registrationsError || !registrations?.length) redirect("/admin/sertifikat?error=job-empty");
  const { data: certificates, error: certificatesError } = await supabase.from("certificates")
    .select("id").in("event_participant_id", registrations.map((row) => row.id)).eq("status", "DRAFT").order("created_at", { ascending: true }).limit(5000);
  if (certificatesError || !certificates?.length) redirect("/admin/sertifikat?error=job-empty");

  const { data: job, error: jobError } = await supabase.from("generation_jobs").insert({
    event_id: eventId, job_type: "PUBLISH", total_items: certificates.length, requested_by: user.id,
  }).select("id").single();
  if (jobError || !job) redirect("/admin/sertifikat?error=job-save");
  const items = certificates.map((certificate) => ({ job_id: job.id, certificate_id: certificate.id }));
  for (let start = 0; start < items.length; start += 200) {
    const { error } = await supabase.from("generation_job_items").insert(items.slice(start, start + 200));
    if (error) {
      await supabase.from("generation_jobs").delete().eq("id", job.id).eq("requested_by", user.id);
      redirect(error.code === "23505" ? "/admin/sertifikat?error=job-active" : "/admin/sertifikat?error=job-save");
    }
  }
  await supabase.from("audit_logs").insert({ actor_id: user.id, action: "certificate.generation_job_created", entity_type: "generation_job", entity_id: job.id, metadata: { event_id: eventId, total_items: items.length } });
  revalidatePath("/admin/sertifikat");
  redirect(`/admin/sertifikat?job=${job.id}`);
}

export async function createCertificateExportJob(formData: FormData) {
  const { user } = await requireAdmin();
  const eventId = String(formData.get("event_id") ?? "").trim();
  const jobType = String(formData.get("job_type") ?? "").trim();
  if (!eventId || !["ZIP", "PDF_COMBINED"].includes(jobType)) redirect("/admin/sertifikat?error=export-event");
  const supabase = createSupabaseAdminClient();
  const { data: registrations, error: registrationsError } = await supabase.from("event_participants")
    .select("id").eq("event_id", eventId).limit(5000);
  if (registrationsError || !registrations?.length) redirect("/admin/sertifikat?error=export-empty");
  const { data: certificates, error: certificatesError } = await supabase.from("certificates")
    .select("id").in("event_participant_id", registrations.map((row) => row.id)).eq("status", "TERBIT").limit(5000);
  if (certificatesError || !certificates?.length) redirect("/admin/sertifikat?error=export-empty");

  const { data: job, error: jobError } = await supabase.from("generation_jobs").insert({
    event_id: eventId, job_type: jobType as "ZIP" | "PDF_COMBINED", total_items: certificates.length, requested_by: user.id,
  }).select("id").single();
  if (jobError || !job) redirect("/admin/sertifikat?error=export-save");
  const items = certificates.map((certificate) => ({ job_id: job.id, certificate_id: certificate.id }));
  for (let start = 0; start < items.length; start += 200) {
    const { error } = await supabase.from("generation_job_items").insert(items.slice(start, start + 200));
    if (error) {
      await supabase.from("generation_jobs").delete().eq("id", job.id).eq("requested_by", user.id);
      redirect(error.code === "23505" ? "/admin/sertifikat?error=job-active" : "/admin/sertifikat?error=export-save");
    }
  }
  await supabase.from("audit_logs").insert({ actor_id: user.id, action: `certificate.${jobType.toLowerCase()}_job_created`, entity_type: "generation_job", entity_id: job.id, metadata: { event_id: eventId, total_items: items.length } });
  revalidatePath("/admin/sertifikat");
  redirect(`/admin/sertifikat?job=${job.id}`);
}

export async function retryCertificateGenerationJob(formData: FormData) {
  const { user } = await requireAdmin();
  const jobId = String(formData.get("job_id") ?? "").trim();
  const supabase = createSupabaseAdminClient();
  const { data: job } = await supabase.from("generation_jobs").select("id,status,job_type,output_error,output_asset_id").eq("id", jobId).eq("requested_by", user.id).maybeSingle();
  if (!job || !["GAGAL", "SEBAGIAN_GAGAL"].includes(job.status)) redirect("/admin/sertifikat?error=job-state");
  const { data: failedItems } = await supabase.from("generation_job_items").select("id").eq("job_id", jobId).eq("status", "GAGAL");
  const retryArtifact = job.job_type !== "PUBLISH";
  if (!failedItems?.length && !retryArtifact) redirect(`/admin/sertifikat?job=${jobId}`);
  if (failedItems?.length) {
    const { error: retryError } = await supabase.from("generation_job_items").update({ status: "MENUNGGU", error_message: null })
      .eq("job_id", jobId).eq("status", "GAGAL");
    if (retryError) redirect(`/admin/sertifikat?job=${jobId}&error=job-retry`);
  }
  const { data: oldAsset } = retryArtifact && job.output_asset_id
    ? await supabase.from("media_assets").select("id,storage_path").eq("id", job.output_asset_id).maybeSingle()
    : { data: null };
  const { error: resetError } = await supabase.from("generation_jobs").update({
    status: "DIPROSES", failed_items: 0, finished_at: null, output_asset_id: null, output_file_name: null, output_error: null, output_locked_at: null,
  }).eq("id", jobId).eq("requested_by", user.id);
  if (resetError) redirect(`/admin/sertifikat?job=${jobId}&error=job-retry`);
  if (oldAsset) {
    await supabase.storage.from("certificate-assets").remove([oldAsset.storage_path]);
    await supabase.from("media_assets").delete().eq("id", oldAsset.id);
  }
  await supabase.from("audit_logs").insert({ actor_id: user.id, action: "certificate.generation_job_retried", entity_type: "generation_job", entity_id: jobId, metadata: { retried_items: failedItems?.length ?? 0, retried_export: retryArtifact } });
  revalidatePath("/admin/sertifikat");
  redirect(`/admin/sertifikat?job=${jobId}`);
}
