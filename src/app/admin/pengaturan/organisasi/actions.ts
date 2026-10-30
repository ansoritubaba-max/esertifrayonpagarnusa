"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { savePrivateImage } from "@/lib/admin-assets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function saveOrganizationSettings(formData: FormData) {
  const { user } = await requireAdmin();
  const read = (key: string) => String(formData.get(key) ?? "").trim();
  const namaOrganisasi = read("nama_organisasi");
  const namaRayon = read("nama_rayon");
  const kota = read("kota");
  const prefixNomor = read("prefix_nomor");
  const opacity = Number(read("watermark_opacity"));
  if (!namaOrganisasi || !namaRayon || !kota || !prefixNomor || !Number.isFinite(opacity) || opacity < 0.03 || opacity > 0.15) {
    redirect("/admin/pengaturan/organisasi?error=invalid");
  }

  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase.from("organization_settings").select("id,logo_pn_asset_id,logo_rayon_asset_id,logo_nu_asset_id,stempel_asset_id").eq("singleton", true).maybeSingle();
  const upload = async (field: string, assetType: "logo_pn" | "logo_rayon" | "logo_nu" | "stempel") => {
    const file = formData.get(field);
    return file instanceof File && file.size > 0 ? savePrivateImage(file, assetType) : null;
  };
  let logoPn: string | null = null;
  let logoRayon: string | null = null;
  let logoNu: string | null = null;
  let stempel: string | null = null;
  try {
    [logoPn, logoRayon, logoNu, stempel] = await Promise.all([
      upload("logo_pn", "logo_pn"),
      upload("logo_rayon", "logo_rayon"),
      upload("logo_nu", "logo_nu"),
      upload("stempel", "stempel"),
    ]);
  } catch {
    redirect("/admin/pengaturan/organisasi?error=asset");
  }
  const { error } = await supabase.from("organization_settings").upsert({
    singleton: true,
    nama_organisasi: namaOrganisasi,
    nama_rayon: namaRayon,
    nama_pondok: read("nama_pondok") || null,
    alamat: read("alamat") || null,
    kota,
    prefix_nomor: prefixNomor,
    watermark_opacity: opacity,
    logo_pn_asset_id: logoPn ?? existing?.logo_pn_asset_id ?? null,
    logo_rayon_asset_id: logoRayon ?? existing?.logo_rayon_asset_id ?? null,
    logo_nu_asset_id: logoNu ?? existing?.logo_nu_asset_id ?? null,
    stempel_asset_id: stempel ?? existing?.stempel_asset_id ?? null,
  }, { onConflict: "singleton" });
  if (error) redirect("/admin/pengaturan/organisasi?error=save");

  const { data: settings } = await supabase.from("organization_settings").select("id").eq("singleton", true).maybeSingle();
  await supabase.from("audit_logs").insert({ actor_id: user.id, action: "organization.settings_updated", entity_type: "organization_settings", entity_id: settings?.id ?? null, metadata: { nama_organisasi: namaOrganisasi, nama_rayon: namaRayon } });
  revalidatePath("/admin/pengaturan/organisasi");
  redirect("/admin/pengaturan/organisasi?success=saved");
}
