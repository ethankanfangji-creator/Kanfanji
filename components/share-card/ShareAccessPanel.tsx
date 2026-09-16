"use client";

import { useState } from "react";
import { Link2, RefreshCw, ShieldOff, Timer } from "lucide-react";
import type { ShareLinkRecord } from "@/lib/share-access/types";

export type ShareAccessPanelLabels = {
  title: string;
  statusLabel: string;
  statusActive: string;
  statusLocal: string;
  statusNone: string;
  statusRevoked: string;
  statusExpired: string;
  lastUpdated: string;
  tokenOk: string;
  expiry: string;
  expirySave: string;
  password: string;
  passwordSave: string;
  passwordClear: string;
  passwordPlaceholder: string;
  revoke: string;
  rotate: string;
  readOnly: string;
  copyHint: string;
  expiresAtLabel: string;
  passwordOn: string;
  passwordOff: string;
  confirmRevoke: string;
  busy: string;
  errorGeneric: string;
};

type Props = {
  labels: ShareAccessPanelLabels;
  shareUrl: string;
  hasToken: boolean;
  lastUpdatedAt: string | null;
  synced: boolean;
  viewingId: string | null;
  link: ShareLinkRecord | null;
  onCopyLink?: () => void;
  onLinkChanged: (next: {
    link: ShareLinkRecord | null;
    urlPath?: string;
  }) => void;
};

