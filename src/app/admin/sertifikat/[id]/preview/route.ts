import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { renderCertificatePdf } from "@/lib/certificate-pdf";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const { data: certificate } = await supabase.from("certificates").select("id,status,event_participant_id,template_id").eq("id", id).maybeSingle();
  if (!certificate || certificate.status !== "DRAFT") return new Response("Pratinjau hanya tersedia untuk draft sertifikat.", { status: 404 });
  const { data: registration } = await supabase.from("event_participants").select("id,event_id,participant_id,tingkat_strip,hasil_ukt").eq("id", certificate.event_participant_id).maybeSingle();
  if (!registration || registration.hasil_ukt !== "LULUS") return new Response("Peserta belum memenuhi syarat sertifikat.", { status: 422 });
  const [{ data: participant }, { data: event }, { data: organization }, { data: template }, { data: signers }] = await Promise.all([
    supabase.from("participants").select("nama_lengkap").eq("id", registration.participant_id).maybeSingle(),
    supabase.from("ukt_events").select("nama,lokasi,tanggal_mulai,tanggal_selesai,tanggal_terbit_default").eq("id", registration.event_id).maybeSingle(),
    supabase.from("organization_settings").select("nama_organisasi,nama_rayon,nama_pondok,kota,logo_pn_asset_id,logo_rayon_asset_id,logo_nu_asset_id,watermark_opacity,stempel_asset_id").eq("singleton", true).maybeSingle(),
    supabase.from("certificate_templates").select("nama,config_json").eq("id", certificate.template_id).maybeSingle(),
    supabase.from("signers").select("posisi,nama,jabatan,nomor_sp_kta,signature_asset_id,is_active").order("posisi"),
  ]);
  if (!participant || !event || !template || !registration.tingkat_strip) return new Response("Data sertifikat belum lengkap untuk pratinjau.", { status: 422 });
  const config = template.config_json && typeof template.config_json === "object" && !Array.isArray(template.config_json) ? template.config_json : {};
  const signerData = ["kiri", "kanan"].map((position) => {
    const signer = signers?.find((item) => item.posisi === position);
    return {
      name: signer?.nama || "[Nama penandatangan]",
      title: signer?.jabatan || "[Jabatan]",
      spKtaNumber: signer?.nomor_sp_kta ?? "",
      assetId: signer?.signature_asset_id ?? null,
    };
  });
  try {
    const rendered = await renderCertificatePdf({
      certificateNumber: "DRAFT", verificationUrl: "", issuedAt: formatDate(event.tanggal_terbit_default),
      participantName: participant.nama_lengkap, level: registration.tingkat_strip, eventName: event.nama,
      eventStart: formatDate(event.tanggal_mulai), eventEnd: formatDate(event.tanggal_selesai), eventLocation: event.lokasi,
      organizationName: organization?.nama_organisasi || "Pencak Silat Nahdlatul Ulama Pagar Nusa",
      rayonName: organization?.nama_rayon || "Rayon Al-Amien", schoolName: organization?.nama_pondok ?? null,
      city: organization?.kota ?? "", address: null,
      title: typeof config.title === "string" && config.title.trim() ? config.title.trim() : template.nama,
      body: typeof config.body === "string" && config.body.trim() ? config.body : "Diberikan kepada:\n\n[NAMA PESERTA]\n\nTelah mengikuti dan dinyatakan LULUS dalam Ujian Kenaikan Tingkat Pencak Silat Pagar Nusa.",
      signers: signerData,
      logoAssetIds: [organization?.logo_pn_asset_id, organization?.logo_rayon_asset_id, organization?.logo_nu_asset_id].filter((assetId): assetId is string => Boolean(assetId)),
      watermarkAssetId: organization?.logo_nu_asset_id ?? null,
      watermarkOpacity: organization?.watermark_opacity ?? 0.12,
      stampAssetId: organization?.stempel_asset_id ?? null,
      isDraft: true,
    });
    const pdfBuffer = new ArrayBuffer(rendered.bytes.byteLength);
    new Uint8Array(pdfBuffer).set(rendered.bytes);
    return new Response(pdfBuffer, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=pratinjau-sertifikat-draft.pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response("Pratinjau tidak dapat dibuat. Periksa panjang redaksi dan file aset.", { status: 422 });
  }
}
