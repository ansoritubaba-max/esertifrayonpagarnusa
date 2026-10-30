import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { confirmParticipantImport, previewParticipantImport } from "@/app/admin/sertifikat/import/actions";

type ImportRow = {
  row: number;
  nama_lengkap: string;
  nomor_anggota: string;
  tingkat_strip: string;
  hasil_ukt: string;
  catatan: string;
  errors: string[];
  warnings: string[];
};

const messages: Record<string, string> = {
  required: "Pilih kegiatan dan file Excel terlebih dahulu.",
  file: "Gunakan file .xlsx dengan ukuran maksimal 5 MB.",
  event: "Kegiatan tidak ditemukan.",
  workbook: "File tidak dapat dibaca. Pastikan file Excel tidak rusak.",
  rows: "File harus berisi 1 sampai 500 baris data dan maksimal 20 kolom.",
  headers: "Kolom wajib: Nama Lengkap, Nomor Anggota, Tingkat/Strip, Hasil UKT, Catatan.",
  schema: "Fitur impor belum tersedia di database. Terapkan migrasi participant import di Supabase.",
  preview: "Pratinjau tidak ditemukan. Unggah ulang file Excel.",
  expired: "Pratinjau kedaluwarsa setelah 30 menit. Unggah ulang file Excel.",
  "none-valid": "Tidak ada baris valid untuk diimpor. Unduh laporan, perbaiki file, lalu unggah ulang.",
  consumed: "Pratinjau ini sudah pernah dikonfirmasi dan tidak dapat diimpor ulang.",
};

export default async function ImportParticipantsPage({ searchParams }: { searchParams: Promise<{ error?: string; preview?: string; success?: string; failed?: string }> }) {
  const { user } = await requireAdmin();
  const params = await searchParams;
  const supabase = createSupabaseAdminClient();
  const [{ data: events }, { data: preview }] = await Promise.all([
    supabase.from("ukt_events").select("id,nama,tanggal_mulai,status").order("tanggal_mulai", { ascending: false }),
    params.preview ? supabase.from("participant_import_previews").select("id,event_id,rows_json,expires_at,consumed_at").eq("id", params.preview).eq("admin_id", user.id).gt("expires_at", new Date().toISOString()).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const rows = Array.isArray(preview?.rows_json) ? preview.rows_json as unknown as ImportRow[] : [];
  const validCount = rows.filter((row) => row.errors.length === 0).length;
  const invalidCount = rows.length - validCount;
  const eventName = events?.find((event) => event.id === preview?.event_id)?.nama ?? "Kegiatan UKT";
  const successCount = params.success !== undefined ? Number(params.success) : null;
  const failedCount = Number(params.failed ?? 0);

  return <div className="page-content">
    <header className="page-heading"><div><p className="eyebrow">DATA PESERTA</p><h1>Import Excel</h1><p className="muted">Unggah daftar peserta UKT, periksa hasil validasi, lalu konfirmasi penyimpanan.</p></div><a className="button button-primary" href="/admin/sertifikat/import/template">Unduh template Excel</a></header>
    {params.error && <p className="form-error" role="alert">{messages[params.error] ?? "Impor gagal diproses. Periksa data lalu coba kembali."}</p>}
    {successCount !== null && <p className="notice notice-success" role="status">Impor selesai: {successCount} berhasil{failedCount ? `, ${failedCount} gagal saat penyimpanan` : ""}.</p>}

    <section className="panel data-panel participant-entry">
      <div className="panel-heading"><div><h2>Unggah data</h2><p className="muted">Pilih satu kegiatan dan file Excel berformat .xlsx. Maksimal 500 peserta per impor.</p></div></div>
      <form action={previewParticipantImport} className="data-form compact-form import-form">
        <label>Kegiatan UKT<select name="event_id" required defaultValue={preview?.event_id ?? ""}><option value="" disabled>Pilih kegiatan</option>{events?.map((event) => <option key={event.id} value={event.id}>{event.nama} · {event.tanggal_mulai}</option>)}</select></label>
        <label>File Excel<input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></label>
        <div className="form-actions"><button className="button button-primary" type="submit">Tampilkan pratinjau</button></div>
      </form>
    </section>

    {preview && <section className="panel data-panel">
      <div className="panel-heading"><div><h2>Pratinjau: {eventName}</h2><p className="muted">{rows.length} baris · {validCount} siap diimpor · {invalidCount} perlu diperbaiki</p></div></div>
      {invalidCount > 0 && <p className="import-report-link"><a className="text-link" href={`/admin/sertifikat/import/${preview.id}/laporan`}>Unduh laporan baris bermasalah (.csv)</a></p>}
      <div className="table-wrap import-table-wrap"><table className="data-table import-table"><thead><tr><th>Baris</th><th>Nama</th><th>Nomor anggota</th><th>Tingkat / strip</th><th>Hasil</th><th>Catatan / masalah</th></tr></thead><tbody>{rows.map((row) => <tr key={row.row} className={row.errors.length ? "import-row-invalid" : undefined}><td>{row.row}</td><td>{row.nama_lengkap || "—"}</td><td>{row.nomor_anggota || "—"}</td><td>{row.tingkat_strip || "—"}</td><td>{row.hasil_ukt === "LULUS" ? "Lulus" : row.hasil_ukt === "TIDAK_LULUS" ? "Tidak lulus" : "—"}</td><td>{row.errors.length ? <span className="import-errors">{row.errors.join(" ")}</span> : row.catatan || "—"}</td></tr>)}</tbody></table></div>
      {preview.consumed_at ? <p className="notice">Pratinjau ini sudah diproses dan tidak dapat dikirim ulang. Unduh laporan untuk melihat baris yang gagal.</p> : <form action={confirmParticipantImport} className="import-confirm-form"><input type="hidden" name="preview_id" value={preview.id} /><p className="muted">Hanya {validCount} baris yang valid akan disimpan. Baris bermasalah dapat diperbaiki di file Excel lalu diunggah ulang.</p><button className="button button-primary" type="submit" disabled={validCount === 0}>Konfirmasi impor {validCount} peserta</button></form>}
    </section>}
  </div>;
}
