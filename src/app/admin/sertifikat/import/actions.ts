"use server";

import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ImportRow = {
  row: number;
  nama_lengkap: string;
  nomor_anggota: string;
  tingkat_strip: string;
  hasil_ukt: "LULUS" | "TIDAK_LULUS" | "";
  catatan: string;
  errors: string[];
  warnings: string[];
};

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("").trim();
    if ("result" in value) return String(value.result ?? "").trim();
    if (value instanceof Date) return value.toISOString();
  }
  return String(value).trim();
}

function headerKey(value: string) {
  return value.toLocaleLowerCase("id-ID").replace(/[\s/_-]+/g, "").replace(/[^a-z0-9]/g, "");
}

function normalizeResult(value: string): ImportRow["hasil_ukt"] {
  const normalized = value.trim().toLocaleUpperCase("id-ID").replace(/[\s-]+/g, "_");
  if (["LULUS", "LOLOS", "YA"].includes(normalized)) return "LULUS";
  if (["TIDAK_LULUS", "TIDAKLOLOS", "TIDAK"].includes(normalized)) return "TIDAK_LULUS";
  return "";
}

export async function previewParticipantImport(formData: FormData) {
  const { user } = await requireAdmin();
  const eventId = String(formData.get("event_id") ?? "").trim();
  const file = formData.get("file");
  if (!eventId || !(file instanceof File) || file.size === 0) redirect("/admin/sertifikat/import?error=required");
  if (file.size > 5 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".xlsx")) redirect("/admin/sertifikat/import?error=file");

  const supabase = createSupabaseAdminClient();
  const { data: event } = await supabase.from("ukt_events").select("id").eq("id", eventId).maybeSingle();
  if (!event) redirect("/admin/sertifikat/import?error=event");
  const { data: activeTemplate } = await supabase.from("certificate_templates").select("config_json").eq("is_active", true).maybeSingle();
  const templateConfig = activeTemplate?.config_json && typeof activeTemplate.config_json === "object" && !Array.isArray(activeTemplate.config_json) ? activeTemplate.config_json : {};
  const configuredLevels = Array.isArray(templateConfig.tingkat_strip_options)
    ? templateConfig.tingkat_strip_options.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const levelByKey = new Map(configuredLevels.map((level) => [level.trim().toLocaleLowerCase("id-ID"), level.trim()]));

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer);
  } catch {
    redirect("/admin/sertifikat/import?error=workbook");
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2 || sheet.rowCount > 501 || sheet.columnCount > 20) redirect("/admin/sertifikat/import?error=rows");
  const headers = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => headers.set(headerKey(cellText(cell.value)), col));
  const columns = {
    nama_lengkap: headers.get("namalengkap"),
    nomor_anggota: headers.get("nomoranggota"),
    tingkat_strip: headers.get("tingkatstrip"),
    hasil_ukt: headers.get("hasilukt"),
    catatan: headers.get("catatan"),
  };
  if (Object.values(columns).some((column) => !column)) redirect("/admin/sertifikat/import?error=headers");

  const rows: ImportRow[] = [];
  sheet.eachRow((excelRow, rowNumber) => {
    if (rowNumber === 1) return;
    const text = (column: number | undefined) => column ? cellText(excelRow.getCell(column).value) : "";
    const name = text(columns.nama_lengkap);
    const memberNumber = text(columns.nomor_anggota);
    const enteredLevel = text(columns.tingkat_strip);
    const level = configuredLevels.length ? levelByKey.get(enteredLevel.toLocaleLowerCase("id-ID")) ?? enteredLevel : enteredLevel;
    const result = normalizeResult(text(columns.hasil_ukt));
    const note = text(columns.catatan);
    if (![name, memberNumber, level, result, note].some(Boolean)) return;
    const errors: string[] = [];
    if (!name) errors.push("Nama lengkap wajib diisi.");
    if (name.length > 180) errors.push("Nama maksimal 180 karakter.");
    if (memberNumber.length > 80) errors.push("Nomor anggota maksimal 80 karakter.");
    if (!level) errors.push("Tingkat/strip wajib diisi.");
    if (level.length > 80) errors.push("Tingkat/strip maksimal 80 karakter.");
    if (configuredLevels.length && enteredLevel && !levelByKey.has(enteredLevel.toLocaleLowerCase("id-ID"))) errors.push("Tingkat/strip tidak ada di daftar pilihan pengaturan template.");
    if (!result) errors.push("Hasil UKT harus LULUS atau TIDAK LULUS.");
    if (note.length > 500) errors.push("Catatan maksimal 500 karakter.");
    rows.push({ row: rowNumber, nama_lengkap: name, nomor_anggota: memberNumber, tingkat_strip: level, hasil_ukt: result, catatan: note, errors, warnings: [] });
  });
  if (!rows.length || rows.length > 500) redirect("/admin/sertifikat/import?error=rows");

  const { data: existingRegistrations } = await supabase.from("event_participants")
    .select("participants(nama_lengkap,nomor_anggota)")
    .eq("event_id", eventId);
  const existingKeys = new Set<string>();
  for (const registration of existingRegistrations ?? []) {
    const person = Array.isArray(registration.participants) ? registration.participants[0] : registration.participants;
    if (person?.nomor_anggota) existingKeys.add(`member:${person.nomor_anggota.trim().toLocaleLowerCase("id-ID")}`);
    if (person?.nama_lengkap) existingKeys.add(`name:${person.nama_lengkap.trim().toLocaleLowerCase("id-ID")}`);
  }
  const seenKeys = new Set<string>();
  for (const row of rows) {
    if (!row.nama_lengkap) continue;
    const keys = [`name:${row.nama_lengkap.trim().toLocaleLowerCase("id-ID")}`];
    if (row.nomor_anggota) keys.push(`member:${row.nomor_anggota.trim().toLocaleLowerCase("id-ID")}`);
    if (keys.some((key) => existingKeys.has(key))) row.errors.push("Peserta terdeteksi sudah terdaftar pada kegiatan ini.");
    else if (keys.some((key) => seenKeys.has(key))) row.errors.push("Duplikat peserta ditemukan di dalam file ini.");
    keys.forEach((key) => seenKeys.add(key));
  }

  await supabase.from("participant_import_previews").delete().lt("expires_at", new Date().toISOString());
  const { data: preview, error } = await supabase.from("participant_import_previews").insert({
    id: randomUUID(), admin_id: user.id, event_id: eventId, rows_json: rows,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }).select("id").single();
  if (error || !preview) redirect("/admin/sertifikat/import?error=schema");
  redirect(`/admin/sertifikat/import?preview=${preview.id}`);
}

