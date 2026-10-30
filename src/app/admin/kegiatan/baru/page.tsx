import Link from "next/link";
import { createEvent } from "@/app/admin/kegiatan/actions";

const errors: Record<string, string> = {
  required: "Lengkapi nama, lokasi, dan tanggal kegiatan.",
  "date-range": "Tanggal selesai tidak boleh lebih awal dari tanggal mulai.",
  save: "Kegiatan belum tersimpan. Pastikan migrasi database sudah diterapkan.",
};

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <div className="page-content">
    <header className="page-heading"><div><p className="eyebrow">MANAJEMEN UKT</p><h1>Buat kegiatan</h1><p className="muted">Jadwal kegiatan UKT menjadi dasar data peserta dan sertifikat.</p></div><Link className="button" href="/admin/kegiatan">Kembali</Link></header>
    {error && <p className="form-error" role="alert">{errors[error] ?? "Terjadi kesalahan saat menyimpan kegiatan."}</p>}
    <form action={createEvent} className="data-form panel">
      <label>Nama kegiatan<input name="nama" required maxLength={160} placeholder="Contoh: UKT Rayon Al-Amien 2026" /></label>
      <div className="form-grid"><label>Jenis kegiatan<input name="jenis_kegiatan" defaultValue="UKT" required maxLength={60} /></label><label>Periode<input name="periode" maxLength={80} placeholder="Contoh: Semester Ganjil 2026" /></label></div>
      <label>Lokasi<input name="lokasi" required maxLength={200} placeholder="Tempat pelaksanaan UKT" /></label>
      <div className="form-grid form-grid-three"><label>Tanggal mulai<input name="tanggal_mulai" type="date" required /></label><label>Tanggal selesai<input name="tanggal_selesai" type="date" required /></label><label>Tanggal terbit default<input name="tanggal_terbit_default" type="date" /></label></div>
      <label>Deskripsi<textarea name="deskripsi" rows={3} maxLength={1000} /></label>
      <div className="form-actions"><button className="button button-primary" type="submit">Simpan kegiatan</button></div>
    </form>
  </div>;
}
