"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function saveCertificateTemplate(formData: FormData) {
  const { user } = await requireAdmin();
  const title = String(formData.get("judul") ?? "").trim();
  const body = String(formData.get("redaksi") ?? "").trim();
  const tingkatStripOptions = String(formData.get("tingkat_strip_options") ?? "")
    .split(/[\n,;]/).map((item) => item.trim()).filter(Boolean);
  if (!title || !body) redirect("/admin/pengaturan/template?error=invalid");
  if (tingkatStripOptions.some((item) => item.length > 80) || tingkatStripOptions.length > 50) redirect("/admin/pengaturan/template?error=levels");

  const supabase = createSupabaseAdminClient();
  const config = { title, body, tingkat_strip_options: [...new Set(tingkatStripOptions)] };
  const { data: active, error: readError } = await supabase.from("certificate_templates").select("id").eq("is_active", true).maybeSingle();
  if (readError) redirect("/admin/pengaturan/template?error=save");

  const result = active
    ? await supabase.from("certificate_templates").update({ nama: title, config_json: config }).eq("id", active.id)
    : await supabase.from("certificate_templates").insert({ version: "1.0", nama: title, config_json: config, is_active: true });
  if (result.error) redirect("/admin/pengaturan/template?error=save");

  await supabase.from("audit_logs").insert({ actor_id: user.id, action: "certificate_template.updated", entity_type: "certificate_template", entity_id: active?.id ?? null, metadata: { title } });
  revalidatePath("/admin/pengaturan/template");
  redirect("/admin/pengaturan/template?success=saved");
}
