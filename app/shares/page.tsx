import { Suspense } from "react";
import { SharesHub } from "@/components/shares/SharesHub";

export default function SharesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-[var(--color-canvas)]" aria-busy="true" />
      }
    >
      <SharesHub />
    </Suspense>
  );
}
