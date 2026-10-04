"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ClientAuthBar } from "@/components/ClientAuthBar";
import { useI18n } from "@/components/I18nProvider";
import { PageContainer } from "@/components/ui/primitives";
import { ViewingsIndex } from "@/components/viewings/ViewingsIndex";
import type { ViewingListItem } from "@/lib/viewings/list-item";
import { createClient } from "@/utils/supabase/client";

export default function ViewingsPage() {
  const { messages } = useI18n();
  const router = useRouter();
  const [viewings, setViewings] = useState<ViewingListItem[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      setEmail(user.email ?? "");
      const response = await fetch("/api/viewings");
      const body = (await response.json()) as {
        viewings?: ViewingListItem[];
        error?: string;
      };
      if (!response.ok) setError(body.error || "讀取案件失敗");
      setViewings(Array.isArray(body.viewings) ? body.viewings : []);
      setLoading(false);
    })();
  }, [router]);

  return (
    <div className="flex min-h-screen w-full justify-center bg-[var(--color-canvas)] text-[var(--color-text)]">
      <PageContainer className="pb-28 pt-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/"
              className="mb-2 inline-flex min-h-[var(--touch-target)] items-center gap-1 text-[var(--font-size-xs)] font-medium text-[var(--color-text-muted)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {messages.viewings.back}
            </Link>
            <h1 className="text-[22px] font-[800] leading-[1.15] tracking-tight">
              {messages.viewings.title}
            </h1>
            {email ? (
              <p className="mt-1 truncate text-[11px] font-semibold tracking-wide text-[#9CA3AF]">
                {email}
              </p>
            ) : null}
          </div>
          <div className="mt-1.5 shrink-0">
            <ClientAuthBar />
          </div>
        </div>

        <ViewingsIndex viewings={viewings} loading={loading} error={error} />
      </PageContainer>
    </div>
  );
}
