/**
 * Contextual (C) — address intel → inferred collection fields.
 * Never mark as confirmed; user must verify on site.
 */

import type { PropertyIntel } from "@/lib/property-intel/types";
import type { ExtractedPropertyFact, PropertyFieldId } from "./types";

function inferred(
  fieldId: PropertyFieldId,
  value: string | number,
  rawText: string,
  confidence: number,
): ExtractedPropertyFact {
  return {
    fieldId,
    value,
    status: "inferred",
    confidence,
    sourceMessageId: null,
    rawText,
  };
}

/** Map property-intel snapshot into inferred facts for merge. */
export function applyPropertyIntelInferences(
  intel: PropertyIntel | null | undefined,
): ExtractedPropertyFact[] {
  if (!intel) return [];
  const facts: ExtractedPropertyFact[] = [];

  if (intel.basic.year != null) {
    facts.push(
      inferred(
        "year_built",
        intel.basic.year,
        `地址情報：屋齡／建年約 ${intel.basic.year}`,
        0.55,
      ),
    );
  }

  if (intel.basic.beds != null || intel.basic.baths != null) {
    const beds = intel.basic.beds != null ? `${intel.basic.beds}房` : "";
    const baths = intel.basic.baths != null ? `${intel.basic.baths}衛` : "";
    const layout = `${beds}${baths}`.trim();
    if (layout) {
      facts.push(
        inferred("layout", layout, `地址情報：格局 ${layout}`, 0.5),
      );
    }
  }

  if (intel.basic.area != null) {
    facts.push(
      inferred(
        "area",
        intel.basic.area,
        `地址情報：面積約 ${intel.basic.area}`,
        0.5,
      ),
    );
  }

  if (intel.basic.type) {
    facts.push(
      inferred(
        "amenities",
        intel.basic.type,
        `地址情報：類型 ${intel.basic.type}`,
        0.45,
      ),
    );
  }

  const transit =
    intel.location.skytrain ||
    intel.location.bus ||
    intel.location.amenities.find((a) => /transit|mrt|skytrain|捷運/i.test(a.kind))
      ?.name;
  if (transit) {
    facts.push(
      inferred("transit", transit, `地址情報：交通 ${transit}`, 0.5),
    );
  }

  if (intel.location.noise) {
    facts.push(
      inferred(
        "noise",
        intel.location.noise,
        `地址情報：噪音相關 ${intel.location.noise}`,
        0.4,
      ),
    );
  }

  return facts;
}
