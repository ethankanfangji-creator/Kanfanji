"use client";

import { useEffect, useState } from "react";
import { Copy, MessageCircle, UserPlus, Users, X } from "lucide-react";
import type {
  CollaborationOverview,
  MemberRole,
  ViewingComment,
} from "@/lib/collaboration";

const ROLE_LABEL: Record<string, string> = {
  owner: "擁有者",
  editor: "可編輯",
  commenter: "可留言",
  viewer: "只讀",
};

export function CollaborationPanel({ viewingId }: { viewingId: string }) {
  const [overview, setOverview] = useState<CollaborationOverview | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("viewer");
  const [inviteUrl, setInviteUrl] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await fetch(`/api/viewings/${viewingId}/collaboration`);
      const body = (await response.json()) as CollaborationOverview & {
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "讀取協作設定失敗");
      setOverview(body);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "讀取協作設定失敗",
      );
    }
  }

  useEffect(() => {
    let active = true;
    void fetch(`/api/viewings/${viewingId}/collaboration`)
      .then(async (response) => {
        const body = (await response.json()) as CollaborationOverview & {
          error?: string;
        };
        if (!response.ok) throw new Error(body.error || "讀取協作設定失敗");
        if (active) setOverview(body);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "讀取協作設定失敗",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [viewingId]);

  async function createInvite() {
    setBusy(true);
    setError("");
    setInviteUrl("");
    try {
      const response = await fetch(`/api/viewings/${viewingId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const body = (await response.json()) as {
        inviteUrl?: string;
        error?: string;
      };
      if (!response.ok || !body.inviteUrl) {
        throw new Error(body.error || "建立邀請失敗");
      }
      setInviteUrl(body.inviteUrl);
      setEmail("");
      await load();
    } catch (inviteError) {
      setError(
        inviteError instanceof Error ? inviteError.message : "建立邀請失敗",
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeMember(memberId: string, nextRole: MemberRole) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/viewings/${viewingId}/members/${memberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: nextRole }),
        },
      );
      if (!response.ok) throw new Error("更新角色失敗");
      await load();
    } catch (memberError) {
      setError(
        memberError instanceof Error ? memberError.message : "更新角色失敗",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revokeMember(memberId: string) {
    if (!window.confirm("確定移除此家人？對方會立即失去案件與媒體存取權。")) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        `/api/viewings/${viewingId}/members/${memberId}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("移除成員失敗");
      await load();
    } catch (memberError) {
      setError(
        memberError instanceof Error ? memberError.message : "移除成員失敗",
      );
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(inviteId: string) {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/viewings/${viewingId}/invites/${inviteId}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("撤銷邀請失敗");
      setInviteUrl("");
      await load();
    } catch (inviteError) {
      setError(
        inviteError instanceof Error ? inviteError.message : "撤銷邀請失敗",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addComment() {
    const text = comment.trim();
    if (!text) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/viewings/${viewingId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const body = (await response.json()) as {
        comment?: ViewingComment;
        error?: string;
      };
      if (!response.ok || !body.comment) {
        throw new Error(body.error || "留言失敗");
      }
      setComment("");
      setOverview((current) =>
        current
          ? { ...current, comments: [...current.comments, body.comment!] }
          : current,
      );
    } catch (commentError) {
      setError(
        commentError instanceof Error ? commentError.message : "留言失敗",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!overview && !error) {
    return (
      <div role="status" aria-live="polite" className="rounded-[22px] bg-white border border-black/[0.05] p-4 mb-4 text-[12px] text-[#6B7280]">
        載入家人協作…
      </div>
    );
  }

  if (!overview) {
    return (
      <div role="alert" className="rounded-[22px] bg-[#FFFBEB] border border-[#FDE68A] p-4 mb-4 text-[12px] text-[#92400E]">
        家人協作尚未啟用：{error}
      </div>
    );
  }

  const canComment = ["owner", "editor", "commenter"].includes(overview.role);

  return (
    <section className="rounded-[22px] bg-white border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4 mb-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-[800] tracking-widest inline-flex items-center gap-1.5">
          <Users className="w-4 h-4" /> 家人協作
        </p>
        <span className="px-2 py-1 rounded-full bg-[#F5F3F0] text-[10px] font-bold">
          {ROLE_LABEL[overview.role]}
        </span>
      </div>
      <p className="mt-1 text-[10px] text-[#9CA3AF]">
        案件版本 {overview.revision} · 公開分享仍僅限擁有者
      </p>

      {error ? (
        <p role="alert" className="mt-3 rounded-xl bg-[#FEF2F2] p-2 text-[11px] text-[#991B1B]">
          {error}
        </p>
      ) : null}

      {overview.role === "owner" ? (
        <div className="mt-4 rounded-xl bg-[#FAF7F3] border border-black/5 p-3">
          <p className="text-[11px] font-bold inline-flex items-center gap-1">
            <UserPlus className="w-3.5 h-3.5" /> 邀請家人
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="email"
              aria-label="家人電子郵件"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="family@example.com"
              className="min-w-0 flex-1 h-10 rounded-full bg-white border border-black/10 px-3 text-[12px] outline-none"
            />
            <select
              aria-label="邀請權限"
              value={role}
              onChange={(event) => setRole(event.target.value as MemberRole)}
              className="h-10 rounded-full bg-white border border-black/10 px-2 text-[11px]"
            >
              <option value="viewer">只讀</option>
              <option value="commenter">可留言</option>
              <option value="editor">可編輯</option>
            </select>
          </div>
          <button
            type="button"
            disabled={busy || !email.includes("@")}
            onClick={() => void createInvite()}
              className="mt-2 w-full min-h-11 rounded-full bg-black text-white text-[12px] font-bold disabled:opacity-45"
          >
            建立 7 天邀請連結
          </button>
          {inviteUrl ? (
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(inviteUrl)}
              className="mt-2 w-full text-left rounded-xl bg-white border border-black/5 p-2 text-[10px] text-[#2563EB] break-all"
            >
              <span className="font-bold text-[#1A1A1A] inline-flex items-center gap-1">
                <Copy className="w-3 h-3" /> 複製邀請
              </span>
              <br />
              {inviteUrl}
            </button>
          ) : null}
        </div>
      ) : null}

      {overview.members.filter((member) => member.status === "active").length >
      0 ? (
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-bold">成員</p>
          {overview.members
            .filter((member) => member.status === "active")
            .map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2 rounded-xl border border-black/5 p-2"
              >
                <span className="min-w-0 flex-1 truncate text-[11px]">
                  {member.displayEmail || "家人成員"}
                </span>
                {overview.role === "owner" ? (
                  <>
                    <select
                      value={member.role}
                      aria-label={`${member.displayEmail || "家人成員"}權限`}
                      disabled={busy}
                      onChange={(event) =>
                        void changeMember(
                          member.id,
                          event.target.value as MemberRole,
                        )
                      }
                      className="h-8 rounded-full border border-black/10 px-2 text-[10px]"
                    >
                      <option value="viewer">只讀</option>
                      <option value="commenter">可留言</option>
                      <option value="editor">可編輯</option>
                    </select>
                    <button
                      type="button"
                      aria-label="移除成員"
                      disabled={busy}
                      onClick={() => void revokeMember(member.id)}
                      className="min-w-11 min-h-11 rounded-full border border-[#FECACA] text-[#991B1B] flex items-center justify-center"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <span className="text-[10px] text-[#6B7280]">
                    {ROLE_LABEL[member.role]}
                  </span>
                )}
              </div>
            ))}
        </div>
      ) : null}

      {overview.role === "owner" &&
      overview.invites.some((invite) => invite.status === "pending") ? (
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-bold">待接受邀請</p>
          {overview.invites
            .filter((invite) => invite.status === "pending")
            .map((invite) => (
              <div
                key={invite.id}
                className="flex items-center gap-2 text-[10px] rounded-xl bg-[#FAF7F3] p-2"
              >
                <span className="min-w-0 flex-1 truncate">
                  {invite.email} · {ROLE_LABEL[invite.role]}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`撤銷 ${invite.email} 的邀請`}
                  onClick={() => void revokeInvite(invite.id)}
                  className="min-h-11 px-2 font-bold text-[#991B1B]"
                >
                  撤銷
                </button>
              </div>
            ))}
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-[11px] font-bold inline-flex items-center gap-1">
          <MessageCircle className="w-3.5 h-3.5" /> 家人留言
        </p>
        <div className="mt-2 space-y-2">
          {overview.comments.length === 0 ? (
            <p className="text-[11px] text-[#9CA3AF]">尚無留言</p>
          ) : (
            overview.comments.map((item) => (
              <div
                key={item.id}
                className="rounded-xl bg-[#FAF7F3] border border-black/5 p-2"
              >
                <p className="text-[10px] font-bold text-[#6B7280]">
                  {item.authorLabel} ·{" "}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 text-[12px] leading-[1.45]">{item.body}</p>
              </div>
            ))
          )}
        </div>
        {canComment ? (
          <div className="mt-2 flex gap-2">
            <input
              aria-label="新增家人留言"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="新增不會修改案件正文的留言…"
              className="min-w-0 flex-1 h-10 rounded-full border border-black/10 px-3 text-[12px] outline-none"
            />
            <button
              type="button"
              disabled={busy || !comment.trim()}
              onClick={() => void addComment()}
              className="min-h-11 px-3 rounded-full bg-black text-white text-[11px] font-bold disabled:opacity-45"
            >
              留言
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

