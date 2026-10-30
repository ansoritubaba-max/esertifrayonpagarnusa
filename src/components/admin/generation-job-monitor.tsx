"use client";

import { useEffect, useState } from "react";

type JobSnapshot = {
  job: { id: string; status: string; total_items: number; output_asset_id: string | null; output_file_name: string | null; output_error: string | null };
  counts: { waiting: number; processing: number; completed: number; failed: number };
  failures: { id: string; message: string; attempts: number }[];
};

const terminalStatuses = new Set(["BERHASIL", "SEBAGIAN_GAGAL", "GAGAL"]);

export function GenerationJobMonitor({ jobId }: { jobId: string }) {
  const [snapshot, setSnapshot] = useState<JobSnapshot | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const pause = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

    async function run() {
      try {
        while (!controller.signal.aborted) {
          const response = await fetch(`/api/admin/generation-jobs/${jobId}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error("Status penerbitan tidak dapat dimuat.");
          const current = await response.json() as JobSnapshot;
          setSnapshot(current);
          if (terminalStatuses.has(current.job.status)) return;
          const processResponse = await fetch(`/api/admin/generation-jobs/${jobId}/process`, { method: "POST", signal: controller.signal });
          if (!processResponse.ok && processResponse.status !== 404) throw new Error("Penerbitan massal terhenti. Muat ulang halaman untuk melanjutkan.");
          await pause(350);
        }
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Terjadi gangguan saat memantau penerbitan.");
      }
    }

    void run();
    return () => controller.abort();
  }, [jobId]);

  if (!snapshot) return <section className="panel generation-job-panel" aria-live="polite"><h2>Menyiapkan penerbitan massal</h2><p className="muted">Memuat antrean dan memulai proses secara bertahap.</p>{message && <p className="form-error" role="alert">{message}</p>}</section>;

  const { job, counts, failures } = snapshot;
  const percent = job.total_items ? Math.round((counts.completed + counts.failed) / job.total_items * 100) : 0;
  const statusLabel: Record<string, string> = { MENUNGGU: "Menunggu", DIPROSES: "Sedang diproses", BERHASIL: "Selesai", SEBAGIAN_GAGAL: "Sebagian gagal", GAGAL: "Gagal" };

  return <section className="panel generation-job-panel" aria-live="polite">
    <div className="panel-heading"><div><h2>Progres penerbitan massal</h2><p className="muted">Status: {statusLabel[job.status] ?? job.status}</p></div><strong>{percent}%</strong></div>
    <progress className="generation-progress" value={percent} max="100" aria-label="Progres penerbitan sertifikat" />
    <p className="generation-job-counts">{counts.completed} berhasil · {counts.failed} gagal · {counts.waiting + counts.processing} menunggu · total {job.total_items}</p>
    {message && <p className="form-error" role="alert">{message}</p>}
    {job.output_error && <p className="notice notice-error" role="alert">{job.output_error}</p>}
    {failures.length > 0 && <div className="generation-failures"><h3>Item yang perlu diperiksa</h3><ul>{failures.map((failure) => <li key={failure.id}>{failure.message} <span>{failure.attempts} percobaan</span></li>)}</ul></div>}
    {job.output_asset_id && job.output_file_name && <a className="button button-primary generation-download" href={`/api/admin/generation-jobs/${job.id}/download`}>Unduh {job.output_file_name}</a>}
  </section>;
}
