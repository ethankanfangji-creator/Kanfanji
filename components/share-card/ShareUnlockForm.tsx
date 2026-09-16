"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

export function ShareUnlockForm({
  token,
  message,
}: {
  token: string;
  message: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/share/public/${encodeURIComponent(token)}/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || "解鎖失敗");
        setPassword("");
        return;
      }
      setPassword("");
      router.refresh();
    } catch {
      setError("網路錯誤，請重試");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      className="rounded-[28px] bg-white border border-black/5 shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-6 sm:p-8"
    >
      <div className="mx-auto w-12 h-12 rounded-full bg-[#FEF3C7] flex items-center justify-center mb-4">
        <Lock className="w-6 h-6 text-[#92400E]" />
      </div>
      <h1 className="text-[18px] font-bold text-center">需要密碼</h1>
      <p className="mt-2 text-[13px] text-[#6B7280] text-center leading-[1.5]">{message}</p>
      <label className="mt-5 block text-[11px] font-bold tracking-wide text-[#6B7280]">
        密碼
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1.5 w-full h-11 rounded-full border border-black/10 px-4 text-[14px] outline-none focus:border-black/30"
          placeholder="輸入分享密碼"
        />
      </label>
      {error ? <p className="mt-2 text-[12px] text-[#B91C1C]">{error}</p> : null}
      <button
        type="submit"
        disabled={busy || password.length === 0}
        className="mt-4 w-full h-11 rounded-full bg-black text-white text-[13px] font-bold disabled:opacity-50"
      >
        {busy ? "驗證中…" : "解鎖檢視"}
      </button>
      <p className="mt-3 text-[10px] text-center text-[#9CA3AF]">
        密碼不會寫入網址，僅以安全 Cookie 記住本次解鎖。
      </p>
    </form>
  );
}
