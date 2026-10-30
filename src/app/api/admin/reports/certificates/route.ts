import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE = 1000;
const MAX_ROWS = 50000;

export async function GET(request: Request) {
  await requireAdmin();
  const eventId = new URL(request.url).searchParams.get("event_id")?.trim() ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) {
    return NextResponse.json({ error: "Pilih kegiatan UKT yang valid." }, { status: 400 });
  }
  const supabase = createSupabaseAdminClient();
  const { data: event, error: eventError } = await supabase.from("ukt_events").select("id,nama,tanggal_mulai,tanggal_selesai")
    .eq("id", eventId).maybeSingle();
  if (eventError || !event) return NextResponse.json({ error: "Kegiatan UKT tidak ditemukan." }, { status: 404 });

  const registrations: { id: string; participant_id: string; tingkat_strip: string; hasil_ukt: string; created_at: string }[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from("event_participants")
      .select("id,participant_id,tingkat_strip,hasil_ukt,created_at")
      .eq("event_id", eventId).order("created_at", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (error) return NextResponse.json({ error: "Data peserta gagal dimuat untuk laporan." }, { status: 500 });
    registrations.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) break;
  }
  if (registrations.length === MAX_ROWS) return NextResponse.json({ error: "Laporan melebihi batas 50.000 peserta. Saring data kegiatan terlebih dahulu." }, { status: 413 });

  const participants = new Map<string, { nama_lengkap: string; nomor_anggota: string | null }>();
  const participantIds = [...new Set(registrations.map((registration) => registration.participant_id))];
  for (let offset = 0; offset < participantIds.length; offset += 250) {
    const { data, error } = await supabase.from("participants").select("id,nama_lengkap,nomor_anggota").in("id", participantIds.slice(offset, offset + 250));
    if (error) return NextResponse.json({ error: "Data identitas peserta gagal dimuat untuk laporan." }, { status: 500 });
    for (const participant of data ?? []) participants.set(participant.id, participant);
  }

  const certificates: { event_participant_id: string; nomor_sertifikat: string | null; status: string; issued_at: string | null; revoked_at: string | null; revocation_reason: string | null }[] = [];
  const registrationIds = registrations.map((registration) => registration.id);
  for (let offset = 0; offset < registrationIds.length; offset += 250) {
    const { data, error } = await supabase.from("certificates")
      .select("event_participant_id,nomor_sertifikat,status,issued_at,revoked_at,revocation_reason")
      .in("event_participant_id", registrationIds.slice(offset, offset + 250)).order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: "Riwayat sertifikat gagal dimuat untuk laporan." }, { status: 500 });
    certificates.push(...(data ?? []));
  }
  const newestCertificate = new Map<string, (typeof certificates)[number]>();
  for (const certificate of certificates) {
    if (!newestCertificate.has(certificate.event_participant_id)) newestCertificate.set(certificate.event_participant_id, certificate);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "E-Sertifikat Digital Pagar Nusa";
  workbook.subject = `Laporan sertifikat ${event.nama}`;
  const sheet = workbook.addWorksheet("Peserta dan Sertifikat", { views: [{ state: "frozen", ySplit: 4 }] });
  sheet.columns = [
    { header: "No", key: "no", width: 8 },
    { header: "Nama Peserta", key: "name", width: 32 },
    { header: "Nomor Anggota", key: "member", width: 20 },
    { header: "Tingkat Strip", key: "level", width: 20 },
    { header: "Hasil UKT", key: "result", width: 18 },
    { header: "Status Sertifikat", key: "status", width: 22 },
    { header: "Nomor Sertifikat", key: "certificate", width: 28 },
    { header: "Tanggal Terbit", key: "issued", width: 22 },
    { header: "Tanggal Pencabutan", key: "revoked", width: 22 },
    { header: "Alasan Pencabutan", key: "reason", width: 40 },
  ];
  sheet.mergeCells("A1:J1");
  sheet.getCell("A1").value = "LAPORAN PESERTA DAN SERTIFIKAT";
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF174B39" } };
  sheet.mergeCells("A2:J2");
  sheet.getCell("A2").value = event.nama;
  sheet.getCell("A2").font = { bold: true, size: 12 };
  sheet.mergeCells("A3:J3");
  sheet.getCell("A3").value = `Periode ${event.tanggal_mulai} sampai ${event.tanggal_selesai} · ${registrations.length} peserta`;
  sheet.getRow(4).values = ["No", "Nama Peserta", "Nomor Anggota", "Tingkat Strip", "Hasil UKT", "Status Sertifikat", "Nomor Sertifikat", "Tanggal Terbit", "Tanggal Pencabutan", "Alasan Pencabutan"];
  sheet.getRow(4).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF174B39" } };
  sheet.getRow(4).alignment = { vertical: "middle", wrapText: true };
  registrations.forEach((registration, index) => {
    const participant = participants.get(registration.participant_id);
    const certificate = newestCertificate.get(registration.id);
    sheet.addRow({
      no: index + 1,
      name: participant?.nama_lengkap ?? "",
      member: participant?.nomor_anggota ?? "",
      level: registration.tingkat_strip,
      result: registration.hasil_ukt === "LULUS" ? "Lulus" : "Tidak lulus",
      status: certificate ? certificate.status === "TERBIT" ? "Terbit" : certificate.status === "DICABUT" ? "Dicabut" : "Draft" : "Belum dibuat",
      certificate: certificate?.nomor_sertifikat ?? "",
      issued: certificate?.issued_at ? new Date(certificate.issued_at) : "",
      revoked: certificate?.revoked_at ? new Date(certificate.revoked_at) : "",
      reason: certificate?.revocation_reason ?? "",
    });
  });
  sheet.getColumn("issued").numFmt = "dd mmm yyyy hh:mm";
  sheet.getColumn("revoked").numFmt = "dd mmm yyyy hh:mm";
  sheet.autoFilter = { from: "A4", to: "J4" };
  const bytes = await workbook.xlsx.writeBuffer();
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes as unknown as Uint8Array);
  const fileName = `laporan-sertifikat-${eventId}.xlsx`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
