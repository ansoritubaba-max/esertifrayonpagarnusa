import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireAdmin();
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const { data: job } = await supabase.from("generation_jobs").select("status,output_asset_id,output_file_name")
    .eq("id", id).eq("requested_by", user.id).maybeSingle();
  if (!job || !job.output_asset_id || !job.output_file_name || !["BERHASIL", "SEBAGIAN_GAGAL"].includes(job.status)) {
    return NextResponse.json({ error: "File unduhan belum tersedia." }, { status: 404 });
  }
  const { data: asset } = await supabase.from("media_assets").select("storage_path").eq("id", job.output_asset_id).eq("asset_type", "job_export").maybeSingle();
  if (!asset) return NextResponse.json({ error: "File unduhan tidak ditemukan." }, { status: 404 });
  const { data: signed, error } = await supabase.storage.from("certificate-assets").createSignedUrl(asset.storage_path, 60, { download: job.output_file_name });
  if (error || !signed?.signedUrl) return NextResponse.json({ error: "Tautan unduhan gagal dibuat." }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
