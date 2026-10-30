"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { savePrivateImage } from "@/lib/admin-assets";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function saveSigners(formData: FormData) {
  const { user } = await requireAdmin();
  const read = (key: string) => String(formData.get(key) ?? "").trim();
  const kiriNama = read("kiri_nama");
  const kiriJabatan = read("kiri_jabatan");
  const kiriNomorSpKta = read("kiri_nomor_sp_kta");
  const kananNama = read("kanan_nama");
  const kananJabatan = read("kanan_jabatan");
  const kananNomorSpKta = read("kanan_nomor_sp_kta");
  if (!kiriJabatan || !kananJabatan) redirect("/admin/pengaturan/ttd?error=invalid");

  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase.from("signers").select("posisi,signature_asset_id");
  const leftFile = formData.get("kiri_signature");
  const rightFile = formData.get("kanan_signature");
  let leftAsset: string | null = null;
  let rightAsset: string | null = null;
  try {
    [leftAsset, rightAsset] = await Promise.all([
      leftFile instanceof File && leftFile.size > 0 ? savePrivateImage(leftFile, "signature") : Promise.resolve(null),
      rightFile instanceof File && rightFile.size > 0 ? savePrivateImage(rightFile, "signature") : Promise.resolve(null),
    ]);
  } catch {
    redirect("/admin/pengaturan/ttd?error=asset");
  }
  const currentLeftAsset = existing?.find((signer) => signer.posisi === "kiri")?.signature_asset_id ?? null;
  const currentRightAsset = existing?.find((signer) => signer.posisi === "kanan")?.signature_asset_id ?? null;
  const { error } = await supabase.from("signers").upsert([
    { posisi: "kiri", nama: kiriNama, jabatan: kiriJabatan, nomor_sp_kta: kiriNomorSpKta, is_active: formData.get("kiri_aktif") === "on", signature_asset_id: leftAsset ?? currentLeftAsset },
    { posisi: "kanan", nama: kananNama, jabatan: kananJabatan, nomor_sp_kta: kananNomorSpKta, is_active: formData.get("kanan_aktif") === "on", signature_asset_id: rightAsset ?? currentRightAsset },
  ], { onConflict: "posisi" });
  if (error) redirect("/admin/pengaturan/ttd?error=save");

  await supabase.from("audit_logs").insert({ actor_id: user.id, action: "signers.settings_updated", entity_type: "signers", metadata: { kiri_nama: kiriNama, kanan_nama: kananNama } });
  revalidatePath("/admin/pengaturan/ttd");
  redirect("/admin/pengaturan/ttd?success=saved");
}