export async function confirmParticipantImport(formData: FormData) {
  const { user } = await requireAdmin();
  const previewId = String(formData.get("preview_id") ?? "").trim();
  if (!previewId) redirect("/admin/sertifikat/import?error=preview");
  const supabase = createSupabaseAdminClient();
  const { data: preview, error: previewError } = await supabase.from("participant_import_previews")
    .select("id,event_id,rows_json,expires_at,consumed_at").eq("id", previewId).eq("admin_id", user.id).maybeSingle();
  if (previewError || !preview || new Date(preview.expires_at).getTime() < Date.now()) redirect("/admin/sertifikat/import?error=expired");
  if (preview.consumed_at) redirect("/admin/sertifikat/import?error=consumed");

  const rows = Array.isArray(preview.rows_json) ? preview.rows_json as unknown as ImportRow[] : [];
  const validRows = rows.filter((row) => row.errors.length === 0).map(({ nama_lengkap, nomor_anggota, tingkat_strip, hasil_ukt, catatan }) => ({
    nama_lengkap, nomor_anggota, tingkat_strip, hasil_ukt, catatan,
  }));
  const validRowSource = rows.filter((row) => row.errors.length === 0);
  if (!validRows.length) redirect(`/admin/sertifikat/import?preview=${previewId}&error=none-valid`);
  const { data: claim } = await supabase.from("participant_import_previews").update({ consumed_at: new Date().toISOString() })
    .eq("id", previewId).eq("admin_id", user.id).is("consumed_at", null).select("id").maybeSingle();
  if (!claim) redirect(`/admin/sertifikat/import?preview=${previewId}&error=consumed`);
  const { data: result, error } = await supabase.rpc("import_event_participants", { p_event_id: preview.event_id, p_rows: validRows });
  if (error) {
    await supabase.from("participant_import_previews").update({ consumed_at: null }).eq("id", previewId).eq("admin_id", user.id);
    redirect(`/admin/sertifikat/import?preview=${previewId}&error=schema`);
  }
  const summary = result as { imported?: number; failed?: Array<{ row: number; error: string }> };
  const imported = Number(summary.imported ?? 0);
  const failed = Array.isArray(summary.failed) ? summary.failed.length : 0;
  if (failed && Array.isArray(summary.failed)) {
    const reportRows = rows.map((row) => ({ ...row, errors: [...row.errors] }));
    for (const failure of summary.failed) {
      const source = validRowSource[failure.row - 1];
      const reportRow = reportRows.find((row) => row.row === source?.row);
      if (reportRow) reportRow.errors.push(`Gagal disimpan: ${failure.error}`);
    }
    await supabase.from("participant_import_previews").update({ rows_json: reportRows }).eq("id", previewId).eq("admin_id", user.id);
  }
  await supabase.from("audit_logs").insert({
    actor_id: user.id, action: "participant.imported", entity_type: "ukt_event", entity_id: preview.event_id,
    metadata: { imported, failed, source_rows: rows.length },
  });
  if (!failed) await supabase.from("participant_import_previews").delete().eq("id", previewId).eq("admin_id", user.id);
  revalidatePath("/admin/peserta");
  revalidatePath("/admin/kegiatan");
  revalidatePath("/admin/sertifikat");
  redirect(`/admin/sertifikat/import?success=${imported}&failed=${failed}${failed ? `&preview=${previewId}` : ""}`);
}
