import { Suspense } from "react";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createCertificateDraft, issueCertificate } from "@/app/admin/sertifikat/actions";
import { createCertificateExportJob, createCertificateGenerationJob, retryCertificateGenerationJob } from "@/app/admin/sertifikat/jobs/actions";
import { RevokeCertificateForm } from "@/components/admin/revoke-certificate-form";
import { GenerationJobMonitor } from "@/components/admin/generation-job-monitor";

const errors: Record<string, string> = {
  required: "Pilih peserta yang akan dibuatkan draft sertifikat.",
  "not-eligible": "Sertifikat hanya dapat dibuat untuk peserta dengan hasil Lulus.",
  "no-template": "Aktifkan template sertifikat terlebih dahulu di Pengaturan Desain sertifikat.",
  exists: "Peserta ini sudah memiliki draft atau sertifikat yang masih berlaku.",
  save: "Draft sertifikat gagal dibuat. Periksa struktur database Supabase.",
  "revocation-reason": "Alasan pencabutan minimal 5 karakter dan maksimal 500 karakter.",
  "revocation-state": "Hanya sertifikat berstatus Terbit yang dapat dicabut.",
  replacement: "Sertifikat pengganti harus merujuk sertifikat yang sudah dicabut untuk peserta yang sama.",
  "issue-state": "Draft ini tidak ditemukan atau sudah berubah status. Muat ulang daftar sertifikat.",
  incomplete: "Lengkapi identitas organisasi, template, dan dua penandatangan beserta gambar tanda tangannya sebelum menerbitkan.",
  "site-url": "Alamat situs publik belum dapat ditentukan. Atur NEXT_PUBLIC_SITE_URL sebelum menerbitkan.",
  "number-prefix": "Prefix nomor sertifikat belum valid. Periksa pengaturan organisasi.",
  schema: "Fungsi penomoran sertifikat belum tersedia. Terapkan migrasi certificate issue di Supabase.",
  pdf: "PDF gagal dibuat. Pastikan font dan file aset organisasi tersedia dengan format yang didukung.",
  storage: "PDF gagal disimpan. Periksa bucket certificate-assets di Supabase.",
  "job-event": "Pilih kegiatan UKT untuk penerbitan massal.",
  "job-empty": "Kegiatan ini belum memiliki draft sertifikat yang dapat diterbitkan.",
  "job-save": "Antrean penerbitan gagal dibuat. Periksa migrasi database Supabase.",
  "job-active": "Sebagian sertifikat dari kegiatan ini sudah berada dalam antrean lain yang masih berjalan.",
  "job-state": "Antrean ini tidak tersedia untuk dicoba ulang.",
  "job-retry": "Antrean gagal dimulai ulang. Muat ulang halaman dan coba lagi.",
  "export-event": "Pilih kegiatan dan jenis file unduhan.",
  "export-empty": "Kegiatan ini belum memiliki PDF sertifikat yang sudah terbit.",
  "export-save": "Antrean file unduhan gagal dibuat. Terapkan migrasi terbaru di Supabase.",
};

