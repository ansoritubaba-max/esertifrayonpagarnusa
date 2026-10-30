import { PasswordResetRequestForm } from "@/components/auth/password-reset-request-form";
import { BrandLogo } from "@/components/brand-logo";

export default function ForgotPasswordPage() {
  return <main className="login-page"><section className="login-card" aria-labelledby="reset-title">
    <BrandLogo className="brand-mark brand-mark-large" alt="" />
    <p className="eyebrow">PEMULIHAN AKUN</p>
    <h1 id="reset-title">Atur ulang kata sandi</h1>
    <p className="login-intro">Masukkan email administrator. Kami akan mengirimkan tautan pemulihan jika akun terdaftar.</p>
    <PasswordResetRequestForm />
    <p className="login-footnote"><a className="back-link" href="/login">← Kembali ke login</a></p>
  </section></main>;
}
