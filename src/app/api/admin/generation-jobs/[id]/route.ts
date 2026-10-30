import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireAdmin();
  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  const { data: job, error: jobError } = await supabase.from("generation_jobs")
    .select("id,event_id,job_type,status,total_items,completed_items,failed_items,requested_by,created_at,finished_at,output_asset_id,output_file_name,output_error")
    .eq("id", id).eq("requested_by", user.id).maybeSingle();
  if (jobError || !job) return NextResponse.json({ error: "Job tidak ditemukan." }, { status: 404 });
  const { data: items, error: itemsError } = await supabase.from("generation_job_items")
    .select("id,status,error_message,attempts").eq("job_id", id).order("updated_at", { ascending: false }).limit(5000);
  if (itemsError) return NextResponse.json({ error: "Status job tidak dapat dimuat." }, { status: 500 });
  const rows = items ?? [];
  const counts = {
    waiting: rows.filter((item) => item.status === "MENUNGGU").length,
    processing: rows.filter((item) => item.status === "DIPROSES").length,
    completed: rows.filter((item) => item.status === "BERHASIL").length,
    failed: rows.filter((item) => item.status === "GAGAL").length,
  };
  return NextResponse.json({ job, counts, failures: rows.filter((item) => item.status === "GAGAL").map(({ id: itemId, error_message, attempts }) => ({ id: itemId, message: error_message || "Penerbitan gagal.", attempts })) });
}
