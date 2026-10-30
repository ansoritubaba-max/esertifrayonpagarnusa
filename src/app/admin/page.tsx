import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ActivityItem = { id: string; action: string; entity_type: string; created_at: string };

async function ActivityPanel({ activity, actionLabels }: { activity: ActivityItem[]; actionLabels: Record<string, string> }) {
  await connection();
  return <article className="panel activity-panel">
    <div className="panel-heading"><div><h2>Aktivitas terbaru</h2><p className="muted">Catatan pengelolaan sertifikat</p></div><Link href="/admin/aktivitas" className="text-link">Lihat semua <span aria-hidden="true">→</span></Link></div>
    {activity.length ? <ul className="activity-list">{activity.map((item) => <li key={item.id}><span className="activity-dot"/><div><strong>{actionLabels[item.action] ?? item.action}</strong><small>{item.entity_type}</small></div><time dateTime={item.created_at}>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(item.created_at))}</time></li>)}</ul> : <div className="empty-state"><div className="empty-illustration" aria-hidden="true">✦</div><h3>Belum ada aktivitas</h3><p>Riwayat perubahan akan tercatat di sini.</p></div>}
  </article>;
}

function ActivityPanelFallback() {
  return <article className="panel activity-panel" aria-busy="true">
    <div className="panel-heading"><div><h2>Aktivitas terbaru</h2><p className="muted">Catatan pengelolaan sertifikat</p></div></div>
    <div className="activity-list"><div className="activity-skeleton"/><div className="activity-skeleton"/><div className="activity-skeleton"/></div>
  </article>;
}

function DashboardDataFallback() {
  return (
    <>
      <section className="metrics-grid" aria-label="Ringkasan sertifikat" aria-busy="true">
        {["Total sertifikat", "Sertifikat terbit", "Masih draft", "Dicabut"].map((label) => (
          <article className="metric-card" key={label}>
            <p className="metric-label">{label}</p>
            <p className="metric-value">—</p>
            <p className="metric-note">Memuat ringkasan</p>
          </article>
        ))}
      </section>
      <section className="dashboard-grid">
        <ActivityPanelFallback />
      </section>
    </>
  );
}

async function DashboardData() {
  await connection();
  const supabase = createSupabaseAdminClient();
  const [all, issued, drafts, revoked, events, verifications, activity] = await Promise.all([
    supabase.from("certificates").select("id", { count: "exact", head: true }),
    supabase.from("certificates").select("id", { count: "exact", head: true }).eq("status", "TERBIT"),
    supabase.from("certificates").select("id", { count: "exact", head: true }).eq("status", "DRAFT"),
    supabase.from("certificates").select("id", { count: "exact", head: true }).eq("status", "DICABUT"),
    supabase.from("ukt_events").select("id", { count: "exact", head: true }),
    supabase.from("certificate_verifications").select("id", { count: "exact", head: true }),
    supabase.from("audit_logs").select("id,action,entity_type,created_at").order("created_at", { ascending: false }).limit(5),
  ]);
  const metrics = [
    { label: "Total sertifikat", value: all.count ?? 0, note: `${events.count ?? 0} kegiatan UKT`, icon: "▤", tone: "green" },
    { label: "Sertifikat terbit", value: issued.count ?? 0, note: `${verifications.count ?? 0} kali verifikasi`, icon: "✓", tone: "gold" },
    { label: "Masih draft", value: drafts.count ?? 0, note: "Menunggu pemeriksaan", icon: "◷", tone: "sage" },
    { label: "Dicabut", value: revoked.count ?? 0, note: "Tetap tersimpan di histori", icon: "⌁", tone: "rose" },
  ];
  const actionLabels: Record<string, string> = {
    "event.created": "Kegiatan UKT dibuat",
    "event.status_updated": "Status kegiatan diperbarui",
    "participant.added_to_event": "Peserta ditambahkan ke kegiatan",
    "participant.exam_result_updated": "Hasil UKT peserta diperbarui",
    "organization.settings_updated": "Identitas organisasi diperbarui",
    "signers.settings_updated": "Pengaturan penandatangan diperbarui",
    "certificate_template.updated": "Template sertifikat diperbarui",
    "certificate.draft_created": "Draft sertifikat dibuat",
  };
  return (
    <>
      <section className="metrics-grid" aria-label="Ringkasan sertifikat">
        {metrics.map((metric) => <article className="metric-card" key={metric.label}>
          <div className={`metric-icon ${metric.tone}`} aria-hidden="true">{metric.icon}</div>
          <p className="metric-label">{metric.label}</p><p className="metric-value">{metric.value}</p><p className="metric-note">{metric.note}</p>
        </article>)}
      </section>

      <section className="dashboard-grid">
        <Suspense fallback={<ActivityPanelFallback />}><ActivityPanel activity={activity.data ?? []} actionLabels={actionLabels} /></Suspense>
      </section>
    </>
  );
}

export default function DashboardPage() {
  return (
    <div className="page-content">
      <header className="page-heading">
        <div><p className="eyebrow">RINGKASAN</p><h1>Dashboard</h1><p className="muted">Pantau penerbitan sertifikat UKT Rayon Al-Amien.</p></div>
        <Link href="/admin/kegiatan/baru" className="button button-primary"><span aria-hidden="true">＋</span> Buat kegiatan UKT</Link>
      </header>
      <Suspense fallback={<DashboardDataFallback />}>
        <DashboardData />
      </Suspense>
      <section className="dashboard-grid">
        <article className="panel setup-panel">
          <div className="panel-heading"><div><h2>Mulai dari sini</h2><p className="muted">Siapkan kebutuhan penerbitan</p></div></div>
          <ol className="setup-list">
            <li><span className="step-number">1</span><div><strong>Lengkapi identitas rayon</strong><p>Nama, logo, dan kota penerbitan</p></div><Link href="/admin/pengaturan/organisasi" aria-label="Buka pengaturan organisasi">→</Link></li>
            <li><span className="step-number">2</span><div><strong>Atur penandatangan</strong><p>Nama, jabatan, dan tanda tangan</p></div><Link href="/admin/pengaturan/ttd" aria-label="Buka pengaturan tanda tangan">→</Link></li>
            <li><span className="step-number">3</span><div><strong>Buat kegiatan UKT</strong><p>Tambahkan peserta dan siapkan sertifikat</p></div><Link href="/admin/kegiatan/baru" aria-label="Buat kegiatan UKT">→</Link></li>
          </ol>
        </article>
      </section>
    </div>
  );
}
