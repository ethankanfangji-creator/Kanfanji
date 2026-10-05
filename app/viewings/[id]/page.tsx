import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ViewingSessionApp } from "@/components/viewing-session/ViewingSessionApp";

/**
 * Notes session for guests (IndexedDB) and signed-in users (local + cloud hydrate).
 * Auth is not required at the page boundary so guests can finish one local viewing.
 */
export default async function ViewingChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!id?.trim()) notFound();

  return (
    <Suspense fallback={null}>
      <ViewingSessionApp viewingId={id} />
    </Suspense>
  );
}
