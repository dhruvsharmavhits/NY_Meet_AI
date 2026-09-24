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
  const adminToken = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;
  if (adminToken) {
    config.headers["X-Admin-Token"] = adminToken;
  }
  return config;
});

// admin_token is only valid for as long as the backend process has been running
// (it's an in-memory session store, not a DB-backed one) — a backend restart
// silently invalidates every admin's token. Without this, a stale token just
// gets sent forever and every /admin/* call 403s indefinitely with no feedback.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      typeof window !== "undefined" &&
      error.response?.status === 403 &&
      typeof error.config?.url === "string" &&
      error.config.url.includes("/admin")
    ) {
      localStorage.removeItem("admin_token");
      if (!window.location.pathname.startsWith("/meeting/") && window.location.pathname !== "/admin/login") {
        window.location.href = "/admin/login";
      }
    }
    return Promise.reject(error);
  }
);

export interface User {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export type RecordingStatus = "none" | "recording" | "stopped" | "failed";

export interface Meeting {
  id: string;
  room_code: string;
  title: string;
  host_id: string;
  status: "scheduled" | "active" | "ended";
  recording_status: RecordingStatus;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  chime_meeting?: Record<string, unknown> | null;
  chime_attendee?: Record<string, unknown> | null;
  requires_passcode?: boolean;
  passcode?: string | null;
}

export interface UserSettings {
  caption_language: string;
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

export async function updateMeetingTitle(roomCode: string, title: string): Promise<Meeting> {
  const { data } = await api.patch<Meeting>(`/meetings/${roomCode}`, { title });
  return data;
}

export async function joinMeeting(roomCode: string, passcode?: string, accessToken?: string): Promise<Meeting> {
  const { data } = await api.post<Meeting>(`/meetings/${roomCode}/join`, {
    ...(passcode ? { passcode } : {}),
    ...(accessToken ? { access_token: accessToken } : {}),
  });
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

export async function listRecordings(roomCode: string): Promise<string[]> {
  const { data } = await api.get<string[]>(`/meetings/${roomCode}/recordings`);
  return data;
}

export async function downloadRecording(roomCode: string, filename: string): Promise<void> {
  const { data } = await api.get<{ url: string }>(`/meetings/${roomCode}/recordings/${filename}`);
  window.open(data.url, "_blank");
}

export async function startRecording(roomCode: string): Promise<{ status: RecordingStatus }> {
  const { data } = await api.post<{ status: RecordingStatus }>(`/meetings/${roomCode}/recording/start`);
  return data;
}

export async function stopRecording(roomCode: string): Promise<{ status: RecordingStatus }> {
  const { data } = await api.post<{ status: RecordingStatus }>(`/meetings/${roomCode}/recording/stop`);
  return data;
}

export async function getRecordingStatus(roomCode: string): Promise<{ status: RecordingStatus }> {
  const { data } = await api.get<{ status: RecordingStatus }>(`/meetings/${roomCode}/recording-status`);
  return data;
}

export type ConsultationStatus = "waiting" | "active" | "completed";

export interface ConsultationSession {
  id: string;
  room_id: string;
  patient_link_id: string;
  patient_name: string;
  status: ConsultationStatus;
  queue_position: number | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface PatientLink {
  id: string;
  room_id: string;
  code: string;
  label: string | null;
  created_at: string;
}

export interface PatientLinkWithSession {
  link: PatientLink;
  session: ConsultationSession | null;
}

export interface JoinPatientLinkResult {
  session: ConsultationSession;
  room_code: string | null;
  access_token: string | null;
  chime_meeting?: Record<string, unknown> | null;
  chime_attendee?: Record<string, unknown> | null;
}

export interface MeetingAccessInfo {
  is_doctor_room: boolean;
  is_host: boolean;
  requires_passcode: boolean;
}

export async function getMeetingAccessInfo(roomCode: string): Promise<MeetingAccessInfo> {
  const { data } = await api.get<MeetingAccessInfo>(`/meetings/${roomCode}/access-info`);
  return data;
}

export async function adminLogin(userId: string, password: string): Promise<string> {
  const { data } = await api.post<{ token: string }>("/admin/login", { user_id: userId, password });
  return data.token;
}

export async function createAdminAccount(masterPassword: string, userId: string, password: string): Promise<void> {
  await api.post("/admin/accounts", { master_password: masterPassword, user_id: userId, password });
}

export async function createDoctorRoom(title: string): Promise<Meeting> {
  const { data } = await api.post<Meeting>("/admin/rooms", { title });
  return data;
}

export async function listDoctorRooms(): Promise<Meeting[]> {
  const { data } = await api.get<Meeting[]>("/admin/rooms");
  return data;
}

export async function fetchRoomPasscode(roomCode: string): Promise<Meeting> {
  const { data } = await api.get<Meeting>(`/admin/rooms/${roomCode}/passcode`);
  return data;
}

export async function createPatientLink(roomCode: string, label: string): Promise<PatientLink> {
  const { data } = await api.post<PatientLink>(`/admin/rooms/${roomCode}/patient-links`, { label });
  return data;
}

export async function listPatientLinks(roomCode: string): Promise<PatientLinkWithSession[]> {
  const { data } = await api.get<PatientLinkWithSession[]>(`/admin/rooms/${roomCode}/patient-links`);
  return data;
}

export async function getQueue(roomCode: string): Promise<ConsultationSession[]> {
  const { data } = await api.get<ConsultationSession[]>(`/admin/rooms/${roomCode}/queue`);
  return data;
}

export async function admitSession(sessionId: string): Promise<ConsultationSession> {
  const { data } = await api.post<ConsultationSession>(`/admin/sessions/${sessionId}/admit`);
  return data;
}

export async function completeSession(sessionId: string): Promise<ConsultationSession> {
  const { data } = await api.post<ConsultationSession>(`/admin/sessions/${sessionId}/complete`);
  return data;
}

export async function fetchSessionTranscript(sessionId: string): Promise<TranscriptEntry[]> {
  const { data } = await api.get<TranscriptEntry[]>(`/admin/sessions/${sessionId}/transcript`);
  return data;
}

export async function listSessionRecordings(sessionId: string): Promise<string[]> {
  const { data } = await api.get<string[]>(`/admin/sessions/${sessionId}/recordings`);
  return data;
}

export async function downloadSessionRecording(sessionId: string, filename: string): Promise<void> {
  const { data } = await api.get<{ url: string }>(`/admin/sessions/${sessionId}/recordings/${filename}`);
  window.open(data.url, "_blank");
}

export interface PatientLinkInfo {
  room_code: string | null;
  title: string | null;
  patient_name: string;
  expired: boolean;
  room_assigned: boolean;
}

export async function getPatientLinkInfo(code: string): Promise<PatientLinkInfo> {
  const { data } = await api.get<PatientLinkInfo>(`/patient-links/${code}`);
  return data;
}

export async function joinPatientLink(code: string): Promise<JoinPatientLinkResult> {
  const { data } = await api.post<JoinPatientLinkResult>(`/patient-links/${code}/join`);
  return data;
}

export async function getPatientSession(sessionId: string): Promise<JoinPatientLinkResult> {
  const { data } = await api.get<JoinPatientLinkResult>(`/patient-links/sessions/${sessionId}`, {
    params: { _: Date.now() },
  });
  return data;
}

export interface ThirdPartyApp {
  id: string;
  app_name: string;
  company_name: string;
  api_key: string | null;
  api_key_prefix: string;
  status: string;
  created_at: string;
}

export async function listThirdPartyApps(): Promise<ThirdPartyApp[]> {
  const { data } = await api.get<ThirdPartyApp[]>("/admin/third-party-apps");
  return data;
}

export async function createThirdPartyApp(appName: string, companyName: string): Promise<ThirdPartyApp> {
  const { data } = await api.post<ThirdPartyApp>("/admin/third-party-apps", {
    app_name: appName,
    company_name: companyName,
  });
  return data;
}

