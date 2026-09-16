"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Pencil } from "lucide-react";
import type { ViewingRole } from "@/lib/collaboration";

export function ViewingCollaborativeEditor({
  viewingId,
  role,
  initialRevision,
  initialAddress,
  initialPros,
  initialRisks,
}: {
  viewingId: string;
  role: ViewingRole;
  initialRevision: number;
  initialAddress: string;
  initialPros: string[];
  initialRisks: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState(initialRevision);
  const [address, setAddress] = useState(initialAddress);
  const [pros, setPros] = useState(initialPros.join("\n"));
  const [risks, setRisks] = useState(initialRisks.join("\n"));
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");

  if (role !== "owner" && role !== "editor") return null;

  async function save() {
    setBusy(true);
    setError("");
    setConflict(false);
    try {
      const response = await fetch(`/api/viewings/${viewingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "If-Match": `"${revision}"`,
        },
        body: JSON.stringify({
          address: address.trim(),
          pros: pros
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
          risks: risks
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });
      const body = (await response.json()) as {
        revision?: number;
        error?: string;
      };
      if (response.status === 409) {
        setConflict(true);
        return;
      }
      if (!response.ok || !body.revision) {
        throw new Error(body.error || "儲存失敗");
      }
      setRevision(body.revision);
      setEditing(false);
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[22px] bg-white border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4 mb-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-[800] tracking-widest">
            協作編輯
          </p>
          <p className="mt-1 text-[10px] text-[#9CA3AF]">
            Revision {revision} · 衝突時不會覆寫對方內容
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="h-9 px-3 rounded-full bg-[#F5F3F0] text-[11px] font-bold inline-flex items-center gap-1"
        >
          <Pencil className="w-3.5 h-3.5" />
          {editing ? "取消" : "編輯"}
        </button>
      </div>

      {conflict ? (
        <div className="mt-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] p-3 text-[11px] text-[#92400E]">
          <p className="font-bold inline-flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            另一位家人已更新案件
          </p>
          <p className="mt-1">請重新載入最新版本後再套用你的修改。</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 h-8 px-3 rounded-full bg-[#92400E] text-white font-bold"
          >
            重新載入
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-xl bg-[#FEF2F2] p-2 text-[11px] text-[#991B1B]">
          {error}
        </p>
      ) : null}

      {editing ? (
        <div className="mt-3 space-y-3">
          <label className="block text-[11px] font-bold">
            地址
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className="mt-1 w-full h-10 rounded-xl border border-black/10 px-3 text-[12px] outline-none"
            />
          </label>
          <label className="block text-[11px] font-bold">
            優點（每行一項）
            <textarea
              value={pros}
              onChange={(event) => setPros(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-black/10 p-3 text-[12px] outline-none"
            />
          </label>
          <label className="block text-[11px] font-bold">
            風險（每行一項）
            <textarea
              value={risks}
              onChange={(event) => setRisks(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-black/10 p-3 text-[12px] outline-none"
            />
          </label>
          <button
            type="button"
            disabled={busy || !address.trim()}
            onClick={() => void save()}
            className="w-full h-10 rounded-full bg-black text-white text-[12px] font-bold disabled:opacity-45"
          >
            {busy ? "儲存中…" : "儲存協作修改"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

