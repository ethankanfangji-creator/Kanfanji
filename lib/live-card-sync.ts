import type { LiveCard } from "@/components/house/LiveCards";

export type ViewingCardChange = {
  template_id?: string;
  status?: string | null;
  notes?: string | null;
  voice_transcript?: string | null;
  photos?: string[] | null;
};

export function applyViewingCardChange(cards: LiveCard[], change: ViewingCardChange): LiveCard[] {
  const templateId = change.template_id;
  if (!templateId) return cards;
  return cards.map((card) => {
    if (card.templateId !== templateId) return card;
    return {
      ...card,
      status: change.status === undefined ? card.status : change.status,
      notes: change.notes === undefined ? card.notes : change.notes,
      voiceTranscript:
        change.voice_transcript === undefined ? card.voiceTranscript : change.voice_transcript,
      photoCount: Array.isArray(change.photos) ? change.photos.length : card.photoCount,
    };
  });
}
