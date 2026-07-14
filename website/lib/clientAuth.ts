export const SESSION_TOKEN_KEY = "Wpay_session_token";

export function getStoredAuthToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(SESSION_TOKEN_KEY) || "";
}

export function storeAuthToken(token?: string) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    const cookie = `path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
    window.document.cookie = `token=${encodeURIComponent(token)}; ${cookie}`;
    window.document.cookie = `Wpay_token=${encodeURIComponent(token)}; ${cookie}`;
  }
}

export function clearStoredAuthToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_TOKEN_KEY);
  window.document.cookie = "token=; path=/; max-age=0; SameSite=Lax";
  window.document.cookie = "Wpay_token=; path=/; max-age=0; SameSite=Lax";
}

export function authHeaders(headers?: HeadersInit): HeadersInit {
  const token = getStoredAuthToken();
  const baseHeaders = {
    "ngrok-skip-browser-warning": "true",
    ...(headers || {}),
  };
  if (!token) return baseHeaders;

  return {
    ...baseHeaders,
    Authorization: `Bearer ${token}`,
  };
}
