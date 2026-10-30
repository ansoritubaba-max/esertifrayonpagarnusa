import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveCertificateTemplate } from "@/app/admin/pengaturan/template/actions";

const defaultBody = "Diberikan kepada:\n\n[NAMA PESERTA]\n\nTelah mengikuti dan dinyatakan LULUS dalam Ujian Kenaikan Tingkat (UKT) Pencak Silat Nahdlatul Ulama Pagar Nusa [NAMA RAYON], dengan tingkatan [TINGKAT / STRIP], yang diselenggarakan pada [TANGGAL UKT] di [TEMPAT KEGIATAN].";

export default async function TemplateSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  await requireAdmin();
  const [{ error, success }, { data: template, error: queryError }] = await Promise.all([
    searchParams,
    createSupabaseAdminClient().from("certificate_templates").select("id,version,nama,config_json,is_active").eq("is_active", true).maybeSingle(),
  ]);
  const config = template?.config_json && typeof template.config_json === "object" && !Array.isArray(template.config_json) ? template.config_json : {};
  const body = typeof config.body === "string" ? config.body : defaultBody;
  const title = typeof config.title === "string" ? config.title : template?.nama ?? "PN UKT Official Certificate";
  const tingkatStripOptions = Array.isArray(config.tingkat_strip_options) ? config.tingkat_strip_options.filter((item): item is string => typeof item === "string").join("\n") : "";

  return <div className="page-content">
    <header className="page-heading"><div><p className="eyebrow">PENGATURAN</p><h1>Desain sertifikat</h1><p className="muted">Simpan judul dan redaksi template UKT yang digunakan untuk penerbitan berikutnya.</p></div></header>
    {success === "saved" && <p className="notice notice-success" role="status">Template sertifikat tersimpan.</p>}
    {error === "invalid" && <p className="form-error" role="alert">Judul dan redaksi wajib diisi.</p>}
    {error === "levels" && <p className="form-error" role="alert">Daftar tingkat maksimal 50 pilihan, masing-masing maksimal 80 karakter.</p>}
    {(error === "save" || queryError) && <p className="form-error" role="alert">Template tidak dapat dimuat atau disimpan. Pastikan migrasi Supabase sudah diterapkan.</p>}
    <form action={saveCertificateTemplate} className="panel data-form settings-form">
      <div className="panel-heading"><div><h2>PN UKT Official Certificate</h2><p className="muted">A4 Landscape · Versi aktif {template?.version ?? "1.0 (baru)"}</p></div></div>
      <label>Judul template<input name="judul" required maxLength={160} defaultValue={title} /></label>
      <label>Redaksi sertifikat<textarea name="redaksi" required rows={9} maxLength={3000} defaultValue={body} /></label>
      <p className="muted">Variabel yang tersedia: [NAMA PESERTA], [NAMA RAYON], [TINGKAT / STRIP], [TANGGAL UKT], [TEMPAT KEGIATAN]. Snapshot redaksi diterapkan saat sertifikat diterbitkan.</p>
      <label>Daftar tingkat / strip yang dikenali (satu per baris)<textarea name="tingkat_strip_options" rows={5} maxLength={5000} placeholder="Sabuk Putih&#10;Sabuk Hijau&#10;Sabuk Kuning" defaultValue={tingkatStripOptions} /></label>
      <p className="muted">Daftar ini digunakan untuk memvalidasi tingkat/strip saat impor Excel. Kosongkan bila pilihan tingkat belum ditetapkan.</p>
      <div className="form-actions"><button className="button button-primary" type="submit">Simpan template</button></div>
    </form>
  </div>;
}
