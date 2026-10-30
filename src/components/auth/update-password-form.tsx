"use client";

import { useState, type FormEvent } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Kata sandi dan konfirmasi harus sama.");
      return;
    }
    setBusy(true);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      setError("Supabase belum dikonfigurasi.");
      setBusy(false);
      return;
    }
    const supabase = createBrowserClient(url, anonKey);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError("Kata sandi belum dapat diperbarui. Buka kembali tautan pemulihan yang terbaru.");
      setBusy(false);
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return <form className="login-form" onSubmit={handleSubmit}>
    <label htmlFor="new-password">Kata sandi baru</label>
    <input id="new-password" type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(event) => setPassword(event.target.value)} />
    <label htmlFor="confirm-password">Konfirmasi kata sandi</label>
    <input id="confirm-password" type="password" autoComplete="new-password" minLength={10} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button className="button button-primary button-full" disabled={busy}>{busy ? "Menyimpan…" : "Simpan kata sandi"}</button>
  </form>;
}
