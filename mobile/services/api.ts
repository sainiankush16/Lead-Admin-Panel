import { API_CONFIG } from "@/lib/config";
import type {
  GlobalSearchResponse,
  GoogleConnectionStatus,
  ManagedUser,
  Project,
  ProjectLeadsResponse,
  Remark,
  SheetTabListItem,
  SpreadsheetListItem,
  TimelineEvent,
  User,
  UsersListResponse
} from "@/types";

export class ApiClientError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  auth?: boolean;
}

export interface MobileLoginResponse {
  user: User;
  sessionToken: string;
  expiresAt: string;
}

export interface MobileMeResponse {
  authenticated: boolean;
  user?: User | null;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const base = API_CONFIG.baseUrl;
  const url = new URL(path.startsWith("http") ? path : `${base}${path}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

/**
 * Typed API client for the existing Website CRM backend.
 * Mobile auth uses Authorization: Bearer (opaque token from SecureStore).
 * Web cookie/CSRF auth is unchanged on the server.
 */
class ApiClient {
  private sessionToken: string | null = null;
  private onUnauthorized: (() => void | Promise<void>) | null = null;
  private handlingUnauthorized = false;

  setSessionToken(token: string | null) {
    this.sessionToken = token;
  }

  getSessionToken() {
    return this.sessionToken;
  }

  setUnauthorizedHandler(handler: (() => void | Promise<void>) | null) {
    this.onUnauthorized = handler;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = {
      Accept: "application/json"
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const useAuth = options.auth !== false;
    if (useAuth && this.sessionToken) {
      headers.Authorization = `Bearer ${this.sessionToken}`;
    }

    let response: Response;
    try {
      response = await fetch(buildUrl(path, options.query), {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
    } catch (err) {
      throw err instanceof TypeError ? err : new TypeError("Network error.");
    }

    const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
    if (!response.ok) {
      if (response.status === 401 && useAuth && this.sessionToken && !this.handlingUnauthorized) {
        this.handlingUnauthorized = true;
        try {
          await this.onUnauthorized?.();
        } finally {
          this.handlingUnauthorized = false;
        }
      }
      throw new ApiClientError(data.error || "Request failed.", response.status);
    }
    return data;
  }

  login(loginId: string, password: string) {
    return this.request<MobileLoginResponse>("/api/mobile/auth/login", {
      method: "POST",
      body: { loginId, password },
      auth: false
    });
  }

  getMe() {
    return this.request<MobileMeResponse>("/api/mobile/auth/me");
  }

  logout() {
    return this.request<{ ok: boolean }>("/api/mobile/auth/logout", { method: "POST" });
  }

  deleteAccount() {
    return this.request<{ ok: boolean; deleted: boolean; message?: string }>("/api/account", {
      method: "DELETE",
      body: { confirm: "DELETE" }
    });
  }

  getProjects() {
    return this.request<{ projects: Project[] }>("/api/projects");
  }

  getProjectLeads(projectId: number) {
    return this.request<ProjectLeadsResponse>(`/api/projects/${projectId}/leads`);
  }

  updateLeadStatus(projectId: number, rowNumber: number, status: string) {
    return this.request<{
      ok?: boolean;
      success?: boolean;
      unchanged?: boolean;
      rowNumber?: number;
      status?: string;
      project?: ProjectLeadsResponse;
    }>(`/api/projects/${projectId}/leads/${rowNumber}/status`, {
      method: "PATCH",
      body: { status }
    });
  }

  getRemarks(projectId: number, leadId: string) {
    return this.request<{ remarks: Remark[] }>(
      `/api/projects/${projectId}/leads/${encodeURIComponent(leadId)}/remarks`
    );
  }

  addRemark(projectId: number, leadId: string, body: string) {
    return this.request<{ remark: Remark; remarks?: Remark[]; events?: TimelineEvent[] }>(
      `/api/projects/${projectId}/leads/${encodeURIComponent(leadId)}/remarks`,
      {
        method: "POST",
        body: { body }
      }
    );
  }

  updateRemark(projectId: number, remarkId: number, body: string) {
    return this.request<{ remark: Remark; remarks?: Remark[]; events?: TimelineEvent[] }>(
      `/api/projects/${projectId}/remarks/${remarkId}`,
      {
        method: "PATCH",
        body: { body }
      }
    );
  }

  deleteRemark(projectId: number, remarkId: number) {
    return this.request<{ ok: boolean; remarks?: Remark[]; events?: TimelineEvent[] }>(
      `/api/projects/${projectId}/remarks/${remarkId}`,
      {
        method: "DELETE"
      }
    );
  }

  getTimeline(projectId: number, leadId: string) {
    return this.getLeadTimeline(projectId, leadId);
  }

  getLeadTimeline(projectId: number, leadId: string) {
    return this.request<{ events: TimelineEvent[] }>(
      `/api/projects/${projectId}/leads/${encodeURIComponent(leadId)}/timeline`
    );
  }

  globalLeadSearch(query: string) {
    return this.searchLeads(query);
  }

  searchLeads(query: string) {
    return this.request<GlobalSearchResponse>("/api/leads/search", {
      query: { q: query }
    });
  }

  getUsers() {
    return this.request<UsersListResponse>("/api/users");
  }

  createUser(input: {
    name: string;
    loginId: string;
    password: string;
    projectIds?: number[];
  }) {
    return this.request<{ user: ManagedUser }>("/api/users", {
      method: "POST",
      body: {
        name: input.name,
        loginId: input.loginId,
        password: input.password,
        projectIds: input.projectIds || []
      }
    });
  }

  setUserActive(userId: number, isActive: boolean) {
    return this.request<{ ok: boolean; users?: ManagedUser[] }>(`/api/users/${userId}/status`, {
      method: "PATCH",
      body: { isActive }
    });
  }

  resetUserPassword(userId: number, password: string) {
    return this.request<{ ok: boolean }>(`/api/users/${userId}/reset-password`, {
      method: "POST",
      body: { password }
    });
  }

  replaceUserProjects(userId: number, projectIds: number[]) {
    return this.request<{ ok: boolean; users?: ManagedUser[] }>(`/api/users/${userId}/projects`, {
      method: "PUT",
      body: { projectIds }
    });
  }

  getGoogleStatus() {
    return this.request<GoogleConnectionStatus>("/api/google/status");
  }

  listSpreadsheets() {
    return this.request<{ spreadsheets: SpreadsheetListItem[] }>("/api/sheets");
  }

  listSheetTabs(spreadsheetId: string) {
    return this.request<{ tabs: SheetTabListItem[] }>(
      `/api/sheets/${encodeURIComponent(spreadsheetId)}/tabs`
    );
  }

  createProject(input: {
    name: string;
    spreadsheetId: string;
    sheetId: number;
    sheetTitle: string;
  }) {
    return this.request<{ project: Project }>("/api/projects", {
      method: "POST",
      body: {
        name: input.name,
        spreadsheetId: input.spreadsheetId,
        sheetId: input.sheetId,
        sheetTitle: input.sheetTitle
      }
    });
  }
}

export const api = new ApiClient();
