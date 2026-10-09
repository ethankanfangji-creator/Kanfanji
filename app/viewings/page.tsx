"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ClientAuthBar } from "@/components/ClientAuthBar";
import { useI18n } from "@/components/I18nProvider";
import { BrowsePageHeader } from "@/components/ui/BrowsePageHeader";
import { PageContainer } from "@/components/ui/primitives";
import { ViewingsIndex } from "@/components/viewings/ViewingsIndex";
import type { ViewingListItem } from "@/lib/viewings/list-item";
import { createClient } from "@/utils/supabase/client";

export default function ViewingsPage() {
  const { messages } = useI18n();
  const router = useRouter();
  const [viewings, setViewings] = useState<ViewingListItem[]>([]);
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
        <BrowsePageHeader
          backLabel={messages.nav.back}
          title={messages.viewings.title}
          subtitle={messages.viewings.subtitle}
          actions={<ClientAuthBar />}
        />

        <ViewingsIndex viewings={viewings} loading={loading} error={error} />
      </PageContainer>
    </div>
  );
}
