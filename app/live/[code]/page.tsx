import { notFound, redirect } from "next/navigation";
import { LiveCards, type LiveCard } from "@/components/house/LiveCards";
import { isLiveCode } from "@/lib/viewing-session-code";
import { createClient } from "@/utils/supabase/server";

export default async function LiveViewingPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!isLiveCode(code)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/live/${code}`)}`);

  const { data, error } = await supabase.rpc("read_live_viewing", { p_code: code });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") notFound();

  const payload = data as {
    address?: string;
    code?: string;
    cards?: LiveCard[];
  };
  if (!payload.code || !payload.address || !Array.isArray(payload.cards)) notFound();

  return <LiveCards address={payload.address} code={payload.code} cards={payload.cards} />;
}
