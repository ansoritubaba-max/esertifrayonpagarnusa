import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/admin";

export async function GET() {
  await requireAdmin();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "E-Sertifikat Pagar Nusa";
  const sheet = workbook.addWorksheet("Peserta UKT");
  sheet.columns = [
    { header: "Nama Lengkap", key: "nama", width: 30 },
    { header: "Nomor Anggota", key: "nomor", width: 20 },
    { header: "Tingkat/Strip", key: "tingkat", width: 22 },
    { header: "Hasil UKT", key: "hasil", width: 18 },
    { header: "Catatan", key: "catatan", width: 36 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF174B39" } };
  sheet.addRow({ nama: "Contoh Nama Peserta", nomor: "PN-001", tingkat: "Sabuk Hijau", hasil: "LULUS", catatan: "" });
  sheet.addRow({ nama: "Contoh Peserta Lain", nomor: "PN-002", tingkat: "Sabuk Putih", hasil: "TIDAK LULUS", catatan: "Ulangi materi" });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=template-import-peserta-pagar-nusa.xlsx",
      "Cache-Control": "private, no-store",
    },
  });
}
