const ADMIN_TOKEN_KEY = 'adminAccessToken';

export function getAdminAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminAccessToken(v: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ADMIN_TOKEN_KEY, v);
}

