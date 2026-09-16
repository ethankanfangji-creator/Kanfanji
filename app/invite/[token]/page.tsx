"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

export default function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<
    "checking" | "ready" | "accepting" | "error"
  >("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void params.then(({ token: value }) => setToken(value));
  }, [params]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const {
        data: { user },
      } = await createClient().auth.getUser();
      if (!user) {
        const next = `/invite/${encodeURIComponent(token)}`;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      setStatus("ready");
    })();
  }, [router, token]);

  async function accept() {
    setStatus("accepting");
    setMessage("");
    try {
      const response = await fetch(
        `/api/invites/${encodeURIComponent(token)}/accept`,
        { method: "POST" },
      );
      const body = (await response.json()) as {
        viewingId?: string;
        error?: string;
      };
      if (!response.ok || !body.viewingId) {
        setStatus("error");
        setMessage(body.error || "邀請無法接受");
        return;
      }
      router.replace(`/viewings/${body.viewingId}`);
    } catch {
      setStatus("error");
      setMessage("網路錯誤，請稍後再試");
    }
  }

  return (
    <main className="min-h-screen bg-[#FDF6F0] flex justify-center px-4 pt-16">
      <section className="w-full max-w-[420px] h-fit rounded-[28px] bg-white border border-black/5 p-7 text-center shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
        <div className="mx-auto w-12 h-12 rounded-full bg-[#EEF2FF] text-[#4338CA] flex items-center justify-center">
          <UserPlus className="w-6 h-6" />
        </div>
        <h1 className="mt-4 text-[19px] font-bold">加入家人看房案件</h1>
        <p className="mt-2 text-[13px] leading-[1.5] text-[#6B7280]">
          邀請會核對目前登入帳號的 email。接受後只能依邀請角色操作。
        </p>

        {message ? (
          <p className="mt-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA] p-3 text-[12px] text-[#991B1B]">
            {message}
          </p>
        ) : null}

        <button
          type="button"
          disabled={status !== "ready"}
          onClick={() => void accept()}
          className="mt-5 w-full h-11 rounded-full bg-black text-white text-[13px] font-bold disabled:opacity-50"
        >
          {status === "checking"
            ? "確認登入狀態…"
            : status === "accepting"
              ? "接受中…"
              : "接受邀請"}
        </button>
        <Link
          href="/"
          className="inline-flex mt-4 text-[12px] text-[#6B7280] underline"
        >
          返回首頁
        </Link>
      </section>
    </main>
  );
}

