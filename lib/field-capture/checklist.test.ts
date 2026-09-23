import { describe, expect, it } from "vitest";
import {
  createCustomChecklistItem,
  createPresetChecklist,
  ensureFieldChecklist,
  FIELD_CHECKLIST_IDS,
} from "./checklist";
import { isPhotoTagId, normalizePhotoTagId, PHOTO_TAG_IDS } from "./photo-tags";

const labels = Object.fromEntries(
  FIELD_CHECKLIST_IDS.map((id) => [id, id]),
) as Record<(typeof FIELD_CHECKLIST_IDS)[number], string>;

describe("photo tags", () => {
  it("includes required room tags", () => {
    expect(PHOTO_TAG_IDS).toEqual(
      expect.arrayContaining([
        "living",
        "kitchen",
        "master_bedroom",
        "bathroom",
        "electrical_panel",
        "window",
        "balcony",
        "parking",
        "common_area",
        "exterior",
        "other",
      ]),
    );
  });

  it("normalizes unknown tags to other", () => {
    expect(isPhotoTagId("living")).toBe(true);
    expect(normalizePhotoTagId("nope")).toBe("other");
  });
});

describe("field checklist", () => {
  it("seeds presets when empty", () => {
    const items = ensureFieldChecklist([], labels);
    expect(items).toHaveLength(FIELD_CHECKLIST_IDS.length);
    expect(items.every((i) => !i.custom && !i.checked)).toBe(true);
  });

  it("keeps existing checklist", () => {
    const custom = [createCustomChecklistItem("自訂項目", 99)];
    expect(ensureFieldChecklist(custom, labels)).toBe(custom);
  });

  it("createPresetChecklist uses labels in default field order", () => {
    const items = createPresetChecklist({ ...labels, light_air: "採光與通風" });
    expect(items[0]?.key).toBe("light_air");
    expect(items[0]?.text).toBe("採光與通風");
    expect(items.map((item) => item.key)).toEqual([...FIELD_CHECKLIST_IDS]);
  });
});
