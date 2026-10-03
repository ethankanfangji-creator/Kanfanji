"use client";

import { useState } from "react";

export function ChatInvite({ viewingId }: { viewingId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function createLink() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/viewings/${viewingId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: "commenter" }),
      });
      const body = (await response.json()) as { inviteUrl?: string; error?: string };
      if (response.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(`/viewings/${viewingId}`)}`;
        return null;
      }
      if (response.status === 403) {
        setError("只有這筆看房的擁有者可以邀請。");
        return null;
      }
      if (!response.ok || !body.inviteUrl) {
        setError("邀請沒有建立。請確認已登入，而且 email 正確。");
        return null;
      }
      setLink(body.inviteUrl);
      return body.inviteUrl;
    } catch {
      setError("邀請沒有建立。請確認已登入，而且 email 正確。");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center rounded-full px-3 text-[12px] font-bold text-[#4B5563] hover:bg-black/5"
      >
        邀請
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-2xl border border-black/10 bg-white p-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
          <label className="block text-[12px] font-medium text-[#6B7280]">
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              inputMode="email"
              className="mt-1 h-10 w-full rounded-xl border border-black/10 px-3 text-[14px] text-[#1A1A1A]"
            />
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy || !email.includes("@")}
              className="h-9 flex-1 rounded-full bg-black text-[12px] font-bold text-white disabled:opacity-40"
              onClick={() => {
                void createLink().then((url) => {
                  if (!url) return;
                  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("看房記邀請")}&body=${encodeURIComponent(url)}`;
                });
              }}
            >
              寄出邀請
            </button>
            <button
              type="button"
              disabled={busy || !email.includes("@")}
              className="h-9 flex-1 rounded-full border border-black text-[12px] font-bold disabled:opacity-40"
              onClick={() => {
                void createLink().then(async (url) => {
                  if (!url) return;
                  await navigator.clipboard.writeText(url);
                });
              }}
            >
              複製簡訊連結
            </button>
          </div>
          {link ? <p className="mt-2 break-all text-[11px] text-[#6B7280]">{link}</p> : null}
          {error ? <p className="mt-2 text-[12px] text-[#991B1B]">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
