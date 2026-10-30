import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { issueCertificateRecord } from "@/lib/issue-certificate";
import { buildGenerationJobExport } from "@/lib/generation-job-export";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  const protocol = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "");
  let originMatches = false;
  try { originMatches = Boolean(origin) && new URL(origin!).origin === `${protocol}://${host}`; } catch { originMatches = false; }
  if (!originMatches) {
    return NextResponse.json({ error: "Permintaan lintas situs ditolak." }, { status: 403 });
  }
  const { user } = await requireAdmin();
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const { data: job } = await supabase.from("generation_jobs").select("id,status,job_type,requested_by")
    .eq("id", id).eq("requested_by", user.id).maybeSingle();
  if (!job || !["MENUNGGU", "DIPROSES"].includes(job.status)) {
    return NextResponse.json({ error: "Job tidak ditemukan atau sudah selesai." }, { status: 404 });
  }

  const { data: candidate } = await supabase.from("generation_job_items").select("id,certificate_id,attempts")
    .eq("job_id", id).eq("status", "MENUNGGU").order("updated_at", { ascending: true }).limit(1).maybeSingle();
  if (candidate) {
    const { data: claimed } = await supabase.from("generation_job_items").update({ status: "DIPROSES", attempts: candidate.attempts + 1 })
      .eq("id", candidate.id).eq("status", "MENUNGGU").select("id,certificate_id").maybeSingle();
    if (claimed) {
      let result: { ok: boolean; error?: string };
      if (!claimed.certificate_id) {
        result = { ok: false, error: "Item job tidak terhubung ke sertifikat." };
      } else if (job.job_type === "PUBLISH") {
        result = await issueCertificateRecord(claimed.certificate_id, user.id);
      } else {
        const { data: certificate } = await supabase.from("certificates").select("status,pdf_asset_id").eq("id", claimed.certificate_id).maybeSingle();
        const { data: asset } = certificate?.pdf_asset_id
          ? await supabase.from("media_assets").select("storage_path,mime_type").eq("id", certificate.pdf_asset_id).maybeSingle()
          : { data: null };
        if (certificate?.status !== "TERBIT" || asset?.mime_type !== "application/pdf") {
          result = { ok: false, error: "PDF final sertifikat tidak ditemukan." };
        } else {
          const { data: file, error: fileError } = await supabase.storage.from("certificate-assets").download(asset.storage_path);
          result = file && !fileError ? { ok: true } : { ok: false, error: "PDF final tidak dapat dibaca dari penyimpanan." };
        }
      }
      const errorMessage = result.ok ? null : job.job_type === "PUBLISH" && result.error === "incomplete" ? "Lengkapi pengaturan organisasi dan penandatangan." : job.job_type === "PUBLISH" && result.error === "not-eligible" ? "Peserta tidak lagi memenuhi syarat penerbitan." : result.error || "PDF gagal dibuat atau disimpan. Periksa konfigurasi dan coba lagi.";
      await supabase.from("generation_job_items").update({ status: result.ok ? "BERHASIL" : "GAGAL", error_message: errorMessage })
        .eq("id", claimed.id).eq("status", "DIPROSES");
    }
  }

  const { data: items } = await supabase.from("generation_job_items").select("status").eq("job_id", id).limit(5000);
  const rows = items ?? [];
  const completed = rows.filter((item) => item.status === "BERHASIL").length;
  const failed = rows.filter((item) => item.status === "GAGAL").length;
  const active = rows.some((item) => item.status === "MENUNGGU" || item.status === "DIPROSES");
  const status = active ? "DIPROSES" : failed && completed ? "SEBAGIAN_GAGAL" : failed ? "GAGAL" : "BERHASIL";
  if (active || job.job_type === "PUBLISH") {
    await supabase.from("generation_jobs").update({ status, completed_items: completed, failed_items: failed, finished_at: active ? null : new Date().toISOString() }).eq("id", id).eq("requested_by", user.id);
    return NextResponse.json({ processed: Boolean(candidate), status });
  }

  const { data: claimedExport, error: claimExportError } = await supabase.rpc("claim_generation_job_export", { p_job_id: id });
  if (claimExportError) {
    await supabase.from("generation_jobs").update({
      status: failed && completed ? "SEBAGIAN_GAGAL" : "GAGAL", completed_items: completed, failed_items: failed,
      output_error: "Migrasi ekspor belum diterapkan di Supabase.", finished_at: new Date().toISOString(),
    }).eq("id", id).eq("requested_by", user.id);
    return NextResponse.json({ processed: Boolean(candidate), status: "GAGAL" });
  }
  if (claimedExport) {
    try {
      const output = await buildGenerationJobExport(id, job.job_type as "ZIP" | "PDF_COMBINED");
      const finalStatus = failed && completed ? "SEBAGIAN_GAGAL" : failed ? "GAGAL" : "BERHASIL";
      await supabase.from("generation_jobs").update({
        status: finalStatus, completed_items: completed, failed_items: failed,
        output_asset_id: output.assetId, output_file_name: output.fileName, output_error: null,
        output_locked_at: null, finished_at: new Date().toISOString(),
      }).eq("id", id).eq("requested_by", user.id);
    } catch {
      await supabase.rpc("release_generation_job_export", { p_job_id: id });
      await supabase.from("generation_jobs").update({
        status: failed && completed ? "SEBAGIAN_GAGAL" : "GAGAL", completed_items: completed, failed_items: failed,
        output_error: "File unduhan gagal dibuat. Coba ulang proses ini.", finished_at: new Date().toISOString(),
      }).eq("id", id).eq("requested_by", user.id);
    }
  }
  return NextResponse.json({ processed: Boolean(candidate), status: "DIPROSES" });
}
