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

export type Viewing = {
  id: string;
  user_id?: string | null;
  property_id?: string | null;
  address: string;
  tags: string[];
  market: string | null;
  questions: ViewingQuestion[];
  photo_urls: string[];
  video_urls: string[];
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
};
