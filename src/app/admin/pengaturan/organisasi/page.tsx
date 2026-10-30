import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminAssetPreview } from "@/lib/admin-assets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveOrganizationSettings } from "@/app/admin/pengaturan/organisasi/actions";
import Image from "next/image";

type OrganizationSearchParams = Promise<{ error?: string; success?: string }>;

export default function OrganizationSettingsPage({ searchParams }: { searchParams: OrganizationSearchParams }) {
  return <div className="page-content">
    <header className="page-heading"><div><p className="eyebrow">PENGATURAN</p><h1>Identitas organisasi</h1><p className="muted">Informasi ini digunakan pada nomor dan dokumen sertifikat.</p></div></header>
    <Suspense fallback={<OrganizationSettingsFallback />}><OrganizationSettingsContent searchParams={searchParams} /></Suspense>
  </div>;
}

async function OrganizationSettingsContent({ searchParams }: { searchParams: OrganizationSearchParams }) {
  await connection();
  await requireAdmin();
  const [{ error, success }, { data: settings, error: queryError }] = await Promise.all([
    searchParams,
    createSupabaseAdminClient().from("organization_settings").select("*").eq("singleton", true).maybeSingle(),
  ]);
  const [logoPnPreview, logoRayonPreview, logoNuPreview, stempelPreview] = await Promise.all([
    createAdminAssetPreview(settings?.logo_pn_asset_id ?? null),
    createAdminAssetPreview(settings?.logo_rayon_asset_id ?? null),
    createAdminAssetPreview(settings?.logo_nu_asset_id ?? null),
    createAdminAssetPreview(settings?.stempel_asset_id ?? null),
  ]);
  return <>
    {success === "saved" && <p className="notice notice-success" role="status">Pengaturan organisasi tersimpan.</p>}
    {error === "invalid" && <p className="form-error" role="alert">Periksa kembali kolom wajib dan opacity watermark (3–15%).</p>}
    {error === "asset" && <p className="form-error" role="alert">Unggahan aset gagal. Gunakan PNG/WebP/JPEG untuk logo, PNG transparan untuk stempel, maksimal 10 MB.</p>}
    {(error === "save" || queryError) && <p className="form-error" role="alert">Pengaturan tidak dapat disimpan atau dimuat. Pastikan migrasi Supabase sudah diterapkan.</p>}
    <form action={saveOrganizationSettings} className="panel data-form settings-form">
      <div className="panel-heading"><div><h2>Profil penerbit</h2><p className="muted">Nama rayon, kota, dan prefix nomor resmi.</p></div></div>
      <label>Nama organisasi<input name="nama_organisasi" required maxLength={180} defaultValue={settings?.nama_organisasi ?? "Pencak Silat Nahdlatul Ulama Pagar Nusa"} /></label>
      <div className="form-grid"><label>Nama rayon<input name="nama_rayon" required maxLength={180} defaultValue={settings?.nama_rayon ?? "Rayon Pondok Pesantren Al-Amien"} /></label><label>Nama pondok (opsional)<input name="nama_pondok" maxLength={180} defaultValue={settings?.nama_pondok ?? ""} /></label></div>
      <label>Alamat (opsional)<textarea name="alamat" rows={3} maxLength={500} defaultValue={settings?.alamat ?? ""} /></label>
      <div className="form-grid"><label>Kota penerbitan<input name="kota" required maxLength={120} defaultValue={settings?.kota ?? ""} /></label><label>Prefix nomor sertifikat<input name="prefix_nomor" required maxLength={40} defaultValue={settings?.prefix_nomor ?? "PN-RAYON"} /></label></div>
      <div className="form-grid"><label>Opacity watermark NU (3–15%)<input name="watermark_opacity" type="number" min="0.03" max="0.15" step="0.005" required defaultValue={settings?.watermark_opacity ?? 0.06} /></label><div className="asset-notice"><strong>Aset tersimpan privat</strong><p>File baru mengganti aset untuk sertifikat berikutnya. Aset lama tetap tersimpan agar snapshot sertifikat historis tidak rusak.</p></div></div>
      <div className="asset-grid">
        {[{ name: "logo_pn", label: "Logo Pagar Nusa", preview: logoPnPreview, accept: "image/png,image/webp" }, { name: "logo_rayon", label: "Logo Rayon", preview: logoRayonPreview, accept: "image/png,image/webp" }, { name: "logo_nu", label: "Logo NU / watermark", preview: logoNuPreview, accept: "image/png,image/webp" }, { name: "stempel", label: "Stempel rayon (PNG)", preview: stempelPreview, accept: "image/png" }].map((asset) => <label className="asset-field" key={asset.name}>{asset.label}{asset.preview ? <Image unoptimized className="asset-preview" src={asset.preview} width={360} height={115} alt={`Pratinjau ${asset.label}`} /> : <span className="asset-preview-placeholder">Belum ada aset</span>}<input name={asset.name} type="file" accept={asset.accept} /></label>)}
      </div>
      <div className="form-actions"><button className="button button-primary" type="submit">Simpan pengaturan</button></div>
    </form>
  </>;
}

function OrganizationSettingsFallback() {
  return <section className="panel data-form settings-form" aria-label="Memuat pengaturan organisasi">
    <div className="panel-heading"><div><h2>Profil penerbit</h2><p className="muted">Informasi organisasi sedang dimuat.</p></div></div>
    <div className="settings-loading-fields"><span /><span /><span /><span /></div>
  </section>;
}
