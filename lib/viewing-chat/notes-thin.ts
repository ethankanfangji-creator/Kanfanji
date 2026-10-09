import { userNotesOnly } from "@/lib/viewing-chat/briefing";
import type { ChatMessage } from "@/lib/viewing-chat/types";

const MIN_NOTE_COUNT = 2;
const MIN_NOTE_CHARS = 40;

/** Substantial on-site text across user notes (captions / transcripts / typed). */
export function notesSubstantialCharCount(messages: ChatMessage[]): number {
  return userNotesOnly(messages).reduce((sum, message) => {
    const body = [message.transcript, message.text, message.analysis]
      .map((part) => part?.trim() || "")
      .join("");
    return sum + body.length;
  }, 0);
}

/**
 * Soft UX: notes exist but are thin — report will lean on public briefing/facts.
 * Empty notes are handled by a separate hard gate, so this returns false then.
 */
export function notesAreThinForReport(messages: ChatMessage[]): boolean {
  const notes = userNotesOnly(messages);
  if (notes.length === 0) return false;
  if (notes.length < MIN_NOTE_COUNT) return true;
  return notesSubstantialCharCount(notes) < MIN_NOTE_CHARS;
}
