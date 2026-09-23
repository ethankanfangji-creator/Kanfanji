"use client";

import { useEffect } from "react";
import { PageState } from "@/components/ui/PageState";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageState
      role="alert"
      title="頁面暫時無法顯示"
      description="發生未預期的問題，請再試一次。"
      action={
        <button
          type="button"
          onClick={retry}
          className="h-11 rounded-full bg-black px-5 text-sm font-bold text-white"
        >
          再試一次
        </button>
      }
    />
  );
}
