"use client";

import { LoadingState } from "@/components/ui/PageState";
import { useI18n } from "@/components/I18nProvider";

export default function Loading() {
  const { messages } = useI18n();
  return <LoadingState title={messages.status.loadingTitle} description={messages.status.loadingBody} />;
}
