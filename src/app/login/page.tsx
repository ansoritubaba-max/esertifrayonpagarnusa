import { LoginForm } from "@/components/auth/login-form";
import { BrandLogo } from "@/components/brand-logo";

export const instant = false;

type LoginPageProps = {
  searchParams: Promise<{ error?: string; setup?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const message = params.setup
    ? "Aplikasi belum terhubung ke Supabase. Lengkapi pengaturan environment terlebih dahulu."
    : params.error === "unauthorized"
      ? "Akun ini tidak memiliki akses administrator."
      : null;

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <BrandLogo className="brand-mark brand-mark-large" alt="" />
        <p className="eyebrow">RAYON PONDOK PESANTREN AL-AMIEN</p>
        <h1 id="login-title">Masuk ke pengelolaan sertifikat</h1>
        <p className="login-intro">Gunakan akun administrator untuk mengelola kegiatan UKT dan sertifikat digital.</p>
        {message ? <p className="notice notice-error" role="alert">{message}</p> : null}
        <LoginForm nextPath={params.next} />
        <p className="login-reset"><a href="/lupa-kata-sandi">Lupa kata sandi?</a></p>
        <p className="login-footnote">Akses khusus administrator · Tidak ada pendaftaran publik<br />Dikembangkan oleh Muhammad Ansori Mubarok, S.Kom.</p>
      </section>
    </main>
  );
}
