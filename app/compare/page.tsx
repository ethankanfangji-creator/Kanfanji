/**
 * `/compare?ids=a,b,c` — local chat threads only.
 *
 * Ownership: threads are not stored on the server, so this route does not
 * (and must not) fetch them from an API. See ChatComparePage.
 */
import { Suspense } from "react";
import { ChatComparePage } from "@/components/comparison/ChatComparePage";

export default function CompareQueryPage() {
  return (
    <Suspense fallback={null}>
      <ChatComparePage />
    </Suspense>
  );
}
