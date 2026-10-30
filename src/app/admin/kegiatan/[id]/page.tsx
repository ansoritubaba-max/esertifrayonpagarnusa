import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { updateEvent } from "@/app/admin/kegiatan/actions";

export default async function EditEventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  await requireAdmin();
  const [{ id }, { error, success }] = await Promise.all([params, searchParams]);
  const { data: event } = await createSupabaseAdminClient().from("ukt_events").select("*").eq("id", id).maybeSingle();
  if (!event) notFound();

  return <div className="page-content">
    <header className="page-heading"><div><p className="eyebrow">MANAJEMEN UKT</p><h1>Edit kegiatan</h1><p className="muted">Perbarui jadwal dan informasi kegiatan UKT.</p></div><Link className="button" href="/admin/kegiatan">Kembali</Link></header>
    {success === "saved" && <p className="notice notice-success" role="status">Perubahan kegiatan tersimpan.</p>}
    {error === "invalid" && <p className="form-error" role="alert">Lengkapi kolom wajib dan pastikan tanggal selesai tidak lebih awal dari tanggal mulai.</p>}
    {error === "save" && <p className="form-error" role="alert">Perubahan belum tersimpan. Muat ulang lalu coba kembali.</p>}
    <form action={updateEvent} className="data-form panel">
      <input type="hidden" name="event_id" value={event.id} />
      <label>Nama kegiatan<input name="nama" required maxLength={160} defaultValue={event.nama} /></label>
      <div className="form-grid"><label>Jenis kegiatan<input name="jenis_kegiatan" required maxLength={60} defaultValue={event.jenis_kegiatan} /></label><label>Periode<input name="periode" maxLength={80} defaultValue={event.periode ?? ""} /></label></div>
      <label>Lokasi<input name="lokasi" required maxLength={200} defaultValue={event.lokasi} /></label>
      <div className="form-grid form-grid-three"><label>Tanggal mulai<input name="tanggal_mulai" type="date" required defaultValue={event.tanggal_mulai} /></label><label>Tanggal selesai<input name="tanggal_selesai" type="date" required defaultValue={event.tanggal_selesai} /></label><label>Tanggal terbit default<input name="tanggal_terbit_default" type="date" required defaultValue={event.tanggal_terbit_default} /></label></div>
      <label>Deskripsi<textarea name="deskripsi" rows={3} maxLength={1000} defaultValue={event.deskripsi ?? ""} /></label>
      <div className="form-actions"><button className="button button-primary" type="submit">Simpan perubahan</button></div>
    </form>
  </div>;
}
