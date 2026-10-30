import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("admin_profiles")
    .select("nama, email_display, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile?.is_active) {
    await supabase.auth.signOut();
    redirect("/login?error=unauthorized");
  }

  return { user, profile };
}
