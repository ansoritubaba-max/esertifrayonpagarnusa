import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "E-Sertifikat Digital | Pagar Nusa Rayon Al-Amien",
  description: "Pengelolaan dan verifikasi sertifikat UKT Pagar Nusa Rayon Pondok Pesantren Al-Amien.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="id"><body>{children}</body></html>;
}
