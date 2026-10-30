import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import { BrandLogo } from "@/components/brand-logo";

export default function UpdatePasswordPage() {
  return <main className="login-page"><section className="login-card" aria-labelledby="update-title">
    <BrandLogo className="brand-mark brand-mark-large" alt="" />
    <p className="eyebrow">PEMULIHAN AKUN</p>
    <h1 id="update-title">Buat kata sandi baru</h1>
    <p className="login-intro">Gunakan kata sandi yang kuat dan simpan dengan aman.</p>
    <UpdatePasswordForm />
  </section></main>;
}
