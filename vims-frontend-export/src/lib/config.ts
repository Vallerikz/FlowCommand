/**
 * Backend endpoints. Override with VITE_API_URL / VITE_WS_URL in .env.local.
 * The legacy REACT_APP_* names are also honoured for convenience.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const API_URL = (
  env["VITE_API_URL"] ??
  env["REACT_APP_API_URL"] ??
  "http://localhost:8000"
).replace(/\/$/, "");

export const WS_URL = (
  env["VITE_WS_URL"] ??
  env["REACT_APP_WS_URL"] ??

  API_URL.replace(/^http/, "ws")
).replace(/\/$/, "");

export const TOKEN_KEY = "vims_token";
export const USER_KEY = "vims_user";
