export type LookupQuestion = {
  id: number;
  text: string;
  checked: boolean;
  answer?: string;
  isFollowUp?: boolean;
  isDynamic?: boolean;
};

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isSameProperty(input: {
  previousPropertyId?: string | null;
  nextPropertyId?: string | null;
  previousAddress: string;
  nextAddress: string;
}): boolean {
  const previousId = input.previousPropertyId?.trim() || "";
  const nextId = input.nextPropertyId?.trim() || "";
  if (previousId && nextId) return previousId === nextId;
  const previousAddress = normalizeAddress(input.previousAddress);
  const nextAddress = normalizeAddress(input.nextAddress);
  return Boolean(previousAddress) && previousAddress === nextAddress;
}

/**
 * Re-looking-up the same property must not wipe recorded Q&A.
 * A first lookup (nothing committed) still refreshes the bank.
 * `wasIdentified` may already be false: the address field is reopened by
 * clearing that flag before the user searches again.
 */
export function shouldPreserveLookupQuestions(input: {
  wasIdentified: boolean;
  previousPropertyId?: string | null;
  nextPropertyId?: string | null;
  previousAddress: string;
  nextAddress: string;
}): boolean {
  if (!isSameProperty(input)) return false;
  if (input.wasIdentified) return true;
  if (input.previousPropertyId?.trim()) return true;
  return normalizeAddress(input.previousAddress).length > 0;
}

function hasRecordedContent<T extends LookupQuestion>(question: T): boolean {
  return Boolean(question.isFollowUp || question.answer?.trim() || question.checked);
}

/**
 * Merge a freshly fetched question bank into the in-progress list.
 * Photo-generated questions (`isDynamic`) are always kept. Recorded answers,
 * checks, and follow-ups are kept only when `preserveRecorded` is true.
 */
export function mergeQuestionBankOnAddressLookup<T extends LookupQuestion>(
  current: T[],
  nextBank: T[],
  preserveRecorded: boolean,
): T[] {
  const keep = current.filter((question) => {
    if (question.isDynamic) return true;
    return preserveRecorded && hasRecordedContent(question);
  });

  const existingTexts = new Set(keep.map((question) => question.text.trim().toLowerCase()));
  const usedIds = new Set(keep.map((question) => question.id));
  let nextId = keep.reduce((max, question) => Math.max(max, question.id), 0) + 1;

  const extras: T[] = [];
  for (const question of nextBank) {
    const text = question.text.trim();
    if (!text || existingTexts.has(text.toLowerCase())) continue;
    existingTexts.add(text.toLowerCase());
    if (usedIds.has(question.id)) {
      extras.push({ ...question, id: nextId });
      usedIds.add(nextId);
      nextId += 1;
    } else {
      extras.push(question);
      usedIds.add(question.id);
      if (question.id >= nextId) nextId = question.id + 1;
    }
  }

  return [...keep, ...extras];
}
