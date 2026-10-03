import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ViewingSessionApp } from "@/components/viewing-session/ViewingSessionApp";
import { getViewingRole } from "@/lib/collaboration/server";
import { createClient } from "@/utils/supabase/server";

export default async function ViewingChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/viewings/${id}`)}`);
  }
  const role = await getViewingRole(id, user.id);
  if (!role) notFound();

  return (
    <Suspense fallback={null}>
      <ViewingSessionApp viewingId={id} />
    </Suspense>
  );
}
