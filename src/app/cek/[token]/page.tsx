import type { Metadata } from "next";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BrandLogo } from "@/components/brand-logo";
import { allowPublicVerification } from "@/lib/public-rate-limit";

export const metadata: Metadata = { title: "Verifikasi Sertifikat | Pagar Nusa", robots: { index: false, follow: false } };

type Snapshot = Record<string, unknown>;
type VerificationState = "VALID" | "DICABUT" | "TIDAK_DITEMUKAN" | "BELUM_TERSEDIA" | "LIMIT";

function text(snapshot: Snapshot, key: string) {
  return typeof snapshot[key] === "string" ? snapshot[key] as string : "";
}

function publicDate(value: string) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" }).format(date);
}

export default async function VerifyCertificatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const requestHeaders = await headers();
  const key = (requestHeaders.get("x-forwarded-for") || requestHeaders.get("x-real-ip") || "unknown").split(",")[0].trim();
  if (!await allowPublicVerification(key)) return <VerificationResult status="LIMIT" />;

  const supabase = createSupabaseAdminClient();
  const validFormat = /^[A-Za-z0-9_-]{40,48}$/.test(token);
  const tokenHash = validFormat ? createHash("sha256").update(token).digest("hex") : "";
  const { data: certificate } = tokenHash
    ? await supabase.from("certificates").select("id,status,nomor_sertifikat,verification_token_hash,data_snapshot,signer_snapshot,pdf_asset_id,pdf_sha256,issued_at,revocation_reason").eq("verification_token_hash", tokenHash).maybeSingle()
    : { data: null };
  let status: VerificationState = "TIDAK_DITEMUKAN";
  if (certificate?.status === "DICABUT") status = "DICABUT";
  else if (certificate?.status === "TERBIT" && certificate.pdf_asset_id && certificate.pdf_sha256) {
    const { data: asset } = await supabase.from("media_assets").select("storage_path,mime_type,file_size").eq("id", certificate.pdf_asset_id).maybeSingle();
    if (asset?.mime_type === "application/pdf" && asset.file_size <= 10 * 1024 * 1024) {
      const { data: pdfBlob, error: pdfError } = await supabase.storage.from("certificate-assets").download(asset.storage_path);
      if (pdfBlob && !pdfError) {
        const pdfHash = createHash("sha256").update(new Uint8Array(await pdfBlob.arrayBuffer())).digest("hex");
        status = pdfHash === certificate.pdf_sha256 ? "VALID" : "BELUM_TERSEDIA";
      } else status = "BELUM_TERSEDIA";
    } else status = "BELUM_TERSEDIA";
  } else if (certificate?.status === "TERBIT") status = "BELUM_TERSEDIA";
  if (certificate) await supabase.from("certificate_verifications").insert({ certificate_id: certificate.id, result_status: status });
  else await supabase.from("certificate_verifications").insert({ certificate_id: null, result_status: "TIDAK_DITEMUKAN" });

  const snapshot = certificate?.data_snapshot && typeof certificate.data_snapshot === "object" && !Array.isArray(certificate.data_snapshot) ? certificate.data_snapshot as Snapshot : {};
  const signerSnapshot = Array.isArray(certificate?.signer_snapshot) ? certificate.signer_snapshot as Snapshot[] : [];
  return <VerificationResult
    status={status}
    number={certificate?.nomor_sertifikat ?? ""}
    name={text(snapshot, "nama_lengkap")}
    event={text(snapshot, "event_nama")}
    level={text(snapshot, "tingkat_strip")}
    eventDate={text(snapshot, "tanggal_mulai") === text(snapshot, "tanggal_selesai") ? publicDate(text(snapshot, "tanggal_mulai")) : `${publicDate(text(snapshot, "tanggal_mulai"))} – ${publicDate(text(snapshot, "tanggal_selesai"))}`}
    issuedAt={publicDate(text(snapshot, "tanggal_terbit"))}
    organization={text(snapshot, "nama_organisasi")}
    rayon={text(snapshot, "nama_rayon")}
    signers={signerSnapshot.map((signer) => ({ name: text(signer, "nama"), title: text(signer, "jabatan"), spKtaNumber: text(signer, "nomor_sp_kta") })).filter((signer) => signer.name)}
    reason={certificate?.revocation_reason ?? ""}
    downloadPath={status === "VALID" ? `/api/public/certificates/${token}/download` : ""}
  />;
}

