import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createEventParticipant, updateEventParticipant } from "@/app/admin/peserta/actions";

const errorMessages: Record<string, string> = {
  required: "Pilih kegiatan dan lengkapi nama, tingkat, serta hasil UKT.",
  duplicate: "Peserta ini sudah terdaftar pada kegiatan yang dipilih.",
  save: "Data belum tersimpan. Pastikan migrasi database sudah diterapkan.",
  invalid: "Data yang dikirim tidak valid.",
};

export default async function ParticipantsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  await requireAdmin();
  const { error, success } = await searchParams;
  const supabase = createSupabaseAdminClient();
  const [{ data: events }, { data: participants, error: participantsError }] = await Promise.all([
    supabase.from("ukt_events").select("id,nama,tanggal_mulai,status").order("tanggal_mulai", { ascending: false }),
    supabase.from("event_participants").select("id,event_id,participant_id,tingkat_strip,hasil_ukt,catatan,participants(id,nama_lengkap,nomor_anggota),ukt_events(nama)").order("created_at", { ascending: false }),
  ]);

  return <div className="page-content">
    <header className="page-heading"><div><p className="eyebrow">DATA PESERTA</p><h1>Peserta</h1><p className="muted">Catat peserta per kegiatan UKT dan hasil kelulusannya.</p></div></header>
    {error && <p className="form-error" role="alert">{errorMessages[error] ?? "Terjadi kesalahan. Periksa data lalu coba kembali."}</p>}
    {success === "created" && <p className="notice notice-success" role="status">Peserta berhasil ditambahkan.</p>}
    {success === "updated" && <p className="notice notice-success" role="status">Hasil UKT diperbarui.</p>}

    <section className="panel data-panel participant-entry">
      <div className="panel-heading"><div><h2>Tambah peserta</h2><p className="muted">Peserta didaftarkan ke satu kegiatan UKT.</p></div></div>
      {events?.length ? <form action={createEventParticipant} className="data-form compact-form">
        <label>Kegiatan<select name="event_id" required defaultValue=""><option value="" disabled>Pilih kegiatan</option>{events.map((event) => <option key={event.id} value={event.id}>{event.nama} ({event.status === "SELESAI" ? "selesai" : "draft"})</option>)}</select></label>
        <div className="form-grid"><label>Nama lengkap<input name="nama_lengkap" required maxLength={180} /></label><label>Nomor anggota<input name="nomor_anggota" maxLength={80} /></label></div>
        <div className="form-grid"><label>Tingkat / strip<input name="tingkat_strip" required maxLength={80} placeholder="Contoh: Sabuk Putih" /></label><label>Hasil UKT<select name="hasil_ukt" defaultValue="LULUS"><option value="LULUS">Lulus</option><option value="TIDAK_LULUS">Tidak lulus</option></select></label></div>
        <label>Catatan admin<textarea name="catatan" rows={2} maxLength={500} /></label>
        <div className="form-actions"><button className="button button-primary" type="submit">Simpan peserta</button></div>
      </form> : <p className="notice">Buat kegiatan UKT terlebih dahulu sebelum menambahkan peserta.</p>}
    </section>

    <section className="panel data-panel">
      <div className="panel-heading"><div><h2>Daftar peserta UKT</h2><p className="muted">{participants?.length ?? 0} pendaftaran</p></div></div>
      {participantsError ? <p className="notice notice-error">Data peserta tidak dapat dimuat. Pastikan migrasi Supabase sudah diterapkan.</p> : participants?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Peserta</th><th>Kegiatan</th><th>Data UKT</th><th>Aksi</th></tr></thead><tbody>{participants.map((registration) => {
        const person = Array.isArray(registration.participants) ? registration.participants[0] : registration.participants;
        const event = Array.isArray(registration.ukt_events) ? registration.ukt_events[0] : registration.ukt_events;
        return <tr key={registration.id}><td colSpan={4}><form action={updateEventParticipant} className="participant-edit"><input type="hidden" name="participant_id" value={registration.participant_id} /><input type="hidden" name="event_participant_id" value={registration.id} /><div className="participant-edit-heading"><strong>{event?.nama ?? "Kegiatan"}</strong><span className={`status-pill ${registration.hasil_ukt === "LULUS" ? "status-done" : "status-revoked"}`}>{registration.hasil_ukt === "LULUS" ? "Lulus" : "Tidak lulus"}</span></div><div className="participant-edit-fields"><label>Nama<input name="nama_lengkap" required maxLength={180} defaultValue={person?.nama_lengkap ?? ""} /></label><label>Nomor anggota<input name="nomor_anggota" maxLength={80} defaultValue={person?.nomor_anggota ?? ""} /></label><label>Tingkat / strip<input name="tingkat_strip" required maxLength={80} defaultValue={registration.tingkat_strip} /></label><label>Hasil UKT<select name="hasil_ukt" defaultValue={registration.hasil_ukt}><option value="LULUS">Lulus</option><option value="TIDAK_LULUS">Tidak lulus</option></select></label></div><label className="participant-note">Catatan admin<textarea name="catatan" rows={2} maxLength={500} defaultValue={registration.catatan ?? ""} /></label><div className="form-actions"><button className="text-button" type="submit">Simpan perubahan</button></div></form></td></tr>;
      })}</tbody></table></div> : <div className="empty-state"><div className="empty-illustration" aria-hidden="true">♙</div><h3>Belum ada peserta</h3><p>Form di atas akan mendaftarkan peserta ke kegiatan UKT pilihan.</p></div>}
    </section>
  </div>;
}
