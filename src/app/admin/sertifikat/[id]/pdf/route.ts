import { createHash } from "node:crypto";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const { data: certificate } = await supabase.from("certificates").select("status,pdf_asset_id,pdf_sha256,nomor_sertifikat").eq("id", id).maybeSingle();
  if (!certificate || !["TERBIT", "DICABUT"].includes(certificate.status) || !certificate.pdf_asset_id || !certificate.pdf_sha256) return new Response("PDF sertifikat tidak tersedia.", { status: 404 });
  const { data: asset } = await supabase.from("media_assets").select("storage_path,mime_type,file_size").eq("id", certificate.pdf_asset_id).maybeSingle();
  if (!asset || asset.mime_type !== "application/pdf" || asset.file_size > 10 * 1024 * 1024) return new Response("PDF sertifikat tidak tersedia.", { status: 404 });
  const { data: blob, error } = await supabase.storage.from("certificate-assets").download(asset.storage_path);
  if (error || !blob) return new Response("PDF sertifikat tidak tersedia.", { status: 404 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== certificate.pdf_sha256) return new Response("Integritas PDF tidak dapat diverifikasi.", { status: 503 });
  const number = (certificate.nomor_sertifikat ?? "sertifikat").replace(/[^a-zA-Z0-9-_]/g, "-");
  return new Response(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename=${number}.pdf`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