function VerificationResult({ status, number = "", name = "", event = "", level = "", eventDate = "", issuedAt = "", organization = "", rayon = "", signers = [], reason = "", downloadPath = "" }: {
  status: VerificationState;
  number?: string; name?: string; event?: string; level?: string; eventDate?: string; issuedAt?: string;
  organization?: string; rayon?: string; signers?: Array<{ name: string; title: string; spKtaNumber: string }>; reason?: string; downloadPath?: string;
}) {
  const statusLabel = status === "VALID" ? "Sertifikat valid" : status === "DICABUT" ? "Sertifikat dicabut" : status === "BELUM_TERSEDIA" ? "Sertifikat belum tersedia" : status === "LIMIT" ? "Terlalu banyak permintaan" : "Sertifikat tidak ditemukan";
  const statusCopy = status === "VALID" ? "Data sertifikat cocok dengan catatan resmi penerbit." : status === "DICABUT" ? "Sertifikat ini pernah diterbitkan, tetapi sudah tidak berlaku." : status === "BELUM_TERSEDIA" ? "Dokumen final belum dapat diperiksa. Silakan coba kembali nanti." : status === "LIMIT" ? "Pemeriksaan sementara dibatasi. Silakan tunggu satu menit lalu coba kembali." : "Token verifikasi tidak cocok dengan sertifikat yang diterbitkan.";
  return <main className="verification-page"><section className="verification-card">
    <div className="verification-brand"><BrandLogo className="brand-mark" /><div><strong>{organization || "Pagar Nusa"}</strong><small>{rayon || "Verifikasi sertifikat resmi"}</small></div></div>
    <div className={`verification-status verification-${status.toLowerCase()}`}><span aria-hidden="true">{status === "VALID" ? "✓" : status === "DICABUT" ? "!" : "?"}</span><div><h1>{statusLabel}</h1><p>{statusCopy}</p></div></div>
    {status === "DICABUT" && reason && <p className="verification-reason"><strong>Alasan:</strong> {reason.slice(0, 220)}</p>}
    {status === "VALID" && <>
      <dl className="verification-details"><div><dt>Nomor sertifikat</dt><dd>{number}</dd></div><div><dt>Nama pemegang</dt><dd>{name}</dd></div><div><dt>Kegiatan</dt><dd>{event}</dd></div><div><dt>Tingkat / strip</dt><dd>{level}</dd></div><div><dt>Tanggal UKT</dt><dd>{eventDate}</dd></div><div><dt>Tanggal terbit</dt><dd>{issuedAt}</dd></div></dl>
      {!!signers.length && <div className="verification-signers"><h2>Penandatangan</h2><ul>{signers.map((signer) => <li key={`${signer.title}-${signer.name}`}><strong>{signer.name}</strong><span>{signer.title}</span>{signer.spKtaNumber && <small>No. SP/KTA: {signer.spKtaNumber}</small>}</li>)}</ul></div>}
      <div className="verification-preview"><h2>Pratinjau sertifikat</h2><iframe title="Pratinjau sertifikat PDF" src={`${downloadPath}?inline=1`} /></div>
      <a className="button button-primary verification-download" href={`${downloadPath}?download=1`}>Unduh PDF sertifikat</a>
    </>}
    <p className="verification-footnote">Pemeriksaan ini membaca data resmi dari penerbit. Nomor anggota dan data pribadi lain tidak ditampilkan.</p>
  </section></main>;
}
