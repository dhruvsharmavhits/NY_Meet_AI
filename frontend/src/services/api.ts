import axios from "axios";

// Empty/unset NEXT_PUBLIC_API_URL means "same origin as the page" (undefined
// baseURL makes axios resolve requests relative to wherever the app is
// served from) — used when Next.js is proxying API calls to the backend
// itself (see next.config.js rewrites), e.g. behind a single ngrok tunnel.
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || undefined,
});

api.interceptors.request.use((config) => {
  const userId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;
  if (userId) {
    config.headers["X-User-Id"] = userId;
  }
  return config;
});

export interface User {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export interface Meeting {
  id: string;
  room_code: string;
  title: string;
  host_id: string;
  status: "scheduled" | "active" | "ended";
  is_recording: boolean;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface UserSettings {
  caption_language: string;
  spoken_language: string;  
  caption_position: "top" | "bottom";
  caption_font_size: number;
  dark_mode: boolean;
  camera_device_id: string | null;
  mic_device_id: string | null;
  speaker_device_id: string | null;
}

export async function createUser(fullName: string): Promise<User> {
  const { data } = await api.post<User>("/users", { full_name: fullName });
  return data;
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<User>("/users/me");
  return data;
}

export async function updateProfile(fullName: string): Promise<User> {
  const { data } = await api.patch<User>("/users/me", { full_name: fullName });
  return data;
}

export async function createMeeting(title: string, scheduledAt?: string): Promise<Meeting> {
  const { data } = await api.post<Meeting>("/meetings", { title, scheduled_at: scheduledAt ?? null });
  return data;
}

export async function listMeetings(): Promise<Meeting[]> {
  const { data } = await api.get<Meeting[]>("/meetings");
  return data;
}

export async function getMeeting(roomCode: string): Promise<Meeting> {
  const { data } = await api.get<Meeting>(`/meetings/${roomCode}`);
  return data;
}

export async function joinMeeting(roomCode: string): Promise<Meeting> {
  const { data } = await api.post<Meeting>(`/meetings/${roomCode}/join`);
  return data;
}

export async function leaveMeeting(roomCode: string): Promise<void> {
  await api.post(`/meetings/${roomCode}/leave`);
}

export async function fetchMySettings(): Promise<UserSettings> {
  const { data } = await api.get<UserSettings>("/users/me/settings");
  return data;
}

export async function updateMySettings(payload: Partial<UserSettings>): Promise<UserSettings> {
  const { data } = await api.put<UserSettings>("/users/me/settings", payload);
  return data;
}

export interface TranscriptEntry {
  speaker_name: string;
  text: string;
  lang: string;
  created_at: string;
}

export interface MeetingSummary {
  title: string;
  room_code: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  participant_names: string[];
  languages_spoken: string[];
  caption_count: number;
  highlights: string[];
}

export async function fetchTranscript(roomCode: string): Promise<TranscriptEntry[]> {
  const { data } = await api.get<TranscriptEntry[]>(`/meetings/${roomCode}/transcript`);
  return data;
}

export async function fetchSummary(roomCode: string): Promise<MeetingSummary> {
  const { data } = await api.get<MeetingSummary>(`/meetings/${roomCode}/summary`);
  return data;
}

export async function uploadRecording(roomCode: string, blob: Blob): Promise<{ filename: string }> {
  const formData = new FormData();
  formData.append("file", blob, "recording.webm");
  const { data } = await api.post<{ filename: string }>(`/meetings/${roomCode}/recordings`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function listRecordings(roomCode: string): Promise<string[]> {
  const { data } = await api.get<string[]>(`/meetings/${roomCode}/recordings`);
  return data;
}

export async function downloadRecording(roomCode: string, filename: string): Promise<void> {
  const { data } = await api.get(`/meetings/${roomCode}/recordings/${filename}`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
