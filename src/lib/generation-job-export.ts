import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

const BUCKET = "certificate-assets";
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeStoredZip(files: { name: string; bytes: Uint8Array }[]) {
  const localParts: Buffer[] = [];
  const directoryParts: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.bytes);
    if (data.byteLength > 0xffffffff || offset > 0xffffffff) throw new Error("File ZIP melebihi batas format ZIP klasik.");
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.byteLength, 18);
    local.writeUInt32LE(data.byteLength, 22);
    local.writeUInt16LE(name.byteLength, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(0, 10);
    directory.writeUInt16LE(0, 12);
    directory.writeUInt16LE(0x21, 14);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(data.byteLength, 20);
    directory.writeUInt32LE(data.byteLength, 24);
    directory.writeUInt16LE(name.byteLength, 28);
    directory.writeUInt16LE(0, 30);
    directory.writeUInt16LE(0, 32);
    directory.writeUInt16LE(0, 34);
    directory.writeUInt16LE(0, 36);
    directory.writeUInt32LE(0, 38);
    directory.writeUInt32LE(offset, 42);
    directoryParts.push(directory, name);
    offset += local.byteLength + name.byteLength + data.byteLength;
  }
  if (files.length > 0xffff) throw new Error("Jumlah file melebihi batas format ZIP klasik.");
  const directorySize = directoryParts.reduce((size, part) => size + part.byteLength, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directorySize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...directoryParts, end]);
}

function snapshotString(value: Json, key: string) {
  if (!value || Array.isArray(value) || typeof value !== "object") return "";
  const field = value[key];
  return typeof field === "string" ? field : "";
}

function safeFilePart(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80) || "sertifikat";
}

async function downloadPdf(storagePath: string) {
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new Error("PDF sertifikat tidak dapat dibaca dari penyimpanan.");
  return new Uint8Array(await data.arrayBuffer());
}

export async function buildGenerationJobExport(jobId: string, type: "ZIP" | "PDF_COMBINED") {
  const supabase = createSupabaseAdminClient();
  const { data: items, error: itemsError } = await supabase.from("generation_job_items")
    .select("certificate_id,status").eq("job_id", jobId).eq("status", "BERHASIL").not("certificate_id", "is", null).limit(5000);
  if (itemsError || !items?.length) throw new Error("Tidak ada PDF sertifikat berhasil yang dapat dimasukkan ke file unduhan.");
  const certificateIds = items.map((item) => item.certificate_id).filter((id): id is string => Boolean(id));
  const { data: certificates, error: certificatesError } = await supabase.from("certificates")
    .select("id,nomor_sertifikat,issued_at,data_snapshot,pdf_asset_id").in("id", certificateIds).eq("status", "TERBIT").order("issued_at", { ascending: true });
  if (certificatesError || !certificates?.length) throw new Error("Data sertifikat yang sudah terbit tidak dapat dimuat.");
  const assetIds = certificates.map((certificate) => certificate.pdf_asset_id).filter((id): id is string => Boolean(id));
  const { data: assets, error: assetsError } = await supabase.from("media_assets").select("id,storage_path").in("id", assetIds);
  if (assetsError) throw new Error("Daftar PDF tidak dapat dimuat.");
  const pathByAsset = new Map((assets ?? []).map((asset) => [asset.id, asset.storage_path]));
  const files: { name: string; bytes: Uint8Array }[] = [];
  const combined = await PDFDocument.create();
  for (const certificate of certificates) {
    const path = certificate.pdf_asset_id ? pathByAsset.get(certificate.pdf_asset_id) : null;
    if (!path) continue;
    const bytes = await downloadPdf(path);
    const snapshot = certificate.data_snapshot;
    const fileName = `${safeFilePart(certificate.nomor_sertifikat ?? certificate.id)}-${safeFilePart(snapshotString(snapshot, "nama_lengkap"))}.pdf`;
    files.push({ name: fileName, bytes });
    if (type === "PDF_COMBINED") {
      const source = await PDFDocument.load(bytes);
      const pages = await combined.copyPages(source, source.getPageIndices());
      pages.forEach((page) => combined.addPage(page));
    }
  }
  if (!files.length) throw new Error("PDF final tidak tersedia untuk unduhan.");
  const output = type === "ZIP" ? makeStoredZip(files) : Buffer.from(await combined.save());
  const extension = type === "ZIP" ? "zip" : "pdf";
  const mimeType = type === "ZIP" ? "application/zip" : "application/pdf";
  const fileName = `sertifikat-${jobId}.${extension}`;
  const storagePath = `job-exports/${jobId}-${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, output, { contentType: mimeType, upsert: true });
  if (uploadError) throw new Error("File hasil ekspor gagal disimpan.");
  const { data: asset, error: assetError } = await supabase.from("media_assets").insert({
    storage_path: storagePath, mime_type: mimeType, file_size: output.byteLength, asset_type: "job_export",
    checksum: createHash("sha256").update(output).digest("hex"),
  }).select("id").single();
  if (assetError || !asset) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error("Metadata file hasil ekspor gagal disimpan.");
  }
  return { assetId: asset.id, fileName, fileSize: output.byteLength };
}
