import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "certificate-assets";
const WIDTH = 841.89;
const HEIGHT = 595.28;
const ink = rgb(0.10, 0.20, 0.15);
const green = rgb(0.05, 0.23, 0.18);
const gold = rgb(0.78, 0.63, 0.22);
const muted = rgb(0.38, 0.44, 0.40);

export type CertificatePdfData = {
  certificateNumber: string;
  verificationUrl: string;
  issuedAt: string;
  participantName: string;
  level: string;
  eventName: string;
  eventStart: string;
  eventEnd: string;
  eventLocation: string;
  organizationName: string;
  rayonName: string;
  schoolName: string | null;
  city: string;
  address: string | null;
  title: string;
  body: string;
  signers: Array<{ name: string; title: string; spKtaNumber: string; assetId: string | null }>;
  logoAssetIds: string[];
  watermarkAssetId: string | null;
  watermarkOpacity: number;
  stampAssetId: string | null;
  isDraft?: boolean;
};

function drawCentered(page: PDFPage, text: string, y: number, size: number, font: PDFFont, color = ink) {
  page.drawText(text, { x: (WIDTH - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
}

function drawCertificateFrame(page: PDFPage) {
  page.drawRectangle({ x: 0, y: 0, width: WIDTH, height: HEIGHT, color: rgb(0.94, 0.965, 0.94) });
  page.drawRectangle({ x: 30, y: 30, width: WIDTH - 60, height: HEIGHT - 60, borderColor: green, borderWidth: 0.9 });
  page.drawRectangle({ x: 30, y: HEIGHT - 42, width: WIDTH - 60, height: 8, color: green });
  page.drawRectangle({ x: 30, y: HEIGHT - 46, width: WIDTH - 60, height: 1.5, color: gold });
}

function wrappedLines(text: string, font: PDFFont, size: number, maxWidth: number) {
  const output: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) { output.push(""); continue; }
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        output.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) output.push(line);
  }
  return output;
}

async function readImage(assetId: string | null) {
  if (!assetId) return null;
  const supabase = createSupabaseAdminClient();
  const { data: asset } = await supabase.from("media_assets").select("storage_path,mime_type,file_size").eq("id", assetId).maybeSingle();
  if (!asset || asset.file_size > 10 * 1024 * 1024) return null;
  const { data, error } = await supabase.storage.from(BUCKET).download(asset.storage_path);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (asset.mime_type === "image/png") return { bytes, type: "png" as const };
  if (asset.mime_type === "image/jpeg") return { bytes, type: "jpg" as const };
  if (asset.mime_type === "image/webp") return { bytes: await sharp(bytes).png().toBuffer(), type: "png" as const };
  return null;
}

async function drawAsset(pdf: PDFDocument, page: PDFPage, assetId: string | null, x: number, y: number, maxWidth: number, maxHeight: number, opacity = 1) {
  const image = await readImage(assetId);
  if (!image) return false;
  const embedded = image.type === "png" ? await pdf.embedPng(image.bytes) : await pdf.embedJpg(image.bytes);
  const scale = Math.min(maxWidth / embedded.width, maxHeight / embedded.height, 1);
  const width = embedded.width * scale;
  const height = embedded.height * scale;
  page.drawImage(embedded, { x: x + (maxWidth - width) / 2, y: y + (maxHeight - height) / 2, width, height, opacity });
  return true;
}

