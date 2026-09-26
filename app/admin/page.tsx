import Link from "next/link";
import { fingerprint } from "@/lib/ai-boundary/quota";
import { createAdminClient } from "@/utils/supabase/admin";

const PAGE_SIZE = 20;

type ListedUser = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  manual_pro_until: string | null;
  viewing_count: number;
};

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q = "", page = "1" } = await searchParams;
  const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("admin_list_users", {
    p_query: q,
    p_limit: PAGE_SIZE,
    p_offset: (pageNumber - 1) * PAGE_SIZE,
  });
  const users = (data ?? []) as ListedUser[];
  let usage = new Map<string, number>();
  if (!error && users.length > 0) {
    const keys = users.map((user) => `user:${fingerprint(user.id)}`);
    const { data: windows } = await admin.rpc("admin_get_ai_usage", { p_keys: keys });
    usage = new Map(
      ((windows ?? []) as { quota_key: string; request_count: number }[]).map((row) => [
        row.quota_key,
        row.request_count,
      ]),
    );
  }

  return (
    <main>
      <h1 className="text-2xl font-bold">使用者</h1>
      <p className="mt-2 text-sm text-[#6B7280]">
        AI 次數只是目前視窗，不是歷史用量。瀏覽器裡的看房紀錄不在這裡。
      </p>
      <form className="mt-4 flex gap-2" action="/admin">
        <input
          name="q"
          defaultValue={q}
          placeholder="Email 或使用者 ID"
          className="min-h-11 flex-1 rounded-xl border border-black/10 px-3"
        />
        <button className="min-h-11 rounded-xl bg-[#111111] px-4 text-sm font-bold text-white" type="submit">
          搜尋
        </button>
      </form>
      {error ? <p className="mt-4 text-sm text-[#991B1B]">無法讀取使用者。</p> : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-[#6B7280]">
              <th className="py-2 pr-3">Email</th>
              <th className="py-2 pr-3">建立</th>
              <th className="py-2 pr-3">上次登入</th>
              <th className="py-2 pr-3">訂閱</th>
              <th className="py-2 pr-3">手動 Pro</th>
              <th className="py-2 pr-3">雲端看房</th>
              <th className="py-2 pr-3">AI 視窗</th>
              <th className="py-2">停用至</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-black/5">
                <td className="py-2 pr-3">
                  <Link className="font-semibold underline-offset-2 hover:underline" href={`/admin/users/${user.id}`}>
                    {user.email || user.id}
                  </Link>
                </td>
                <td className="py-2 pr-3">{user.created_at.slice(0, 10)}</td>
                <td className="py-2 pr-3">{user.last_sign_in_at?.slice(0, 10) || "—"}</td>
                <td className="py-2 pr-3">
                  {user.subscription_status || "—"} {user.subscription_plan || ""}
                </td>
                <td className="py-2 pr-3">{user.manual_pro_until?.slice(0, 10) || "—"}</td>
                <td className="py-2 pr-3">{user.viewing_count}</td>
                <td className="py-2 pr-3">{usage.get(`user:${fingerprint(user.id)}`) ?? 0}</td>
                <td className="py-2">{user.banned_until?.slice(0, 10) || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex gap-3 text-sm">
        {pageNumber > 1 ? (
          <Link href={`/admin?q=${encodeURIComponent(q)}&page=${pageNumber - 1}`}>上一頁</Link>
        ) : null}
        {users.length === PAGE_SIZE ? (
          <Link href={`/admin?q=${encodeURIComponent(q)}&page=${pageNumber + 1}`}>下一頁</Link>
        ) : null}
      </div>
    </main>
  );
}
