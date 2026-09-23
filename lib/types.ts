export type ViewingQuestion = {
  id: number;
  text: string;
  checked: boolean;
  answer?: string;
  isFollowUp?: boolean;
  basedOn?: string;
  isDynamic?: boolean;
  source?: string;
};

export type ViewingAudioNote = {
  id: number;
  duration: number;
  transcript: string;
  matched: number[];
  mediaId?: string;
  kind?: "transcript" | "text";
  markers?: import("@/lib/audio-markers").AudioMarker[];
};

export type Viewing = {
  id: string;
  user_id?: string | null;
  property_id?: string | null;
  address: string;
  tags: string[];
  market: string | null;
  questions: ViewingQuestion[];
  notes?: ViewingAudioNote[];
  pros?: string[];
  risks?: string[];
  photo_urls: string[];
  video_urls: string[];
  audio_urls?: string[];
  share_token?: string | null;
  client_updated_at?: string | null;
  revision?: number;
  property?: Record<string, unknown> | null;
  is_pro?: boolean;
  created_at: string;
  updated_at: string;
};

export type Property = {
  id: string;
  normalized_address: string;
  lat: number | null;
  lng: number | null;
  year_built: number | null;
  zoning: string | null;
  view_count: number;
  country_code?: string | null;
  admin1?: string | null;
  city?: string | null;
  postal_code?: string | null;
};