export async function renderCertificatePdf(data: CertificatePdfData) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${data.title} - ${data.participantName}`);
  pdf.setAuthor(data.organizationName);
  pdf.setSubject(`Sertifikat ${data.certificateNumber}`);
  pdf.setCreator("E-Sertifikat Digital Pagar Nusa");
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(join(process.cwd(), "public/fonts/NotoSans-Regular.ttf")),
    readFile(join(process.cwd(), "public/fonts/NotoSans-Bold.ttf")),
  ]);
  const [regular, bold, script, serif, serifBold] = await Promise.all([
    pdf.embedFont(regularBytes, { subset: true }),
    pdf.embedFont(boldBytes, { subset: true }),
    pdf.embedFont(await readFile(join(process.cwd(), "public/fonts/GreatVibes-Regular.ttf")), { subset: true }),
    pdf.embedFont(StandardFonts.TimesRoman),
    pdf.embedFont(StandardFonts.TimesRomanBold),
  ]);
  const page = pdf.addPage([WIDTH, HEIGHT]);
  drawCertificateFrame(page);
  await drawAsset(pdf, page, data.watermarkAssetId, 245, 135, 352, 325, data.watermarkOpacity);

  if (data.logoAssetIds[0]) {
    await Promise.all([
      drawAsset(pdf, page, data.logoAssetIds[0], 40, 450, 100, 100),
      drawAsset(pdf, page, data.logoAssetIds[0], WIDTH - 140, 450, 100, 100),
    ]);
  } else {
    const logoBytes = await readFile(join(process.cwd(), "public/logo-pagar-nusa.png"));
    const logo = await pdf.embedPng(logoBytes);
    page.drawImage(logo, { x: 40, y: 450, width: 100, height: 100 });
    page.drawImage(logo, { x: WIDTH - 140, y: 450, width: 100, height: 100 });
  }
  drawCentered(page, data.organizationName.toLocaleUpperCase("id-ID"), 492, 12, serifBold, green);
  drawCentered(page, data.rayonName, 476, 9, regular, muted);
  if (data.schoolName) drawCentered(page, data.schoolName, 463, 8, regular, muted);
  const heading = "SERTIFIKAT";
  const headingSize = 39;
  const headingWidth = serifBold.widthOfTextAtSize(heading, headingSize);
  const headingLeft = (WIDTH - headingWidth) / 2;
  const headingRight = headingLeft + headingWidth;
  drawCentered(page, heading, 408, headingSize, serifBold, green);
  page.drawLine({ start: { x: 198, y: 427 }, end: { x: headingLeft - 24, y: 427 }, color: gold, thickness: 0.75 });
  page.drawLine({ start: { x: headingRight + 24, y: 427 }, end: { x: WIDTH - 198, y: 427 }, color: gold, thickness: 0.75 });
  const titleLines = wrappedLines(data.title, serifBold, 16, 650);
  if (titleLines.length > 2) throw new Error("Judul sertifikat terlalu panjang untuk ukuran A4 landscape.");
  let titleY = 382;
  for (const line of titleLines) {
    drawCentered(page, line, titleY, 16, serifBold, green);
    titleY -= 21;
  }
  let redaction = data.body
    .replaceAll("[NAMA PESERTA]", data.participantName)
    .replaceAll("[NAMA RAYON]", data.rayonName)
    .replaceAll("[TINGKAT / STRIP]", data.level)
    .replaceAll("[TANGGAL UKT]", data.eventStart === data.eventEnd ? data.eventStart : `${data.eventStart} s.d. ${data.eventEnd}`)
    .replaceAll("[TEMPAT KEGIATAN]", data.eventLocation);
  if (!redaction.includes(data.participantName)) redaction = `Diberikan kepada:\n${data.participantName}\n\n${redaction}`;
  drawCentered(page, "Penghargaan diberikan kepada", titleY - 12, 15, serifBold, green);
  const participantLines = wrappedLines(data.participantName, script, 48, 690);
  if (participantLines.length > 2) throw new Error("Nama peserta terlalu panjang untuk ukuran A4 landscape.");
  let nameY = titleY - 62;
  for (const line of participantLines) {
    drawCentered(page, line, nameY, 48, script, ink);
    nameY -= 47;
  }
  page.drawLine({ start: { x: 150, y: nameY + 4 }, end: { x: WIDTH - 150, y: nameY + 4 }, color: gold, thickness: 0.9 });
  page.drawCircle({ x: WIDTH / 2, y: nameY + 4, size: 2.2, color: gold });
  const bodyText = redaction.replaceAll(data.participantName, "").replace(/Diberikan kepada:\s*/i, "").trim();
  const bodyLines = wrappedLines(bodyText, serif, 13, 760);
  if (bodyLines.length > 8) throw new Error("Redaksi sertifikat terlalu panjang. Pendekkan redaksi sebelum menerbitkan.");
  const bodyY = nameY - 25;
  let y = bodyY;
  for (const line of bodyLines) {
    if (line) drawCentered(page, line, y, 13, serif, ink);
    y -= 18;
  }
  y -= 2;
  drawCentered(page, data.eventName, y, 10, serifBold, muted);

  const signerTop = 122;
  const signerBoxes = [{ center: 285, signer: data.signers[0] }, { center: WIDTH - 285, signer: data.signers[1] }];
  for (const { center, signer } of signerBoxes) {
    if (!signer) continue;
    await drawAsset(pdf, page, signer.assetId, center - 70, signerTop, 140, 49);
    page.drawLine({ start: { x: center - 75, y: signerTop - 3 }, end: { x: center + 75, y: signerTop - 3 }, color: muted, thickness: 0.65 });
    const titleLines = wrappedLines(signer.title, regular, 8, 170);
    let titleY = signerTop - 18;
    for (const line of titleLines.slice(0, 2)) {
      page.drawText(line, { x: center - regular.widthOfTextAtSize(line, 8) / 2, y: titleY, size: 8, font: regular, color: muted });
      titleY -= 12;
    }
    page.drawText(signer.name, { x: center - bold.widthOfTextAtSize(signer.name, 9) / 2, y: titleY - 3, size: 9, font: bold, color: ink });
    if (signer.spKtaNumber) {
      const numberLines = wrappedLines(`No. SP/KTA: ${signer.spKtaNumber}`, regular, 6.5, 190);
      let numberY = titleY - 16;
      for (const line of numberLines.slice(0, 2)) {
        page.drawText(line, { x: center - regular.widthOfTextAtSize(line, 6.5) / 2, y: numberY, size: 6.5, font: regular, color: muted });
        numberY -= 9;
      }
    }
  }

  const qrSize = 54;
  const qrX = WIDTH / 2 - qrSize / 2;
  if (!data.isDraft) {
    const qrBytes = await QRCode.toBuffer(data.verificationUrl, { type: "png", errorCorrectionLevel: "H", margin: 1, width: 180, color: { dark: "#0D3B2E", light: "#FFFFFF" } });
    const qr = await pdf.embedPng(qrBytes);
    page.drawImage(qr, { x: qrX, y: 78, width: qrSize, height: qrSize });
    page.drawText(data.certificateNumber, { x: WIDTH / 2 - bold.widthOfTextAtSize(data.certificateNumber, 6) / 2, y: 69, size: 6, font: bold, color: green });
    drawCentered(page, "Pindai untuk verifikasi", 60, 6, regular, muted);
  } else {
    page.drawRectangle({ x: qrX, y: 78, width: qrSize, height: qrSize, borderColor: gold, borderWidth: 1, color: rgb(1, 1, 1) });
    drawCentered(page, "QR", 101, 10, bold, green);
  }
  await drawAsset(pdf, page, data.stampAssetId, WIDTH - 112, 78, 42, 42);
  drawCentered(page, data.isDraft ? "PRATINJAU · BELUM TERBIT" : `Diterbitkan ${data.issuedAt}`, 34, 7, regular, muted);
  if (data.city) page.drawText(data.city, { x: WIDTH - 95, y: 34, size: 7, font: regular, color: muted });

  const bytes = await pdf.save({ useObjectStreams: true });
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}
