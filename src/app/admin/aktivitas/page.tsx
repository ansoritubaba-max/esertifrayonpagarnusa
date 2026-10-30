import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

export default async function ActivityPage() {
  await requireAdmin();
  const { data: activities, error } = await createSupabaseAdminClient().from("audit_logs").select("id,action,entity_type,entity_id,metadata,created_at").order("created_at", { ascending: false }).limit(100);
  return <div className="page-content">
    <header className="page-heading"><div><p className="eyebrow">RIWAYAT SISTEM</p><h1>Aktivitas</h1><p className="muted">Audit perubahan yang dilakukan administrator.</p></div></header>
    <section className="panel data-panel">
      <div className="panel-heading"><div><h2>Aktivitas terbaru</h2><p className="muted">Menampilkan hingga 100 perubahan terakhir.</p></div></div>
      {error ? <p className="notice notice-error">Riwayat aktivitas belum dapat dimuat. Pastikan migrasi Supabase sudah diterapkan.</p> : activities?.length ? <ul className="activity-list activity-list-page">{activities.map((activity) => <li key={activity.id}><span className="activity-dot"/><div className="activity-copy"><strong>{actionLabels[activity.action] ?? activity.action}</strong><small>{activity.entity_type}{activity.entity_id ? ` · ${activity.entity_id}` : ""}</small></div><time dateTime={activity.created_at}>{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(activity.created_at))}</time></li>)}</ul> : <div className="empty-state"><div className="empty-illustration" aria-hidden="true">◷</div><h3>Belum ada aktivitas</h3><p>Perubahan data penting akan tersimpan di sini.</p></div>}
    </section>
  </div>;
}
