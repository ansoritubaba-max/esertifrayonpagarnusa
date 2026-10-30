import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AssetType } from "@/types/database";

const BUCKET = "certificate-assets";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function matchesSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  if (mimeType === "image/webp") return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return false;
}

function allowedMimeType(assetType: AssetType, mimeType: string) {
  if (assetType === "stempel" || assetType === "signature") return mimeType === "image/png";
  if (assetType === "logo_pn" || assetType === "logo_rayon" || assetType === "logo_nu" || assetType === "participant_photo") return ["image/png", "image/webp", "image/jpeg"].includes(mimeType);
  return false;
}

export async function savePrivateImage(file: File, assetType: AssetType) {
  if (file.size <= 0 || file.size > MAX_FILE_SIZE || !allowedMimeType(assetType, file.type)) {
    throw new Error("File harus berupa gambar yang didukung dengan ukuran maksimal 10 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(bytes, file.type)) throw new Error("Isi file tidak sesuai dengan format gambar yang diizinkan.");

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `${assetType}/${randomUUID()}.${extension}`;
  const supabase = createSupabaseAdminClient();
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error("File gagal diunggah ke penyimpanan privat.");

  const { data: asset, error: assetError } = await supabase.from("media_assets").insert({
    storage_path: storagePath,
    mime_type: file.type,
    file_size: file.size,
    asset_type: assetType,
  }).select("id").single();
  if (assetError || !asset) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error("Metadata aset gagal disimpan.");
  }
  return asset.id;
}

export async function createAdminAssetPreview(assetId: string | null) {
  if (!assetId) return null;
  const supabase = createSupabaseAdminClient();
  const { data: asset } = await supabase.from("media_assets").select("storage_path").eq("id", assetId).maybeSingle();
  if (!asset) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(asset.storage_path, 300);
  return data?.signedUrl ?? null;
}
