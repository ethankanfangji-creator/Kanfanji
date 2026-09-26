import Link from "next/link";
import { AdminUserActions } from "./AdminUserActions";
import { isActiveSubscriptionStatus } from "@/lib/billing-status";
import { createAdminClient } from "@/utils/supabase/admin";

export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();
  const [{ data: userResult, error }, { data: subscription }] = await Promise.all([
    admin.auth.admin.getUserById(id),
    admin
      .from("subscriptions")
      .select("status, plan, manual_pro_until")
      .eq("user_id", id)
      .maybeSingle(),
  ]);
  if (error || !userResult.user) {
    return (
      <main>
        <p>找不到使用者。</p>
        <Link href="/admin">返回</Link>
      </main>
    );
  }
  const user = userResult.user;
  return (
    <main>
      <Link href="/admin" className="text-sm text-[#6B7280]">
        返回列表
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{user.email || user.id}</h1>
      <dl className="mt-4 grid gap-2 text-sm">
        <div>狀態：{subscription?.status || "沒有訂閱列"} {subscription?.plan || ""}</div>
        <div>手動 Pro 到：{subscription?.manual_pro_until || "—"}</div>
        <div>停用至：{user.banned_until || "—"}</div>
      </dl>
      <p className="mt-4 text-sm text-[#6B7280]">
        手動 Pro 不會提高 AI 每日次數。停用後，現有的登入憑證大約還能用到預設的一小時。
      </p>
      <AdminUserActions
        userId={user.id}
        isAdmin={user.app_metadata?.role === "admin"}
        stripeActive={isActiveSubscriptionStatus(subscription?.status)}
      />
    </main>
  );
}
