import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/guard";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "看房記後台",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="min-h-screen bg-[#F7F4EF] text-[#111111]">
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}
