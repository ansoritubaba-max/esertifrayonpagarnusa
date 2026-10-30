"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function readText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createEvent(formData: FormData) {
  const { user } = await requireAdmin();
  const nama = readText(formData, "nama");
  const lokasi = readText(formData, "lokasi");
  const tanggalMulai = readText(formData, "tanggal_mulai");
  const tanggalSelesai = readText(formData, "tanggal_selesai");
  const tanggalTerbit = readText(formData, "tanggal_terbit_default");
  const tanggalTerbitDefault = tanggalTerbit || tanggalSelesai;

  if (!nama || !lokasi || !tanggalMulai || !tanggalSelesai || !tanggalTerbitDefault) {
    redirect("/admin/kegiatan/baru?error=required");
  }
  if (tanggalSelesai < tanggalMulai) redirect("/admin/kegiatan/baru?error=date-range");

  const supabase = createSupabaseAdminClient();
  const { data: event, error } = await supabase.from("ukt_events").insert({
    nama,
    jenis_kegiatan: readText(formData, "jenis_kegiatan") || "UKT",
    lokasi,
    tanggal_mulai: tanggalMulai,
    tanggal_selesai: tanggalSelesai,
    tanggal_terbit_default: tanggalTerbitDefault,
    periode: readText(formData, "periode") || null,
    deskripsi: readText(formData, "deskripsi") || null,
  }).select("id").single();

  if (error || !event) redirect("/admin/kegiatan/baru?error=save");

  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    action: "event.created",
    entity_type: "ukt_event",
    entity_id: event.id,
    metadata: { nama },
  });

  revalidatePath("/admin/kegiatan");
  redirect("/admin/kegiatan?success=created");
}

export async function updateEventStatus(formData: FormData) {
  const { user } = await requireAdmin();
  const id = readText(formData, "event_id");
  const status = readText(formData, "status");
  if (!id || !["DRAFT", "SELESAI"].includes(status)) redirect("/admin/kegiatan?error=invalid");

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("ukt_events").update({ status: status as "DRAFT" | "SELESAI" }).eq("id", id).select("id").maybeSingle();
  if (error || !data) redirect("/admin/kegiatan?error=save");

  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    action: "event.status_updated",
    entity_type: "ukt_event",
    entity_id: id,
    metadata: { status },
  });
  revalidatePath("/admin/kegiatan");
  redirect("/admin/kegiatan?success=updated");
}

export async function updateEvent(formData: FormData) {
  const { user } = await requireAdmin();
  const read = (key: string) => String(formData.get(key) ?? "").trim();
  const id = read("event_id");
  const nama = read("nama");
  const lokasi = read("lokasi");
  const tanggalMulai = read("tanggal_mulai");
  const tanggalSelesai = read("tanggal_selesai");
  const tanggalTerbit = read("tanggal_terbit_default");
  if (!id || !nama || !lokasi || !tanggalMulai || !tanggalSelesai || !tanggalTerbit || tanggalSelesai < tanggalMulai) redirect(`/admin/kegiatan/${id}?error=invalid`);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("ukt_events").update({
    nama,
    jenis_kegiatan: read("jenis_kegiatan") || "UKT",
    lokasi,
    tanggal_mulai: tanggalMulai,
    tanggal_selesai: tanggalSelesai,
    tanggal_terbit_default: tanggalTerbit,
    periode: read("periode") || null,
    deskripsi: read("deskripsi") || null,
  }).eq("id", id).select("id").maybeSingle();
  if (error || !data) redirect(`/admin/kegiatan/${id}?error=save`);
  await supabase.from("audit_logs").insert({ actor_id: user.id, action: "event.updated", entity_type: "ukt_event", entity_id: id, metadata: { nama } });
  revalidatePath("/admin/kegiatan");
  revalidatePath(`/admin/kegiatan/${id}`);
  redirect(`/admin/kegiatan/${id}?success=saved`);
}
