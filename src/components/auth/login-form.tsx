"use client";

import { useState, type FormEvent } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

type LoginFormProps = { nextPath?: string };

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      setError("Supabase belum dikonfigurasi. Silakan hubungi pengelola aplikasi.");
      setIsLoading(false);
      return;
    }

    const supabase = createBrowserClient(url, anonKey);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError("Email atau kata sandi tidak sesuai.");
      setIsLoading(false);
      return;
    }

    router.replace(nextPath?.startsWith("/admin") ? nextPath : "/admin");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
      <label htmlFor="password">Kata sandi</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button-primary button-full" type="submit" disabled={isLoading}>
        {isLoading ? "Memeriksa akun…" : "Masuk ke dashboard"}
      </button>
    </form>
  );
}
