/**
 * Evidence-id citation helpers — LLM / narrative conclusions must cite known ids.
 */

const EVIDENCE_ID_RE = /\[?(ev_[a-z0-9_]+)\]?|〔(ev_[a-z0-9_]+)〕/gi;

export function extractEvidenceIds(text: string): string[] {
  const ids = new Set<string>();
  const re = new RegExp(EVIDENCE_ID_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = m[1] || m[2];
    if (id) ids.add(id);
  }
  return [...ids];
}

export type CitationCheckResult = {
  ok: boolean;
  cited: string[];
  unknownIds: string[];
  /** Text with unknown [ev_…] markers removed */
  strippedText: string;
};

/**
 * Validate that every cited evidence id is in the allowed set.
 * Unknown markers are stripped from the returned text.
 */
export function assertCitations(
  text: string,
  allowedIds: Iterable<string>,
): CitationCheckResult {
  const allowed = new Set(allowedIds);
  const cited = extractEvidenceIds(text);
  const unknownIds = cited.filter((id) => !allowed.has(id));
  let strippedText = text;
  for (const id of unknownIds) {
    strippedText = strippedText
      .replaceAll(`[${id}]`, "")
      .replaceAll(`〔${id}〕`, "")
      .replaceAll(id, "");
  }
  strippedText = strippedText.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return {
    ok: unknownIds.length === 0,
    cited,
    unknownIds,
    strippedText,
  };
}

/**
 * Ensure narrative section evidence_ids ⊆ allowed; drop orphans.
 */
export function filterNarrativeEvidenceIds<
  T extends { evidence_ids: string[]; body: string },
>(sections: T[], allowedIds: Iterable<string>): T[] {
  const allowed = new Set(allowedIds);
  return sections.map((section) => {
    const evidence_ids = section.evidence_ids.filter((id) => allowed.has(id));
    const check = assertCitations(section.body, allowed);
    return {
      ...section,
      evidence_ids,
      body: check.strippedText || section.body,
    };
  });
}

/**
 * Strip unknown evidence markers from chat report string lists.
 */
export function sanitizeCitedStrings(
  values: string[],
  allowedIds: Iterable<string>,
): { values: string[]; unknownIds: string[] } {
  const unknown = new Set<string>();
  const next = values.map((v) => {
    const check = assertCitations(v, allowedIds);
    for (const id of check.unknownIds) unknown.add(id);
    return check.strippedText || v;
  });
  return { values: next, unknownIds: [...unknown] };
}
