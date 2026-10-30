import type { ReactNode } from "react";
import { connection } from "next/server";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/admin";

export const instant = false;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await connection();
  const { profile } = await requireAdmin();
  return <AdminShell adminName={profile.nama || profile.email_display || "Administrator"}>{children}</AdminShell>;
}
