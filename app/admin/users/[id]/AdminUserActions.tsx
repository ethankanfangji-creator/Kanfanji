"use client";

import { useState } from "react";

async function post(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "失敗");
  }
}

export function AdminUserActions({
  userId,
  isAdmin,
  stripeActive,
}: {
  userId: string;
  isAdmin: boolean;
  stripeActive: boolean;
}) {
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");

  async function run(task: () => Promise<void>) {
    setMessage("");
    try {
      await task();
      setMessage("已完成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "失敗");
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <label className="block text-sm font-semibold">
        原因（至少 3 字）
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="mt-1 min-h-20 w-full rounded-xl border border-black/10 p-3"
        />
      </label>
      {stripeActive ? (
        <p className="text-sm text-[#92400E]">
          這位使用者有有效的 Stripe 訂閱。停用帳號不會自動取消訂閱。
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input
          type="datetime-local"
          value={until}
          onChange={(event) => setUntil(event.target.value)}
          className="min-h-11 rounded-xl border border-black/10 px-3"
        />
        <button
          type="button"
          className="min-h-11 rounded-xl bg-[#111111] px-3 text-sm font-bold text-white"
          onClick={() =>
            void run(() =>
              post(`/api/admin/users/${userId}/pro`, {
                grant: true,
                until: new Date(until).toISOString(),
                reason,
              }),
            )
          }
        >
          給予手動 Pro
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-black/10 px-3 text-sm font-bold"
          onClick={() =>
            void run(() => post(`/api/admin/users/${userId}/pro`, { grant: false, reason }))
          }
        >
          收回手動 Pro
        </button>
      </div>
      <div className="space-y-2">
        <p className="text-sm text-[#6B7280]">
          只重置這個帳號的每日次數。裝置與 IP 的次數後台查不到，使用者仍可能被擋。
        </p>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-black/10 px-3 text-sm font-bold"
          onClick={() => void run(() => post(`/api/admin/users/${userId}/quota`, { reason }))}
        >
          重置 AI 額度
        </button>
      </div>
      {isAdmin ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirm}
            onChange={(event) => setConfirm(event.target.checked)}
          />
          我確認要變更這位管理員
        </label>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          className="min-h-11 rounded-xl bg-[#991B1B] px-3 text-sm font-bold text-white"
          onClick={() =>
            void run(() =>
              post(`/api/admin/users/${userId}/ban`, { ban: true, reason, confirm }),
            )
          }
        >
          停用帳號
        </button>
        <button
          type="button"
          className="min-h-11 rounded-xl border border-black/10 px-3 text-sm font-bold"
          onClick={() =>
            void run(() =>
              post(`/api/admin/users/${userId}/ban`, { ban: false, reason, confirm }),
            )
          }
        >
          恢復帳號
        </button>
      </div>
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}
