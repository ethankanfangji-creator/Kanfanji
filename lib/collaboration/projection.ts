import type { ViewingRole } from "./types";

type CommonViewingDto = {
  id?: unknown;
  address?: unknown;
  tags?: unknown;
  market?: unknown;
  questions?: unknown;
  pros?: unknown;
  risks?: unknown;
  photo_urls?: unknown;
  video_urls?: unknown;
  revision?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  property?: unknown;
};

export type RoleViewingDto =
  | (CommonViewingDto & { role: "viewer" })
  | (CommonViewingDto & {
      role: "commenter" | "editor";
      notes?: unknown;
      audio_urls?: unknown;
      property?: Record<string, unknown>;
    })
  | (CommonViewingDto & {
      role: "owner";
      notes?: unknown;
      audio_urls?: unknown;
      property?: unknown;
      user_id?: unknown;
      property_id?: unknown;
      share_token?: unknown;
      client_updated_at?: unknown;
      is_pro?: unknown;
    });

const COMMON_KEYS = [
  "id",
  "address",
  "tags",
  "market",
  "questions",
  "pros",
  "risks",
  "photo_urls",
  "video_urls",
  "revision",
  "created_at",
  "updated_at",
] as const;

const COLLABORATOR_KEYS = [
  ...COMMON_KEYS,
  "notes",
  "audio_urls",
  "property",
] as const;

const OWNER_KEYS = [
  ...COLLABORATOR_KEYS,
  "user_id",
  "property_id",
  "share_token",
  "client_updated_at",
  "is_pro",
] as const;

const NON_OWNER_PROPERTY_KEYS = [
  "source",
  "city",
  "neighborhood",
  "localityType",
  "province",
  "country",
  "postalCode",
  "score",
  "matchPrecision",
  "lat",
  "lng",
  "mlsNote",
  "openData",
] as const;

function pick(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    keys.filter((key) => Object.prototype.hasOwnProperty.call(source, key))
      .map((key) => [key, source[key]]),
  );
}

/**
 * The only viewing projection used at authenticated API/RSC boundaries.
 * Explicit key lists make newly-added database columns private by default.
 */
export function projectViewingForRole(
  row: Record<string, unknown>,
  role: ViewingRole,
): RoleViewingDto {
  if (role === "viewer") return { ...pick(row, COMMON_KEYS), role };
  if (role === "owner") return { ...pick(row, OWNER_KEYS), role };

  const projected = pick(row, COLLABORATOR_KEYS);
  if (projected.property && typeof projected.property === "object"
      && !Array.isArray(projected.property)) {
    projected.property = pick(
      projected.property as Record<string, unknown>,
      NON_OWNER_PROPERTY_KEYS,
    );
  }
  return { ...projected, role } as RoleViewingDto;
}

export const VIEWING_PROJECTION_SELECT = OWNER_KEYS.join(",");
