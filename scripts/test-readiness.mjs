const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

if (!baseUrl || !secretKey) {
  console.error("BELUM LULUS: SUPABASE_URL dan SUPABASE_SECRET_KEY harus tersedia di .env.local.");
  process.exit(2);
}

const headers = {
  apikey: secretKey,
  Authorization: `Bearer ${secretKey}`,
};
const requiredTables = [
  "admin_profiles",
  "media_assets",
  "organization_settings",
  "signers",
  "ukt_events",
  "participants",
  "event_participants",
  "certificate_templates",
  "certificates",
  "certificate_sequences",
  "generation_jobs",
  "generation_job_items",
  "certificate_verifications",
  "audit_logs",
  "participant_import_previews",
  "verification_rate_limits",
];
const blockers = [];
const warnings = [];

async function request(path, options = {}) {
  return fetch(new URL(path, baseUrl), {
    ...options,
    headers: { ...headers, ...options.headers },
    signal: AbortSignal.timeout(12_000),
  });
}

async function readRows(table, select, limit = 20) {
  const response = await request(`/rest/v1/${table}?select=${select}&limit=${limit}`);
  if (!response.ok) throw new Error(`${table} tidak dapat dibaca (HTTP ${response.status}).`);
  return response.json();
}

console.log("Tes kesiapan E-Sertifikat Pagar Nusa");

let availableTables = 0;
for (const table of requiredTables) {
  try {
    const response = await request(`/rest/v1/${table}?select=*&limit=0`);
    if (response.ok) availableTables += 1;
    else blockers.push(`Tabel ${table} belum tersedia di Supabase (HTTP ${response.status}).`);
  } catch {
    blockers.push(`Tabel ${table} tidak dapat diperiksa; koneksi Supabase bermasalah.`);
  }
}
console.log(`Skema Supabase: ${availableTables}/${requiredTables.length} tabel utama dapat diakses.`);

try {
  const [admins, organizations, signers, templates, events] = await Promise.all([
    readRows("admin_profiles", "id,is_active"),
    readRows("organization_settings", "singleton,kota,prefix_nomor,logo_pn_asset_id,logo_rayon_asset_id,logo_nu_asset_id,stempel_asset_id"),
    readRows("signers", "posisi,nama,jabatan,signature_asset_id,is_active"),
    readRows("certificate_templates", "is_active"),
    readRows("ukt_events", "id"),
  ]);

  const activeAdmins = admins.filter((admin) => admin.is_active).length;
  const organization = organizations.find((item) => item.singleton);
  const activeTemplate = templates.some((template) => template.is_active);
  const missingSigners = ["kiri", "kanan"].filter((position) => {
    const signer = signers.find((item) => item.posisi === position && item.is_active);
    return !signer?.nama?.trim() || !signer?.jabatan?.trim() || !signer.signature_asset_id;
  });

  console.log(`Akun administrator aktif: ${activeAdmins}.`);
  console.log(`Template aktif: ${activeTemplate ? "ada" : "tidak ada"}.`);
  console.log(`Kegiatan tercatat: ${events.length}.`);

  if (activeAdmins < 1) blockers.push("Belum ada profil administrator aktif.");
  if (!organization) blockers.push("Pengaturan organisasi belum disimpan.");
  else {
    if (!organization.kota?.trim()) blockers.push("Kota penerbitan belum diisi.");
    if (!organization.prefix_nomor?.trim()) blockers.push("Prefix nomor sertifikat belum diisi.");
    const assets = [
      organization.logo_pn_asset_id,
      organization.logo_rayon_asset_id,
      organization.logo_nu_asset_id,
      organization.stempel_asset_id,
    ];
    const assetNames = ["logo Pagar Nusa", "logo rayon", "logo NU", "stempel"];
    const missingBrandAssets = assetNames.filter((_, index) => !assets[index]);
    if (missingBrandAssets.length) warnings.push(`Aset visual belum lengkap: ${missingBrandAssets.join(", ")}.`);
  }
  if (!activeTemplate) blockers.push("Belum ada template sertifikat aktif.");
  if (missingSigners.length) blockers.push(`Data penandatangan belum lengkap (nama, jabatan, dan tanda tangan): ${missingSigners.join(", ")}.`);
} catch (error) {
  blockers.push(error instanceof Error ? error.message : "Data kesiapan Supabase gagal dibaca.");
}

for (const path of ["/", "/login", "/admin", "/admin/sertifikat"]) {
  try {
    const response = await fetch(new URL(path, siteUrl), {
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    const expected = path === "/"
      ? response.status >= 300 && response.status < 400 && response.headers.get("location")?.endsWith("/login")
      : path.startsWith("/admin")
        ? response.status >= 300 && response.status < 400
        : response.status === 200;
    console.log(`Halaman ${path}: HTTP ${response.status}${expected ? " (sesuai)" : " (perlu diperiksa)"}.`);
    if (!expected) blockers.push(`Halaman ${path} memberi respons HTTP ${response.status}.`);
  } catch {
    warnings.push(`Server lokal tidak merespons di ${siteUrl}; pemeriksaan halaman dilewati.`);
    break;
  }
}

if (warnings.length) {
  console.log("\nCatatan:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (blockers.length) {
  console.log("\nBELUM SIAP menerbitkan sertifikat:");
  for (const blocker of blockers) console.log(`- ${blocker}`);
  process.exitCode = 1;
} else {
  console.log("\nLULUS: persyaratan teknis penerbitan sertifikat terpenuhi.");
}
