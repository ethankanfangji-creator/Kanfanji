/**
 * Canonical domain types for the Viewing Journey.
 * Prefer importing from here in new UI/services; existing modules remain source of truth.
 */

export type { Viewing, ViewingQuestion, ViewingAudioNote } from "@/lib/types";
export type {
  ViewingDraftRecord as LocalViewingDraft,
  DraftQuestion,
  DraftAudioNote,
} from "@/lib/idb/types";
export type { ViewingSession } from "@/lib/draft-db/types";

export type {
  AddressSuggestion,
} from "@/lib/address-suggest";
export type { AddressLookupResult } from "@/lib/address-lookup";

/** Confirmed on-device address context for a viewing. */
export type Address = {
  label: string;
  identified: boolean;
  lat?: number | null;
  lng?: number | null;
  city?: string | null;
  neighborhood?: string | null;
  province?: string | null;
  country?: string | null;
  postalCode?: string | null;
  source?: string | null;
};

export type {
  PropertyBasicsSnapshot as PropertyBasics,
  PropertyBasicsField,
  PropertyBasicsConfidence,
} from "@/lib/property-basics/types";

export type {
  ViewingReportTicketItem as ViewingTicket,
  ViewingReportCategory,
} from "@/lib/viewing-report/types";

export type {
  ViewingReportObservation as UserObservation,
  ViewingReport as AIReport,
} from "@/lib/viewing-report/types";

export type { ViewingInputEntry } from "@/lib/viewing-wizard/input-integration";

export type { ShareLinkRecord as ShareLink } from "@/lib/share-access/types";
export type { PublicSharePayload, PublicShareResult } from "@/lib/share-access/types";
