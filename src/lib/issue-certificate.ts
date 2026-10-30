import "server-only";
import { headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { renderCertificatePdf } from "@/lib/certificate-pdf";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

async function publicOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") || "http";
  if (!host) throw new Error("Domain aplikasi belum dikonfigurasi.");
  return `${protocol}://${host}`;
}

export type IssueCertificateResult = { ok: true; certificateNumber: string } | { ok: false; error: string };

export async function issueCertificateRecord(certificateId: string, actorId: string): Promise<IssueCertificateResult> {
  const supabase = createSupabaseAdminClient();
  const { data: claimed, error: claimError } = await supabase.rpc("claim_certificate_issue", { p_certificate_id: certificateId });
  if (claimError || claimed !== true) return { ok: false, error: "issue-state" };
  try {
    const result = await issueClaimedCertificate(certificateId, actorId, supabase);
    if (!result.ok) await supabase.rpc("release_certificate_issue", { p_certificate_id: certificateId });
    return result;
  } catch {
    await supabase.rpc("release_certificate_issue", { p_certificate_id: certificateId });
    return { ok: false, error: "pdf" };
  }
}

async function issueClaimedCertificate(certificateId: string, actorId: string, supabase: ReturnType<typeof createSupabaseAdminClient>): Promise<IssueCertificateResult> {
  const { data: certificate } = await supabase.from("certificates").select("id,status,event_participant_id,template_id").eq("id", certificateId).maybeSingle();
  if (!certificate || certificate.status !== "DRAFT") return { ok: false, error: "issue-state" };
  const { data: registration } = await supabase.from("event_participants").select("id,event_id,participant_id,tingkat_strip,hasil_ukt").eq("id", certificate.event_participant_id).maybeSingle();
  if (!registration || registration.hasil_ukt !== "LULUS") return { ok: false, error: "not-eligible" };
  const [{ data: participant }, { data: event }, { data: organization }, { data: template }, { data: signers }] = await Promise.all([
    supabase.from("participants").select("id,nama_lengkap").eq("id", registration.participant_id).maybeSingle(),
    supabase.from("ukt_events").select("id,nama,lokasi,tanggal_mulai,tanggal_selesai,tanggal_terbit_default").eq("id", registration.event_id).maybeSingle(),
    supabase.from("organization_settings").select("nama_organisasi,nama_rayon,nama_pondok,alamat,kota,prefix_nomor,logo_pn_asset_id,logo_rayon_asset_id,logo_nu_asset_id,watermark_opacity,stempel_asset_id").eq("singleton", true).maybeSingle(),
    supabase.from("certificate_templates").select("nama,config_json").eq("id", certificate.template_id).maybeSingle(),
    supabase.from("signers").select("posisi,nama,jabatan,nomor_sp_kta,signature_asset_id,is_active").eq("is_active", true),
  ]);
  const left = signers?.find((signer) => signer.posisi === "kiri");
  const right = signers?.find((signer) => signer.posisi === "kanan");
  if (!participant?.nama_lengkap || !event || !organization || !template || !registration.tingkat_strip || !left?.nama || !left.jabatan || !left.signature_asset_id || !right?.nama || !right.jabatan || !right.signature_asset_id) {
    return { ok: false, error: "incomplete" };
  }

  let origin: string;
  try { origin = await publicOrigin(); } catch { return { ok: false, error: "site-url" }; }
  const prefix = organization.prefix_nomor.trim().replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "").toUpperCase();
  if (!prefix) return { ok: false, error: "number-prefix" };
  const year = event.tanggal_terbit_default.slice(0, 4);
  const { data: sequence, error: sequenceError } = await supabase.rpc("reserve_certificate_number", { p_scope_key: `${prefix}-${year}` });
  if (sequenceError || typeof sequence !== "number") return { ok: false, error: "schema" };
  const certificateNumber = `${prefix}/${year}/${String(sequence).padStart(4, "0")}`;
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const issuedAt = new Date().toISOString();
  const config = template.config_json && typeof template.config_json === "object" && !Array.isArray(template.config_json) ? template.config_json : {};
  const dataSnapshot = {
    nama_lengkap: participant.nama_lengkap,
    tingkat_strip: registration.tingkat_strip,
    event_nama: event.nama,
    tanggal_mulai: event.tanggal_mulai,
    tanggal_selesai: event.tanggal_selesai,
    tanggal_terbit: organization.kota ? `${formatDate(event.tanggal_terbit_default)}, ${organization.kota}` : formatDate(event.tanggal_terbit_default),
    lokasi: event.lokasi,
    nama_organisasi: organization.nama_organisasi,
    nama_rayon: organization.nama_rayon,
    nama_pondok: organization.nama_pondok,
    certificate_number: certificateNumber,
  };
  const signerSnapshot = [left, right].map((signer) => ({ posisi: signer.posisi, nama: signer.nama, jabatan: signer.jabatan, nomor_sp_kta: signer.nomor_sp_kta, signature_asset_id: signer.signature_asset_id }));
  const logoAssetIds = [organization.logo_pn_asset_id, organization.logo_rayon_asset_id, organization.logo_nu_asset_id].filter((assetId): assetId is string => Boolean(assetId));
  const mediaSnapshot = { logo_asset_ids: logoAssetIds, stamp_asset_id: organization.stempel_asset_id, signature_asset_ids: [left.signature_asset_id, right.signature_asset_id] };

  let pdfBytes: Uint8Array;
  let pdfSha256: string;
  try {
    const rendered = await renderCertificatePdf({
      certificateNumber, verificationUrl: `${origin}/cek/${token}`, issuedAt: formatDate(event.tanggal_terbit_default),
      participantName: participant.nama_lengkap, level: registration.tingkat_strip, eventName: event.nama,
      eventStart: formatDate(event.tanggal_mulai), eventEnd: formatDate(event.tanggal_selesai), eventLocation: event.lokasi,
      organizationName: organization.nama_organisasi, rayonName: organization.nama_rayon, schoolName: organization.nama_pondok,
      city: organization.kota, address: organization.alamat,
      title: typeof config.title === "string" && config.title.trim() ? config.title.trim() : template.nama,
      body: typeof config.body === "string" && config.body.trim() ? config.body : "Diberikan kepada:\n\n[NAMA PESERTA]\n\nTelah mengikuti dan dinyatakan LULUS dalam Ujian Kenaikan Tingkat Pencak Silat Pagar Nusa.",
      signers: signerSnapshot.map((signer) => ({ name: signer.nama, title: signer.jabatan, spKtaNumber: signer.nomor_sp_kta, assetId: signer.signature_asset_id })),
      logoAssetIds, stampAssetId: organization.stempel_asset_id,
      watermarkAssetId: organization.logo_nu_asset_id,
      watermarkOpacity: organization.watermark_opacity,
    });
    pdfBytes = rendered.bytes;
    pdfSha256 = rendered.sha256;
  } catch {
    return { ok: false, error: "pdf" };
  }

  const storagePath = `certificates/${event.id}/${certificateId}.pdf`;
  await supabase.storage.from("certificate-assets").remove([storagePath]);
  const { error: uploadError } = await supabase.storage.from("certificate-assets").upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) return { ok: false, error: "storage" };
  const { data: pdfAsset, error: assetError } = await supabase.from("media_assets").insert({
    storage_path: storagePath, mime_type: "application/pdf", file_size: pdfBytes.byteLength, asset_type: "certificate_pdf", checksum: pdfSha256,
  }).select("id").single();
  if (assetError || !pdfAsset) {
    await supabase.storage.from("certificate-assets").remove([storagePath]);
    return { ok: false, error: "storage" };
  }
  const { data: issued, error: issueError } = await supabase.from("certificates").update({
    nomor_sertifikat: certificateNumber, verification_token_hash: tokenHash, status: "TERBIT", issued_at: issuedAt,
    issue_locked_at: null,
    data_snapshot: dataSnapshot, signer_snapshot: signerSnapshot, media_snapshot: mediaSnapshot,
    pdf_asset_id: pdfAsset.id, pdf_sha256: pdfSha256,
  }).eq("id", certificateId).eq("status", "DRAFT").select("id").maybeSingle();
  if (issueError || !issued) {
    await supabase.from("media_assets").delete().eq("id", pdfAsset.id);
    await supabase.storage.from("certificate-assets").remove([storagePath]);
    return { ok: false, error: "issue-state" };
  }
  await supabase.from("audit_logs").insert({ actor_id: actorId, action: "certificate.issued", entity_type: "certificate", entity_id: certificateId, metadata: { certificate_number: certificateNumber, pdf_sha256: pdfSha256 } });
  return { ok: true, certificateNumber };
}
