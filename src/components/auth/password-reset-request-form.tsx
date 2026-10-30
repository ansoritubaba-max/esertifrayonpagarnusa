"use client";

import { useState, type FormEvent } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function PasswordResetRequestForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      setError("Pemulihan akun belum tersedia karena Supabase belum dikonfigurasi.");
      setBusy(false);
      return;
    }
    const supabase = createBrowserClient(url, anonKey);
    const redirectTo = `${window.location.origin}/auth/callback?next=/atur-ulang-kata-sandi`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (resetError) setError("Tautan pemulihan belum dapat dikirim. Coba kembali nanti.");
    else setMessage("Jika email tersebut terdaftar, tautan pemulihan akan segera dikirim.");
    setBusy(false);
  }

  return <form className="login-form" onSubmit={handleSubmit}>
    <label htmlFor="reset-email">Email administrator</label>
    <input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {message ? <p className="notice notice-success" role="status">{message}</p> : null}
    <button className="button button-primary button-full" disabled={busy}>{busy ? "Mengirim tautan…" : "Kirim tautan pemulihan"}</button>
  </form>;
}
