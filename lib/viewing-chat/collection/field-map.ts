/**
 * Map progressive collection field ids ↔ legacy agenda / question-bank ids.
 */

import type { PropertyFieldId } from "./types";

const FIELD_TO_AGENDA: Record<string, string> = {
  layout: "q_layout",
  noise: "q_noise",
  odor: "q_odor",
  light: "q_light",
  water_damage: "q_water_damage",
  electrical: "q_electrical",
  plumbing: "q_plumbing",
  hvac: "q_hvac",
  parking: "q_storage_parking",
  transit: "q_transit",
  amenities: "q_amenities",
  price: "q_price",
  area: "q_area",
  pros: "q_pros",
  cons: "q_cons",
};

const AGENDA_TO_FIELD: Record<string, PropertyFieldId> = {
  q_layout: "layout",
  q_noise: "noise",
  q_odor: "odor",
  q_light: "light",
  q_water_damage: "water_damage",
  q_electrical: "electrical",
  q_plumbing: "plumbing",
  q_hvac: "hvac",
  q_storage_parking: "parking",
  q_exterior: "amenities",
  q_amenities: "amenities",
  q_transit: "transit",
  q_price: "price",
  q_area: "area",
  q_pros: "pros",
  q_cons: "cons",
  q_ask: "cons",
};

export function fieldIdToMatchedId(fieldId: PropertyFieldId): string {
  return FIELD_TO_AGENDA[fieldId] ?? String(fieldId);
}

export function agendaIdToFieldId(agendaId: string): PropertyFieldId {
  return AGENDA_TO_FIELD[agendaId] ?? (agendaId as PropertyFieldId);
}
