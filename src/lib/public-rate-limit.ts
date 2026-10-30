import "server-only";
import { createHmac } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const requests = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const LIMIT = 30;

export async function allowPublicVerification(requestKey: string) {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return false;
  const clientHash = createHmac("sha256", secret).update(requestKey.slice(0, 200)).digest("hex");
  let databaseAllowed: boolean | null = null;
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("allow_certificate_verification", { p_client_hash: clientHash });
    if (!error && typeof data === "boolean") databaseAllowed = data;
  } catch {
    databaseAllowed = null;
  }
  if (databaseAllowed !== null) return databaseAllowed;
  const now = Date.now();
  const recent = (requests.get(clientHash) ?? []).filter((time) => time > now - WINDOW_MS);
  if (recent.length >= LIMIT) {
    requests.set(clientHash, recent);
    return false;
  }
  recent.push(now);
  requests.set(clientHash, recent);
  if (requests.size > 2_000) {
    for (const [key, values] of requests) {
      if (!values.some((time) => time > now - WINDOW_MS)) requests.delete(key);
    }
  }
  return true;
}
