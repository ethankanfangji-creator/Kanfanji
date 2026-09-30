import { notFound } from "next/navigation";
import { HouseReadout } from "@/components/house/HouseReadout";
import { ListingAnalyze } from "@/components/house/ListingAnalyze";
import { TemplateWallet } from "@/components/house/TemplateWallet";
import { requireUser } from "@/lib/auth";
import type { CardTemplate } from "@/lib/viewing-card-templates";
import { MEDIA_BUCKET } from "@/lib/supabase";
import { MEDIA_SIGNED_TTL_SECONDS, absoluteStorageSignedUrl, assertOwnerMediaPath } from "@/lib/media-sign";
import { isBlankListing, parseListingExtract, type ListingExtract } from "@/lib/listing-fields";
import {
  cardScore,
  type CardPhoto,
  type ViewingCardState,
} from "@/lib/viewing-card-record";
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

async function savedCards(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  viewingId: string,
): Promise<ViewingCardState[]> {
  const { data, error } = await supabase
    .from("viewing_cards")
    .select("template_id, status, notes, photos")
    .eq("viewing_id", viewingId);
  if (error) throw new Error(error.message);

  const paths = (data ?? []).flatMap((row) =>
    Array.isArray(row.photos) ? row.photos.filter((item): item is string => typeof item === "string") : [],
  );
  const signed = new Map<string, string>();
  const safePaths = paths.filter((path) => {
    try {
      assertOwnerMediaPath(path, userId);
      return true;
    } catch {
      return false;
    }
  });
  if (safePaths.length > 0) {
    const admin = createAdminClient();
    const result = await admin.storage.from(MEDIA_BUCKET).createSignedUrls(safePaths, MEDIA_SIGNED_TTL_SECONDS);
    result.data?.forEach((row, index) => {
      const raw = row.signedUrl || ("signedURL" in row ? String(row.signedURL) : "");
      const url = absoluteStorageSignedUrl(raw);
      if (url) signed.set(safePaths[index], url);
    });
  }

  return (data ?? []).map((row) => {
    const photos: CardPhoto[] = (Array.isArray(row.photos) ? row.photos : [])
      .filter((item): item is string => typeof item === "string")
      .map((path) => ({ path, url: signed.get(path) ?? "" }))
      .filter((photo) => photo.url);
    return {
      templateId: row.template_id,
      status: cardScore(String(row.status)),
      notes: row.notes ?? "",
      photos,
    };
  });
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
  const records = await savedCards(supabase, user.id, viewing.id);

  return (
    <HouseReadout address={viewing.address}>
      <ListingAnalyze viewingId={viewing.id} initial={listing} />
      <TemplateWallet viewingId={viewing.id} templates={templates} records={records} />
    </HouseReadout>
  );
}
