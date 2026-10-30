import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ImportRow = { row: number; nama_lengkap: string; nomor_anggota: string; tingkat_strip: string; hasil_ukt: string; errors: string[] };

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireAdmin();
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("participant_import_previews").select("rows_json").eq("id", id).eq("admin_id", user.id).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!data || !Array.isArray(data.rows_json)) return new Response("Pratinjau tidak ditemukan atau telah kedaluwarsa.", { status: 404 });
  const rows = data.rows_json as unknown as ImportRow[];
  const lines = [["Baris", "Nama Lengkap", "Nomor Anggota", "Tingkat/Strip", "Hasil UKT", "Masalah"].map(csvCell).join(",")];
  for (const row of rows.filter((item) => item.errors.length)) {
    lines.push([row.row, row.nama_lengkap, row.nomor_anggota, row.tingkat_strip, row.hasil_ukt, row.errors.join(" ")].map(csvCell).join(","));
  }
  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=laporan-impor-peserta.csv",
      "Cache-Control": "private, no-store",
    },
  });
}
