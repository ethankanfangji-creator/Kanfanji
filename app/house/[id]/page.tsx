import { notFound } from "next/navigation";
import { HouseReadout } from "@/components/house/HouseReadout";
import { ListingAnalyze } from "@/components/house/ListingAnalyze";
import { TemplateWallet } from "@/components/house/TemplateWallet";
import { requireUser } from "@/lib/auth";
import type { CardTemplate } from "@/lib/viewing-card-templates";
import { isBlankListing, parseListingExtract, type ListingExtract } from "@/lib/listing-fields";
import { createAdminClient } from "@/utils/supabase/admin";

const VIEWING_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function savedListing(viewingId: string, userId: string): Promise<ListingExtract | null> {
  const admin = createAdminClient();
  const { data: viewing, error } = await admin
    .from("viewings")
    .select("property_id, property")
    .eq("id", viewingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!viewing) return null;

  if (viewing.property_id) {
    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select("listing")
      .eq("id", viewing.property_id)
      .maybeSingle();
    if (propertyError) throw new Error(propertyError.message);
    const fromProperty = parseListingExtract(property?.listing);
    if (!isBlankListing(fromProperty)) return fromProperty;
  }

  const snapshot =
    viewing.property && typeof viewing.property === "object"
      ? (viewing.property as { listing?: unknown }).listing
      : null;
  const fromViewing = parseListingExtract(snapshot);
  return isBlankListing(fromViewing) ? null : fromViewing;
}

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

  const { data: templateRows, error: templateError } = await supabase
    .from("viewing_card_templates")
    .select("id, name, icon, sort_order, is_system")
    .order("sort_order", { ascending: true });
  if (templateError) throw new Error(templateError.message);

  const templates: CardTemplate[] = (templateRows ?? [])
    .map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      sortOrder: row.sort_order,
      isSystem: row.is_system,
    }))
    .sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.sortOrder - b.sortOrder);
  const listing = await savedListing(viewing.id, user.id);

  return (
    <HouseReadout address={viewing.address}>
      <ListingAnalyze viewingId={viewing.id} initial={listing} />
      <TemplateWallet viewingId={viewing.id} templates={templates} />
    </HouseReadout>
  );
}
