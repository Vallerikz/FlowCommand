import { API_URL, TOKEN_KEY, USER_KEY } from "./config";

export class ApiError extends Error {
  status: number;
  /** true when the request never reached the backend at all */
  offline: boolean;

  constructor(message: string, status: number, offline = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.offline = offline;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

/** Fired when the backend rejects the stored token, so the app can return to login. */
export const SESSION_EXPIRED_EVENT = "vims:session-expired";

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

/** Turn any backend error payload into a single readable sentence. */
function readableError(payload: unknown, status: number): string {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    for (const key of ["message", "detail", "error", "reason"]) {
      const v = p[key];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (Array.isArray(v) && v.length) {
        const first = v[0] as Record<string, unknown>;
        if (first && typeof first["msg"] === "string") return first["msg"] as string;
      }
    }
  }
  if (status === 401) return "Your credentials were not accepted.";
  if (status === 403) return "You are not authorised to do this.";
  if (status === 404) return "That record was not found.";
  if (status >= 500) return "The server ran into a problem handling this request.";
  return `Request failed (status ${status}).`;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** send even without a stored token */
  auth?: boolean;
  signal?: AbortSignal;
};

export async function apiRequest<T = unknown>(
  path: string,
  { method = "GET", body, auth = true, signal }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (auth && token) headers["Authorization"] = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: payload ?? null,
      ...(signal ? { signal } : {}),
    });

  } catch {
    throw new ApiError(
      `Cannot reach the VIMS server at ${API_URL}.`,
      0,
      true,
    );
  }

  const text = await response.text();
  let parsed: unknown = text;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep raw text */
    }
  }

  if (!response.ok) {
    if (response.status === 401) clearSession();
    throw new ApiError(readableError(parsed, response.status), response.status);
  }

  return parsed as T;
}
