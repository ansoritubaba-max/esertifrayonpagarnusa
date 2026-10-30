import { Suspense } from "react";
import { connection } from "next/server";
import Image from "next/image";
import { requireAdmin } from "@/lib/admin";
import { createAdminAssetPreview } from "@/lib/admin-assets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveSigners } from "@/app/admin/pengaturan/ttd/actions";

type SignerSearchParams = Promise<{ error?: string; success?: string }>;

export default function SignerSettingsPage({ searchParams }: { searchParams: SignerSearchParams }) {
  return <div className="page-content">
    <header className="page-heading"><div><p className="eyebrow">PENGATURAN</p><h1>Penandatangan</h1><p className="muted">Atur nama dan jabatan yang tampil pada sertifikat berikutnya.</p></div></header>
    <Suspense fallback={<SignerSettingsFallback />}><SignerSettingsContent searchParams={searchParams} /></Suspense>
  </div>;
}

async function SignerSettingsContent({ searchParams }: { searchParams: SignerSearchParams }) {
  await connection();
  await requireAdmin();
  const [{ error, success }, { data: signers, error: queryError }] = await Promise.all([
    searchParams,
    createSupabaseAdminClient().from("signers").select("*").order("posisi"),
  ]);
  const left = signers?.find((signer) => signer.posisi === "kiri");
  const right = signers?.find((signer) => signer.posisi === "kanan");
  const [leftPreview, rightPreview] = await Promise.all([
    createAdminAssetPreview(left?.signature_asset_id ?? null),
    createAdminAssetPreview(right?.signature_asset_id ?? null),
  ]);

  return <>
    {success === "saved" && <p className="notice notice-success" role="status">Pengaturan penandatangan tersimpan.</p>}
    {error === "invalid" && <p className="form-error" role="alert">Jabatan kedua penandatangan wajib diisi.</p>}
    {error === "asset" && <p className="form-error" role="alert">File tanda tangan harus PNG transparan dengan ukuran maksimal 10 MB.</p>}
    {(error === "save" || queryError) && <p className="form-error" role="alert">Data tidak dapat dimuat atau disimpan. Pastikan migrasi Supabase sudah diterapkan.</p>}
    <form action={saveSigners} className="signer-grid">
      <section className="panel data-form signer-card">
        <div className="panel-heading"><div><p className="eyebrow">POSISI KIRI</p><h2>Penandatangan pertama</h2></div></div>
        <label>Nama pejabat<input name="kiri_nama" maxLength={160} defaultValue={left?.nama ?? ""} /></label>
        <label>Jabatan<input name="kiri_jabatan" required maxLength={120} defaultValue={left?.jabatan ?? "Ketua Rayon"} /></label>
        <label>Nomor SP / KTA (opsional)<input name="kiri_nomor_sp_kta" maxLength={80} defaultValue={left?.nomor_sp_kta ?? ""} /></label>
        <label className="checkbox-label"><input name="kiri_aktif" type="checkbox" defaultChecked={left?.is_active ?? true} /> Tampilkan di sertifikat</label>
        {leftPreview && <Image unoptimized className="signature-preview" src={leftPreview} width={360} height={100} alt="Pratinjau tanda tangan pertama" />}
        <label>Gambar tanda tangan PNG<input name="kiri_signature" type="file" accept="image/png" /></label>
      </section>
      <section className="panel data-form signer-card">
        <div className="panel-heading"><div><p className="eyebrow">POSISI KANAN</p><h2>Penandatangan kedua</h2></div></div>
        <label>Nama pejabat<input name="kanan_nama" maxLength={160} defaultValue={right?.nama ?? ""} /></label>
        <label>Jabatan<input name="kanan_jabatan" required maxLength={120} defaultValue={right?.jabatan ?? "Pembina / Pelatih"} /></label>
        <label>Nomor SP / KTA (opsional)<input name="kanan_nomor_sp_kta" maxLength={80} defaultValue={right?.nomor_sp_kta ?? ""} /></label>
        <label className="checkbox-label"><input name="kanan_aktif" type="checkbox" defaultChecked={right?.is_active ?? true} /> Tampilkan di sertifikat</label>
        {rightPreview && <Image unoptimized className="signature-preview" src={rightPreview} width={360} height={100} alt="Pratinjau tanda tangan kedua" />}
        <label>Gambar tanda tangan PNG<input name="kanan_signature" type="file" accept="image/png" /></label>
        <p className="asset-notice">Perubahan ini berlaku untuk sertifikat yang akan diterbitkan.</p>
      </section>
      <div className="form-actions signer-actions"><button className="button button-primary" type="submit">Simpan penandatangan</button></div>
    </form>
  </>;
}

function SignerSettingsFallback() {
  return <div className="signer-grid" aria-label="Memuat data penandatangan">
    <section className="panel data-form signer-card"><h2>Penandatangan pertama</h2><p className="muted">Memuat nama, jabatan, dan tanda tangan.</p></section>
    <section className="panel data-form signer-card"><h2>Penandatangan kedua</h2><p className="muted">Memuat nama, jabatan, dan tanda tangan.</p></section>
  </div>;
}
