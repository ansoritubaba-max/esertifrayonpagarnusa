export function PlaceholderPage({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-content">
    <header className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div></header>
    <section className="placeholder-panel"><div><div className="empty-illustration" aria-hidden="true" style={{ margin: "0 auto 14px" }}>✦</div><h2>Modul sedang disiapkan</h2><p>Fondasi aplikasi dan akses administrator sudah tersedia. Modul ini akan dibangun pada tahap implementasi berikutnya sesuai PRD.</p></div></section>
  </div>;
}
