import { notFound } from "next/navigation";
import { HouseReadout, type HouseCard } from "@/components/house/HouseReadout";
import { requireUser } from "@/lib/auth";

const VIEWING_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function HousePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!VIEWING_ID.test(id)) notFound();

  const { data: viewing, error } = await supabase
    .from("viewings")
    .select("id, address")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!viewing) notFound();

  const { data: cards, error: cardsError } = await supabase
    .from("viewing_cards")
    .select("id, status, notes")
    .eq("viewing_id", viewing.id)
    .order("updated_at", { ascending: true });

  if (cardsError) throw new Error(cardsError.message);

  return (
    <HouseReadout
      address={viewing.address}
      cards={(cards ?? []) as HouseCard[]}
    />
  );
}
