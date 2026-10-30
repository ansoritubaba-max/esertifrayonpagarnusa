"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function value(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createEventParticipant(formData: FormData) {
  const { user } = await requireAdmin();
  const eventId = value(formData, "event_id");
  const name = value(formData, "nama_lengkap");
  const memberNumber = value(formData, "nomor_anggota");
  const level = value(formData, "tingkat_strip");
  const result = value(formData, "hasil_ukt");
  if (!eventId || !name || !level || !["LULUS", "TIDAK_LULUS"].includes(result)) redirect("/admin/peserta?error=required");

  const supabase = createSupabaseAdminClient();
  const { data: participant, error: participantError } = await supabase.from("participants").insert({
    nama_lengkap: name,
    nomor_anggota: memberNumber || null,
  }).select("id").single();
  if (participantError || !participant) redirect("/admin/peserta?error=save");

  const { data: eventParticipant, error: linkError } = await supabase.from("event_participants").insert({
    event_id: eventId,
    participant_id: participant.id,
    tingkat_strip: level,
    hasil_ukt: result as "LULUS" | "TIDAK_LULUS",
    catatan: value(formData, "catatan") || null,
  }).select("id").single();

  if (linkError || !eventParticipant) {
    await supabase.from("participants").delete().eq("id", participant.id);
    redirect(linkError?.code === "23505" ? "/admin/peserta?error=duplicate" : "/admin/peserta?error=save");
  }

  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    action: "participant.added_to_event",
    entity_type: "event_participant",
    entity_id: eventParticipant.id,
    metadata: { event_id: eventId, participant_name: name },
  });
  revalidatePath("/admin/peserta");
  revalidatePath("/admin/kegiatan");
  redirect("/admin/peserta?success=created");
}

export async function updateExamResult(formData: FormData) {
  const { user } = await requireAdmin();
  const id = value(formData, "event_participant_id");
  const result = value(formData, "hasil_ukt");
  if (!id || !["LULUS", "TIDAK_LULUS"].includes(result)) redirect("/admin/peserta?error=invalid");

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("event_participants").update({ hasil_ukt: result as "LULUS" | "TIDAK_LULUS" }).eq("id", id).select("id").maybeSingle();
  if (error || !data) redirect("/admin/peserta?error=save");
  await supabase.from("audit_logs").insert({ actor_id: user.id, action: "participant.exam_result_updated", entity_type: "event_participant", entity_id: id, metadata: { hasil_ukt: result } });
  revalidatePath("/admin/peserta");
  redirect("/admin/peserta?success=updated");
}

export async function updateEventParticipant(formData: FormData) {
  const { user } = await requireAdmin();
  const read = (key: string) => String(formData.get(key) ?? "").trim();
  const participantId = read("participant_id");
  const registrationId = read("event_participant_id");
  const name = read("nama_lengkap");
  const level = read("tingkat_strip");
  const result = read("hasil_ukt");
  if (!participantId || !registrationId || !name || !level || !["LULUS", "TIDAK_LULUS"].includes(result)) redirect("/admin/peserta?error=invalid");

  const supabase = createSupabaseAdminClient();
  const { error: participantError } = await supabase.from("participants").update({ nama_lengkap: name, nomor_anggota: read("nomor_anggota") || null }).eq("id", participantId);
  const { data: registration, error: registrationError } = await supabase.from("event_participants").update({ tingkat_strip: level, hasil_ukt: result as "LULUS" | "TIDAK_LULUS", catatan: read("catatan") || null }).eq("id", registrationId).select("id").maybeSingle();
  if (participantError || registrationError || !registration) redirect("/admin/peserta?error=save");
  await supabase.from("audit_logs").insert({ actor_id: user.id, action: "participant.updated", entity_type: "event_participant", entity_id: registrationId, metadata: { participant_name: name, hasil_ukt: result } });
  revalidatePath("/admin/peserta");
  revalidatePath("/admin/sertifikat");
  revalidatePath("/admin");
  redirect("/admin/peserta?success=updated");
}