const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function formatCertificateDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${Number(day)} ${months[Number(month) - 1] ?? ""} ${year}`;
}

type CertificateSearchParams = Promise<{ error?: string; success?: string; job?: string }>;

export default function CertificatesPage({ searchParams }: { searchParams: CertificateSearchParams }) {
  return <div className="page-content">
    <header className="page-heading"><div><p className="eyebrow">PENERBITAN</p><h1>Sertifikat</h1><p className="muted">Siapkan draft untuk peserta lulus dan tinjau status penerbitan.</p></div></header>
    <Suspense fallback={<CertificatesContentFallback />}><CertificatesContent searchParams={searchParams} /></Suspense>
  </div>;
}

async function CertificatesContent({ searchParams }: { searchParams: CertificateSearchParams }) {
  await connection();
  const { user } = await requireAdmin();
  const [{ error, success, job: jobId }, supabase] = await Promise.all([searchParams, Promise.resolve(createSupabaseAdminClient())]);
  const [{ data: certificates, error: certificatesError }, { data: registrations }, { data: signers }, { data: organization }, { data: events }] = await Promise.all([
    supabase.from("certificates").select("id,event_participant_id,nomor_sertifikat,status,issued_at,created_at,revocation_reason").order("created_at", { ascending: false }),
    supabase.from("event_participants").select("id,event_id,participant_id,tingkat_strip,participants(nama_lengkap),ukt_events(nama)").eq("hasil_ukt", "LULUS").order("created_at", { ascending: false }),
    supabase.from("signers").select("posisi,nama,jabatan,signature_asset_id,is_active"),
    supabase.from("organization_settings").select("nama_organisasi,nama_rayon,prefix_nomor").eq("singleton", true).maybeSingle(),
    supabase.from("ukt_events").select("id,nama,tanggal_mulai,periode").order("tanggal_mulai", { ascending: false }),
  ]);
  const signerByPosition = new Map((signers ?? []).map((signer) => [signer.posisi, signer]));
  const missingIssueRequirements = [
    !organization ? "Identitas organisasi" : "",
    !signerByPosition.get("kiri")?.is_active || !signerByPosition.get("kiri")?.nama || !signerByPosition.get("kiri")?.signature_asset_id ? "Aktifkan posisi kiri dan isi nama serta PNG tanda tangannya" : "",
    !signerByPosition.get("kanan")?.is_active || !signerByPosition.get("kanan")?.nama || !signerByPosition.get("kanan")?.signature_asset_id ? "Aktifkan posisi kanan dan isi nama serta PNG tanda tangannya" : "",
  ].filter(Boolean);
  const available = (registrations ?? []).filter((registration) => !(certificates ?? []).some((certificate) => certificate.event_participant_id === registration.id && certificate.status !== "DICABUT"));
  const personNames = new Map<string, string>();
  const eventNames = new Map<string, string>();
  const eventDraftCounts = new Map<string, number>();
  const eventIssuedCounts = new Map<string, number>();
  for (const registration of registrations ?? []) {
    const person = Array.isArray(registration.participants) ? registration.participants[0] : registration.participants;
    const event = Array.isArray(registration.ukt_events) ? registration.ukt_events[0] : registration.ukt_events;
    personNames.set(registration.id, person?.nama_lengkap ?? "Peserta");
    eventNames.set(registration.id, event?.nama ?? "Kegiatan UKT");
    if ((certificates ?? []).some((certificate) => certificate.event_participant_id === registration.id && certificate.status === "DRAFT")) {
      eventDraftCounts.set(registration.event_id, (eventDraftCounts.get(registration.event_id) ?? 0) + 1);
    }
    if ((certificates ?? []).some((certificate) => certificate.event_participant_id === registration.id && certificate.status === "TERBIT")) {
      eventIssuedCounts.set(registration.event_id, (eventIssuedCounts.get(registration.event_id) ?? 0) + 1);
    }
  }
  const [{ data: activeJob }, { data: recentJobItems }] = jobId ? await Promise.all([
    supabase.from("generation_jobs").select("id,event_id,status,total_items,completed_items,failed_items,requested_by").eq("id", jobId).maybeSingle(),
    supabase.from("generation_job_items").select("id,status,error_message,attempts").eq("job_id", jobId).order("updated_at", { ascending: false }).limit(5000),
  ]) : [{ data: null }, { data: null }];
  const jobForCurrentAdmin = activeJob?.requested_by === user.id ? activeJob : null;
  const jobIsRetryable = jobForCurrentAdmin && ["GAGAL", "SEBAGIAN_GAGAL"].includes(jobForCurrentAdmin.status);
  const eventLabel = (event: NonNullable<typeof events>[number]) => `${event.nama} · ${event.tanggal_mulai} · ${event.periode || event.id.slice(0, 8)}`;

  return <>
    {error === "incomplete" ? <div className="issue-prerequisite-alert" role="alert"><div><strong>Sertifikat belum bisa diterbitkan</strong><p>Lengkapi persyaratan berikut, lalu coba terbitkan kembali:</p><ul>{missingIssueRequirements.length ? missingIssueRequirements.map((item) => <li key={item}>{item}</li>) : <li>Pastikan pengaturan organisasi dan penandatangan lengkap serta aktif.</li>}</ul></div><div className="issue-prerequisite-links"><a href="/admin/pengaturan/ttd">Atur penandatangan</a><a href="/admin/pengaturan/organisasi">Atur organisasi</a></div></div> : error && <p className="form-error" role="alert">{errors[error] ?? "Terjadi kesalahan saat memproses sertifikat."}</p>}
    {success === "draft" && <p className="notice notice-success" role="status">Draft sertifikat berhasil dibuat.</p>}
    {success === "revoked" && <p className="notice notice-success" role="status">Sertifikat dicabut dan statusnya tercatat di histori.</p>}
    {success === "issued" && <p className="notice notice-success" role="status">Sertifikat berhasil diterbitkan. PDF final dan tautan verifikasinya sudah aktif.</p>}
    {jobForCurrentAdmin && <GenerationJobMonitor key={jobForCurrentAdmin.id} jobId={jobForCurrentAdmin.id} />}
    {jobIsRetryable && <form action={retryCertificateGenerationJob} className="retry-job-form"><input type="hidden" name="job_id" value={jobForCurrentAdmin.id} /><button className="button button-primary" type="submit">Coba ulang {recentJobItems?.filter((item) => item.status === "GAGAL").length ?? jobForCurrentAdmin.failed_items} item gagal</button></form>}
    <section className="panel data-panel participant-entry"><div className="panel-heading"><div><h2>Terbitkan satu kegiatan</h2><p className="muted">Draft yang tersedia akan masuk antrean dan diproses satu per satu.</p></div></div>
      {(events ?? []).some((event) => (eventDraftCounts.get(event.id) ?? 0) > 0) ? <form action={createCertificateGenerationJob} className="draft-form"><label className="sr-only" htmlFor="generation-event">Kegiatan UKT</label><select id="generation-event" name="event_id" required defaultValue=""><option value="" disabled>Pilih kegiatan</option>{(events ?? []).filter((event) => (eventDraftCounts.get(event.id) ?? 0) > 0).map((event) => <option key={event.id} value={event.id}>{eventLabel(event)} · {eventDraftCounts.get(event.id)} draft</option>)}</select><button className="button button-primary" type="submit">Mulai penerbitan massal</button></form> : <p className="notice">Belum ada draft yang dapat diterbitkan secara massal.</p>}
    </section>
    <section className="panel data-panel participant-entry"><div className="panel-heading"><div><h2>Unduh sertifikat satu kegiatan</h2><p className="muted">Buat file ZIP atau PDF gabungan melalui antrean proses.</p></div></div>
      {(events ?? []).some((event) => (eventIssuedCounts.get(event.id) ?? 0) > 0) ? <form action={createCertificateExportJob} className="draft-form"><label className="sr-only" htmlFor="export-event">Kegiatan UKT</label><select id="export-event" name="event_id" required defaultValue=""><option value="" disabled>Pilih kegiatan</option>{(events ?? []).filter((event) => (eventIssuedCounts.get(event.id) ?? 0) > 0).map((event) => <option key={event.id} value={event.id}>{eventLabel(event)} · {eventIssuedCounts.get(event.id)} sertifikat</option>)}</select><label className="sr-only" htmlFor="export-job-type">Jenis file</label><select id="export-job-type" name="job_type" required defaultValue="ZIP"><option value="ZIP">ZIP berisi PDF satu per peserta</option><option value="PDF_COMBINED">Satu PDF gabungan untuk dicetak</option></select><button className="button button-primary" type="submit">Siapkan unduhan</button></form> : <p className="notice">Belum ada sertifikat terbit untuk diunduh.</p>}
    </section>
    <section className="panel data-panel participant-entry"><div className="panel-heading"><div><h2>Ekspor laporan Excel</h2><p className="muted">Unduh daftar peserta, hasil UKT, status sertifikat, nomor, dan riwayat pencabutan.</p></div></div>
      {(events ?? []).length ? <form action="/api/admin/reports/certificates" method="get" className="draft-form"><label className="sr-only" htmlFor="report-event">Kegiatan UKT untuk laporan</label><select id="report-event" name="event_id" required defaultValue=""><option value="" disabled>Pilih kegiatan</option>{events?.map((event) => <option key={event.id} value={event.id}>{eventLabel(event)}</option>)}</select><button className="button button-primary" type="submit">Unduh laporan Excel</button></form> : <p className="notice">Belum ada kegiatan UKT untuk dibuatkan laporan.</p>}
    </section>
    <section className="panel data-panel participant-entry"><div className="panel-heading"><div><h2>Buat draft sertifikat</h2><p className="muted">Hanya peserta berstatus Lulus yang dapat dipilih.</p></div></div>
      {available.length ? <form action={createCertificateDraft} className="draft-form"><label className="sr-only" htmlFor="certificate-candidate">Peserta lulus</label><select id="certificate-candidate" name="event_participant_id" required defaultValue=""><option value="" disabled>Pilih peserta</option>{available.map((registration) => {
        const person = Array.isArray(registration.participants) ? registration.participants[0] : registration.participants;
        const event = Array.isArray(registration.ukt_events) ? registration.ukt_events[0] : registration.ukt_events;
        return <option key={registration.id} value={registration.id}>{person?.nama_lengkap ?? "Peserta"} · {event?.nama ?? "Kegiatan UKT"} · {registration.tingkat_strip}</option>;
      })}</select><button className="button button-primary" type="submit">Buat draft</button></form> : <p className="notice">Belum ada peserta Lulus yang belum memiliki draft sertifikat.</p>}
    </section>
    <section className="panel data-panel"><div className="panel-heading"><div><h2>Daftar sertifikat</h2><p className="muted">{certificates?.length ?? 0} sertifikat</p></div></div>
      {certificatesError ? <p className="notice notice-error">Data sertifikat tidak dapat dimuat. Pastikan migrasi Supabase sudah diterapkan.</p> : certificates?.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Peserta</th><th>Kegiatan</th><th>Nomor</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead><tbody>{certificates.map((certificate) => <tr key={certificate.id}><td><strong>{personNames.get(certificate.event_participant_id) ?? "Peserta"}</strong></td><td>{eventNames.get(certificate.event_participant_id) ?? "Kegiatan UKT"}</td><td>{certificate.nomor_sertifikat ?? "Belum bernomor"}</td><td><span className={`status-pill ${certificate.status === "TERBIT" ? "status-done" : certificate.status === "DICABUT" ? "status-revoked" : "status-draft"}`}>{certificate.status === "TERBIT" ? "Terbit" : certificate.status === "DICABUT" ? "Dicabut" : "Draft"}</span>{certificate.revocation_reason && <small>{certificate.revocation_reason}</small>}</td><td>{formatCertificateDate(certificate.created_at)}</td><td>{certificate.status === "TERBIT" ? <div className="certificate-actions"><a className="text-button" href={`/admin/sertifikat/${certificate.id}/pdf`}>Unduh PDF</a><RevokeCertificateForm certificateId={certificate.id} /></div> : certificate.status === "DRAFT" ? <div className="certificate-actions"><a className="text-button" href={`/admin/sertifikat/${certificate.id}/preview`} target="_blank" rel="noreferrer">Pratinjau PDF</a><form action={issueCertificate} className="inline-action"><input type="hidden" name="certificate_id" value={certificate.id} /><button className="text-button" type="submit">Terbitkan PDF</button></form></div> : certificate.status === "DICABUT" && personNames.has(certificate.event_participant_id) ? <form action={createCertificateDraft} className="inline-action"><input type="hidden" name="event_participant_id" value={certificate.event_participant_id} /><input type="hidden" name="replacement_of_id" value={certificate.id} /><button className="text-button" type="submit">Buat pengganti</button></form> : "—"}</td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-illustration" aria-hidden="true">▤</div><h3>Belum ada sertifikat</h3><p>Draft bisa dibuat setelah peserta UKT disimpan dengan hasil Lulus.</p></div>}
    </section>
  </>;
}

function CertificatesContentFallback() {
  return <div className="certificates-loading" aria-label="Memuat data sertifikat">
    <section className="panel data-panel"><h2>Antrean penerbitan</h2><p className="muted">Memuat draft dan kegiatan yang tersedia.</p></section>
    <section className="panel data-panel"><h2>Daftar sertifikat</h2><p className="muted">Memuat status dan riwayat sertifikat.</p></section>
  </div>;
}
