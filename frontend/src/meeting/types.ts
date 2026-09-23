export interface Participant {
  sid: string;
  user_id: string;
  full_name: string;
  micOn?: boolean;
  cameraOn?: boolean;
  screenSharing?: boolean;
  tileId?: number | null;
  screenTileId?: number | null;
}

export interface ChatMessage {
  sid: string;
  full_name: string;
  text: string;
  ts: number;
}

export interface Caption {
  sid: string;
  full_name: string;
  text: string;
  lang: string;
  translations: Record<string, string>;
  ts: number;
}
