"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { BrandLogo } from "@/components/brand-logo";

const navigation = [
  { label: "Dashboard", href: "/admin", icon: "⌂" },
  { label: "Kegiatan UKT", href: "/admin/kegiatan", icon: "▦" },
  { label: "Peserta", href: "/admin/peserta", icon: "♙" },
  { label: "Sertifikat", href: "/admin/sertifikat", icon: "▤" },
  { label: "Import Excel", href: "/admin/sertifikat/import", icon: "⇧" },
];
const settings = [
  { label: "Organisasi", href: "/admin/pengaturan/organisasi" },
  { label: "Penandatangan", href: "/admin/pengaturan/ttd" },
  { label: "Desain sertifikat", href: "/admin/pengaturan/template" },
];

export function AdminShell({ adminName, children }: { adminName: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function signOut() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && anonKey) {
      const supabase = createBrowserClient(url, anonKey);
      await supabase.auth.signOut();
    }
    router.replace("/login");
    router.refresh();
  }

  return <div className="admin-layout">
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <Link className="sidebar-brand" href="/admin"><BrandLogo className="brand-mark" /><span><strong>Pagar Nusa</strong><small>Rayon Al-Amien</small></span></Link>
      <div className="nav-label">MENU UTAMA</div>
      <nav aria-label="Navigasi utama" className="main-nav">{navigation.map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={`nav-item ${pathname === item.href ? "nav-active" : ""}`} onClick={() => setMenuOpen(false)}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</nav>
      <div className="nav-label settings-label">PENGATURAN</div>
      <nav aria-label="Pengaturan" className="main-nav">{settings.map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={`nav-item ${pathname === item.href ? "nav-active" : ""}`} onClick={() => setMenuOpen(false)}><span className="nav-icon" aria-hidden="true">⚙</span>{item.label}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="security-note"><span className="security-dot" /> Sistem internal<br /><small>Akses administrator</small></div><button className="nav-item logout-button" type="button" onClick={signOut}><span className="nav-icon" aria-hidden="true">↪</span>Keluar</button></div>
    </aside>
    {menuOpen ? <button className="sidebar-overlay" aria-label="Tutup menu" onClick={() => setMenuOpen(false)} /> : null}
    <div className="main-column">
      <header className="topbar"><button className="menu-toggle" type="button" aria-label="Buka navigasi" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button><div className="breadcrumb"><span>Rayon Al-Amien</span><span aria-hidden="true">/</span><strong>Panel Administrator</strong></div><div className="topbar-user"><span className="avatar">{adminName.trim().charAt(0).toUpperCase()}</span><span className="user-name">{adminName}</span><span className="admin-pill">ADMIN</span></div></header>
      <main>{children}</main>
      <footer className="app-footer">E-Sertifikat Digital Pagar Nusa <span>·</span> Rayon Pondok Pesantren Al-Amien <span>·</span> Dikembangkan oleh Muhammad Ansori Mubarok, S.Kom.</footer>
    </div>
  </div>;
}
