/**
 * Backend API client. Reads token from localStorage ('wf_token').
 */

// 기본값은 상대경로("") → 브라우저가 같은 출처(/api/*)로 호출하면 next.config 의 rewrites 가
// 백엔드로 프록시한다(HTTPS 프론트 ↔ HTTP 백엔드 mixed content 회피).
// NEXT_PUBLIC_API_URL 을 설정하면 그 주소로 직접 호출하지만, 운영에선 비워둔다.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

const TOKEN_KEY = "wf_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  if (typeof window !== "undefined") localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  if (typeof window !== "undefined") localStorage.removeItem(TOKEN_KEY);
}

type FetchInit = Omit<RequestInit, "body"> & { body?: unknown };

async function call<T = any>(path: string, init: FetchInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method || "GET",
    headers,
    body: init.body == null ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err: Error & { status?: number; data?: unknown } = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

// ─── Auth ───────────────────────────────────────────────────────────────────
export const auth = {
  signup: (body: { email: string; password: string; name: string; color?: string }) =>
    call<{ user: ApiUser; token: string }>("/api/auth/signup", { method: "POST", body }),
  login: (body: { email: string; password: string }) =>
    call<{ user: ApiUser; token: string }>("/api/auth/login", { method: "POST", body }),
  me: () => call<{ user: ApiUser }>("/api/auth/me"),
  updateMe: (body: { name?: string; color?: string; password?: string }) =>
    call<{ user: ApiUser }>("/api/auth/me", { method: "PATCH", body }),
};

// ─── Workspaces ─────────────────────────────────────────────────────────────
export const workspaces = {
  list: () => call<{ workspaces: ApiWorkspaceSummary[] }>("/api/workspaces"),
  create: (body: { name: string; description?: string; role?: ApiRole }) =>
    call<{ workspace: ApiWorkspaceSummary }>("/api/workspaces", { method: "POST", body }),
  get: (id: string) => call<{ workspace: ApiWorkspaceDetail }>(`/api/workspaces/${id}`),
  invite: (id: string, body: { email: string; name?: string; role: ApiRole; password?: string }) =>
    call<{ member: ApiMember; tmpPassword: string | null; isNewUser: boolean }>(`/api/workspaces/${id}/invite`, { method: "POST", body }),
  updateMemberRole: (id: string, userId: string, role: ApiRole) =>
    call<{ ok: true }>(`/api/workspaces/${id}/members/${userId}/role`, { method: "PATCH", body: { role } }),
  removeMember: (id: string, userId: string) =>
    call<{ ok: true }>(`/api/workspaces/${id}/members/${userId}`, { method: "DELETE" }),
  delete: (id: string) => call<{ ok: true }>(`/api/workspaces/${id}`, { method: "DELETE" }),
};

// ─── Reports ────────────────────────────────────────────────────────────────
export const reports = {
  list: (wsId: string) => call<{ reports: ApiReport[] }>(`/api/reports/workspace/${wsId}`),
  create: (wsId: string, body: { title: string; type?: string; content?: string; status?: string }) =>
    call<{ report: ApiReport }>(`/api/reports/workspace/${wsId}`, { method: "POST", body }),
  get: (id: string) => call<{ report: ApiReport }>(`/api/reports/${id}`),
  refresh: (id: string) => call<{ report: ApiReport }>(`/api/reports/${id}`),
  update: (id: string, body: Partial<{ title: string; content: string; status: string; type: string }>) =>
    call<{ report: ApiReport }>(`/api/reports/${id}`, { method: "PATCH", body }),
  distribute: (id: string) => call<{ report: ApiReport }>(`/api/reports/${id}/distribute`, { method: "POST" }),
  close: (id: string) => call<{ report: ApiReport }>(`/api/reports/${id}/close`, { method: "POST" }),
  delete: (id: string) => call<{ ok: true }>(`/api/reports/${id}`, { method: "DELETE" }),
  submit: (id: string, body: { content: string; stage: "member" | "mid" | "final" }) =>
    call<{ submission: ApiSubmission }>(`/api/reports/${id}/submissions`, { method: "POST", body }),
};

// ─── Migration ──────────────────────────────────────────────────────────────
export const migration = {
  push: (payload: unknown) => call<{ ok: true; imported: { users: number; workspaces: number; reports: number } }>(
    "/api/migrate",
    { method: "POST", body: payload },
  ),
};

// ─── Types ──────────────────────────────────────────────────────────────────
export type ApiRole = "admin" | "final_manager" | "mid_manager" | "member";

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  color: string;
}

export interface ApiWorkspaceSummary {
  id: string;
  name: string;
  description?: string | null;
  ownerId: string;
  myRole: ApiRole;
  memberCount: number;
  createdAt: string;
}

export interface ApiMember {
  id: string;
  email: string;
  name: string;
  color: string;
  role: ApiRole;
  joinedAt: string;
}

export interface ApiWorkspaceDetail {
  id: string;
  name: string;
  description?: string | null;
  ownerId: string;
  myRole: ApiRole;
  members: ApiMember[];
}

export interface ApiSubmission {
  userId?: string;
  content: string;
  stage: "member" | "mid" | "final";
  submittedAt: string;
}

export interface ApiReport {
  id: string;
  workspaceId: string;
  title: string;
  type: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  content: string;
  status: "template" | "distributed" | "closed";
  submissions: Record<string, ApiSubmission>;
}