export function ShareAccessPanel({
  labels,
  shareUrl,
  hasToken,
  lastUpdatedAt,
  synced,
  viewingId,
  link,
  onCopyLink,
  onLinkChanged,
}: Props) {
  const [expiresLocal, setExpiresLocal] = useState(
    link?.expiresAt ? link.expiresAt.slice(0, 16) : "",
  );
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showExpiry, setShowExpiry] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const status =
    link?.status === "revoked"
      ? labels.statusRevoked
      : link?.status === "expired"
        ? labels.statusExpired
        : !hasToken
          ? labels.statusNone
          : synced
            ? labels.statusActive
            : labels.statusLocal;

  async function run(action: () => Promise<void>) {
    if (!viewingId) {
      setError("請先同步雲端案件");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  async function ensureLink(): Promise<ShareLinkRecord> {
    if (link?.id && link.token) return link;
    const res = await fetch("/api/share/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewingId }),
    });
    const payload = (await res.json()) as {
      link?: ShareLinkRecord;
      urlPath?: string;
      error?: string;
    };
    if (!res.ok || !payload.link) throw new Error(payload.error || labels.errorGeneric);
    onLinkChanged({ link: payload.link, urlPath: payload.urlPath });
    return payload.link;
  }

  return (
    <section
      data-testid="share-access-panel"
      className="rounded-[22px] bg-white border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-[800] tracking-widest">{labels.title}</p>
          <p className="mt-1 text-[12px] text-[#6B7280]">
            {labels.statusLabel}: <span className="font-bold text-[#1A1A1A]">{status}</span>
          </p>
          <p className="mt-0.5 text-[11px] text-[#9CA3AF]">
            {labels.lastUpdated}:{" "}
            {lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleString() : "—"}
          </p>
          {link?.expiresAt ? (
            <p className="mt-0.5 text-[11px] text-[#9CA3AF]">
              {labels.expiresAtLabel}: {new Date(link.expiresAt).toLocaleString()}
            </p>
          ) : null}
          <p className="mt-0.5 text-[11px] text-[#9CA3AF]">
            {link?.passwordEnabled ? labels.passwordOn : labels.passwordOff}
          </p>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-[#F5F3F0] text-[#6B7280]">
          {labels.readOnly}
        </span>
      </div>

      {shareUrl ? (
        <button
          type="button"
          onClick={onCopyLink}
          className="w-full text-left text-[11px] break-all rounded-xl bg-[#FAF7F3] border border-black/5 px-3 py-2 text-[#2563EB]"
        >
          <span className="inline-flex items-center gap-1 font-bold text-[#1A1A1A] mb-1">
            <Link2 className="w-3.5 h-3.5" /> {labels.copyHint}
          </span>
          <br />
          {shareUrl}
        </button>
      ) : null}

      {hasToken ? <p className="text-[11px] text-[#166534]">{labels.tokenOk}</p> : null}
      {error ? <p className="text-[12px] text-[#B91C1C]">{error}</p> : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button
          type="button"
          disabled={busy || !viewingId}
          onClick={() => setShowExpiry((v) => !v)}
          className="h-10 rounded-full border border-black/10 text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-45"
        >
          <Timer className="w-3.5 h-3.5" /> {labels.expiry}
        </button>
        <button
          type="button"
          disabled={busy || !viewingId}
          onClick={() => setShowPassword((v) => !v)}
          className="h-10 rounded-full border border-black/10 text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-45"
        >
          <ShieldOff className="w-3.5 h-3.5" /> {labels.password}
        </button>
        <button
          type="button"
          disabled={busy || !viewingId}
          onClick={() =>
            void run(async () => {
              const current = await ensureLink();
              const res = await fetch(`/api/share/links/${current.id}/rotate`, {
                method: "POST",
              });
              const payload = (await res.json()) as {
                link?: ShareLinkRecord;
                urlPath?: string;
                error?: string;
              };
              if (!res.ok || !payload.link) {
                throw new Error(payload.error || labels.errorGeneric);
              }
              onLinkChanged({ link: payload.link, urlPath: payload.urlPath });
            })
          }
          className="h-10 rounded-full border border-black/10 text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-45"
        >
          <RefreshCw className="w-3.5 h-3.5" /> {busy ? labels.busy : labels.rotate}
        </button>
      </div>

      {showExpiry ? (
        <div className="rounded-xl border border-black/5 bg-[#FAF7F3] p-3 space-y-2">
          <input
            type="datetime-local"
            value={expiresLocal}
            onChange={(event) => setExpiresLocal(event.target.value)}
            className="w-full h-10 rounded-full border border-black/10 px-3 text-[12px]"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const current = await ensureLink();
                const expiresAt = expiresLocal
                  ? new Date(expiresLocal).toISOString()
                  : null;
                const res = await fetch(`/api/share/links/${current.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ expiresAt }),
                });
                const payload = (await res.json()) as {
                  link?: ShareLinkRecord;
                  error?: string;
                };
                if (!res.ok || !payload.link) {
                  throw new Error(payload.error || labels.errorGeneric);
                }
                onLinkChanged({ link: payload.link });
                setShowExpiry(false);
              })
            }
            className="w-full h-10 rounded-full bg-black text-white text-[12px] font-bold disabled:opacity-50"
          >
            {labels.expirySave}
          </button>
        </div>
      ) : null}

      {showPassword ? (
        <div className="rounded-xl border border-black/5 bg-[#FAF7F3] p-3 space-y-2">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={labels.passwordPlaceholder}
            className="w-full h-10 rounded-full border border-black/10 px-3 text-[12px]"
            autoComplete="new-password"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || password.length < 4}
              onClick={() =>
                void run(async () => {
                  const current = await ensureLink();
                  const res = await fetch(`/api/share/links/${current.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password }),
                  });
                  const payload = (await res.json()) as {
                    link?: ShareLinkRecord;
                    error?: string;
                  };
                  if (!res.ok || !payload.link) {
                    throw new Error(payload.error || labels.errorGeneric);
                  }
                  setPassword("");
                  onLinkChanged({ link: payload.link });
                  setShowPassword(false);
                })
              }
              className="flex-1 h-10 rounded-full bg-black text-white text-[12px] font-bold disabled:opacity-50"
            >
              {labels.passwordSave}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const current = await ensureLink();
                  const res = await fetch(`/api/share/links/${current.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password: null }),
                  });
                  const payload = (await res.json()) as {
                    link?: ShareLinkRecord;
                    error?: string;
                  };
                  if (!res.ok || !payload.link) {
                    throw new Error(payload.error || labels.errorGeneric);
                  }
                  onLinkChanged({ link: payload.link });
                  setShowPassword(false);
                })
              }
              className="flex-1 h-10 rounded-full border border-black/10 text-[12px] font-bold disabled:opacity-50"
            >
              {labels.passwordClear}
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        disabled={busy || !viewingId || !link}
        onClick={() => {
          if (!window.confirm(labels.confirmRevoke)) return;
          void run(async () => {
            const current = await ensureLink();
            const res = await fetch(`/api/share/links/${current.id}/revoke`, {
              method: "POST",
            });
            const payload = (await res.json()) as {
              link?: ShareLinkRecord;
              error?: string;
            };
            if (!res.ok || !payload.link) {
              throw new Error(payload.error || labels.errorGeneric);
            }
            onLinkChanged({ link: payload.link, urlPath: "" });
          });
        }}
        className="w-full h-10 rounded-full border border-[#FECACA] text-[11px] font-bold text-[#991B1B] disabled:opacity-45"
      >
        {labels.revoke}
      </button>
    </section>
  );
}
