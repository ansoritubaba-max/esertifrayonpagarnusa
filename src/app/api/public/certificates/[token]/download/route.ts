import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { allowPublicVerification } from "@/lib/public-rate-limit";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const clientKey = (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
  if (!await allowPublicVerification(clientKey)) return new Response("Terlalu banyak permintaan. Coba kembali satu menit lagi.", { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{40,48}$/.test(token)) return new Response("Sertifikat tidak ditemukan.", { status: 404 });
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const supabase = createSupabaseAdminClient();
  const { data: certificate } = await supabase.from("certificates").select("id,status,pdf_asset_id,pdf_sha256").eq("verification_token_hash", tokenHash).maybeSingle();
  if (!certificate || certificate.status !== "TERBIT" || !certificate.pdf_asset_id || !certificate.pdf_sha256) {
    await supabase.from("certificate_verifications").insert({ certificate_id: certificate?.id ?? null, result_status: certificate ? "BELUM_TERSEDIA" : "TIDAK_DITEMUKAN" });
    return new Response("PDF sertifikat belum tersedia.", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const { data: asset } = await supabase.from("media_assets").select("storage_path,mime_type,file_size").eq("id", certificate.pdf_asset_id).maybeSingle();
  if (!asset || asset.mime_type !== "application/pdf" || asset.file_size > 10 * 1024 * 1024) {
    await supabase.from("certificate_verifications").insert({ certificate_id: certificate.id, result_status: "BELUM_TERSEDIA" });
    return new Response("PDF sertifikat belum tersedia.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const { data: blob, error } = await supabase.storage.from("certificate-assets").download(asset.storage_path);
  if (error || !blob) {
    await supabase.from("certificate_verifications").insert({ certificate_id: certificate.id, result_status: "BELUM_TERSEDIA" });
    return new Response("PDF sertifikat belum tersedia.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== certificate.pdf_sha256) {
    await supabase.from("certificate_verifications").insert({ certificate_id: certificate.id, result_status: "BELUM_TERSEDIA" });
    return new Response("Integritas PDF tidak dapat diverifikasi.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  await supabase.from("certificate_verifications").insert({ certificate_id: certificate.id, result_status: "VALID" });
  const download = new URL(request.url).searchParams.has("download");
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename=sertifikat-pagar-nusa.pdf`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "frame-ancestors 'self'",
    },
  });
}
