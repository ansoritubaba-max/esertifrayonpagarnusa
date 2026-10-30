import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { updateEventStatus } from "@/app/admin/kegiatan/actions";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(`${value}T00:00:00+07:00`));
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await requireAdmin();
  const { success, error } = await searchParams;
  const supabase = createSupabaseAdminClient();
  const [{ data: events, error: eventsError }, { data: links }] = await Promise.all([
    supabase.from("ukt_events").select("id,nama,jenis_kegiatan,lokasi,tanggal_mulai,tanggal_selesai,status,periode").order("tanggal_mulai", { ascending: false }),
    supabase.from("event_participants").select("event_id"),
  ]);
  const participantCounts = new Map<string, number>();
  for (const link of links ?? []) participantCounts.set(link.event_id, (participantCounts.get(link.event_id) ?? 0) + 1);

  return <div className="page-content">
    <header className="page-heading"><div><p className="eyebrow">MANAJEMEN UKT</p><h1>Kegiatan UKT</h1><p className="muted">Kelola jadwal UKT dan pantau jumlah peserta tiap kegiatan.</p></div><Link className="button button-primary" href="/admin/kegiatan/baru">＋ Buat kegiatan</Link></header>
    {success === "created" && <p className="notice notice-success" role="status">Kegiatan berhasil dibuat.</p>}
    {success === "updated" && <p className="notice notice-success" role="status">Status kegiatan diperbarui.</p>}
    {error && <p className="form-error" role="alert">Kegiatan tidak dapat diperbarui. Muat ulang lalu coba lagi.</p>}
    <section className="panel data-panel" aria-label="Daftar kegiatan">
      <div className="panel-heading"><div><h2>Daftar kegiatan</h2><p className="muted">{events?.length ?? 0} kegiatan</p></div></div>
      {eventsError ? <p className="notice notice-error">Data kegiatan tidak dapat dimuat. Pastikan migrasi Supabase sudah diterapkan.</p> : events?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Kegiatan</th><th>Jadwal</th><th>Peserta</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}>
        <td><Link className="table-link" href={`/admin/kegiatan/${event.id}`}><strong>{event.nama}</strong></Link><small>{event.jenis_kegiatan}{event.periode ? ` · ${event.periode}` : ""}</small><small>{event.lokasi}</small></td>
        <td>{formatDate(event.tanggal_mulai)}<small>s.d. {formatDate(event.tanggal_selesai)}</small></td>
        <td>{participantCounts.get(event.id) ?? 0}</td>
        <td><span className={`status-pill ${event.status === "SELESAI" ? "status-done" : "status-draft"}`}>{event.status === "SELESAI" ? "Selesai" : "Draft"}</span></td>
        <td><form action={updateEventStatus} className="inline-action"><input type="hidden" name="event_id" value={event.id} /><input type="hidden" name="status" value={event.status === "DRAFT" ? "SELESAI" : "DRAFT"} /><button className="text-button" type="submit">{event.status === "DRAFT" ? "Tandai selesai" : "Buka kembali"}</button></form></td>
      </tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-illustration" aria-hidden="true">▦</div><h3>Belum ada kegiatan</h3><p>Buat kegiatan UKT pertama untuk mulai memasukkan peserta.</p><Link className="button button-primary" href="/admin/kegiatan/baru">Buat kegiatan</Link></div>}
    </section>
  </div>;
}
