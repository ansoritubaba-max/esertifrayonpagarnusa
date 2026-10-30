"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { issueCertificateRecord } from "@/lib/issue-certificate";

export async function createCertificateDraft(formData: FormData) {
  const { user } = await requireAdmin();
  const eventParticipantId = String(formData.get("event_participant_id") ?? "").trim();
  const replacementOfId = String(formData.get("replacement_of_id") ?? "").trim();
  if (!eventParticipantId) redirect("/admin/sertifikat?error=required");

  const supabase = createSupabaseAdminClient();
  const [{ data: eventParticipant }, { data: template }] = await Promise.all([
    supabase.from("event_participants").select("id,hasil_ukt").eq("id", eventParticipantId).maybeSingle(),
    supabase.from("certificate_templates").select("id").eq("is_active", true).maybeSingle(),
  ]);
  if (!eventParticipant || eventParticipant.hasil_ukt !== "LULUS") redirect("/admin/sertifikat?error=not-eligible");
  if (!template) redirect("/admin/sertifikat?error=no-template");

  if (replacementOfId) {
    const { data: oldCertificate } = await supabase.from("certificates").select("id,event_participant_id,status").eq("id", replacementOfId).maybeSingle();
    if (!oldCertificate || oldCertificate.status !== "DICABUT" || oldCertificate.event_participant_id !== eventParticipantId) redirect("/admin/sertifikat?error=replacement");
  }

  const { data: existing } = await supabase.from("certificates").select("id,status").eq("event_participant_id", eventParticipantId).neq("status", "DICABUT").maybeSingle();
  if (existing) redirect("/admin/sertifikat?error=exists");

  const { data: certificate, error } = await supabase.from("certificates").insert({ event_participant_id: eventParticipantId, template_id: template.id, replacement_of_id: replacementOfId || null }).select("id").single();
  if (error || !certificate) redirect("/admin/sertifikat?error=save");
  await supabase.from("audit_logs").insert({ actor_id: user.id, action: "certificate.draft_created", entity_type: "certificate", entity_id: certificate.id, metadata: { event_participant_id: eventParticipantId } });
  revalidatePath("/admin/sertifikat");
  revalidatePath("/admin");
  redirect("/admin/sertifikat?success=draft");
}

export async function revokeCertificate(formData: FormData) {
  const { user } = await requireAdmin();
  const certificateId = String(formData.get("certificate_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!certificateId || reason.length < 5 || reason.length > 500) redirect("/admin/sertifikat?error=revocation-reason");

  const supabase = createSupabaseAdminClient();
  const { data: certificate, error: queryError } = await supabase.from("certificates").select("id,status").eq("id", certificateId).maybeSingle();
  if (queryError || !certificate || certificate.status !== "TERBIT") redirect("/admin/sertifikat?error=revocation-state");
  const { data: revoked, error } = await supabase.from("certificates").update({ status: "DICABUT", revoked_at: new Date().toISOString(), revocation_reason: reason }).eq("id", certificateId).eq("status", "TERBIT").select("id").maybeSingle();
  if (error || !revoked) redirect("/admin/sertifikat?error=save");
  await supabase.from("audit_logs").insert({ actor_id: user.id, action: "certificate.revoked", entity_type: "certificate", entity_id: certificateId, metadata: { reason } });
  revalidatePath("/admin/sertifikat");
  revalidatePath("/admin");
  redirect("/admin/sertifikat?success=revoked");
}

export async function issueCertificate(formData: FormData) {
  const { user } = await requireAdmin();
  const certificateId = String(formData.get("certificate_id") ?? "").trim();
  if (!certificateId) redirect("/admin/sertifikat?error=required");
  const result = await issueCertificateRecord(certificateId, user.id);
  if (!result.ok) redirect(`/admin/sertifikat?error=${result.error}`);
  revalidatePath("/admin/sertifikat");
  revalidatePath("/admin");
  redirect("/admin/sertifikat?success=issued");
}
