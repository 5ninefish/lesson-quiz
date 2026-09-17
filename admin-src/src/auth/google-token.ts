import { PROGRAM, READ_SCOPES, WRITE_SCOPE } from "../config";

export type TokenClient = {
  requestAccessToken: (opts?: { prompt?: string }) => void;
};

type GisOauth2 = {
  initTokenClient: (cfg: Record<string, unknown>) => TokenClient;
};

let memoryToken: string | null = null;
let readClient: TokenClient | null = null;
let tokenCb: ((token: string) => void) | null = null;
let errorCb: ((message: string) => void) | null = null;

export function getAccessToken(): string | null {
  return memoryToken;
}

export function setAccessToken(token: string | null): void {
  memoryToken = token;
}

export function clearAccessToken(): void {
  memoryToken = null;
}

export function oauthConfigured(): boolean {
  return Boolean(PROGRAM.googleClientId);
}

function gisOauth(): GisOauth2 | null {
  const gis = (window as unknown as { google?: { accounts?: { oauth2?: GisOauth2 } } }).google;
  return gis?.accounts?.oauth2 || null;
}

export function googleSignInReady(): boolean {
  return Boolean(gisOauth());
}

function explainGoogleError(err: { type?: string; error?: string; message?: string } | string): string {
  const raw = typeof err === "string" ? err : err.type || err.error || err.message || "";
  const v = String(raw).toLowerCase();
  if (v.includes("popup_closed") || v.includes("popup_closed_by_user")) {
    return "The Google window closed before sign-in finished. Click Sign in again and leave that window open until it completes.";
  }
  if (v.includes("popup_failed") || v.includes("popup_blocked")) {
    return "The browser blocked the Google sign-in window. Allow popups for this page, then click Sign in again.";
  }
  if (v.includes("origin") || v.includes("unauthorized_client") || v.includes("redirect_uri")) {
    return "Google rejected this page as a sign-in origin. In the UH OAuth client, the authorized JavaScript origin must be exactly https://5ninefish.github.io (no extra path).";
  }
  if (v.includes("access_denied")) {
    return "Access was denied in the Google window. Click Sign in again and allow Sheets/Drive when asked.";
  }
  if (raw) return `Google sign-in did not finish (${raw}).`;
  return "Google sign-in did not finish. Click Sign in again.";
}

export function initTokenClient(
  onToken: (token: string) => void,
  onError?: (message: string) => void,
): TokenClient | null {
  tokenCb = onToken;
  errorCb = onError || null;
  if (!PROGRAM.googleClientId) return null;
  const oauth = gisOauth();
  if (!oauth) return null;
  if (readClient) return readClient;
  try {
    readClient = oauth.initTokenClient({
      client_id: PROGRAM.googleClientId,
      scope: READ_SCOPES,
      error_callback: (err: { type?: string }) => errorCb?.(explainGoogleError(err)),
      callback: (resp: { access_token?: string; error?: string; error_description?: string }) => {
        if (resp.access_token) {
          setAccessToken(resp.access_token);
          tokenCb?.(resp.access_token);
          return;
        }
        errorCb?.(explainGoogleError(resp.error_description || resp.error || "no_token"));
      },
    });
    return readClient;
  } catch (err) {
    onError?.(explainGoogleError(err instanceof Error ? err.message : "init_failed"));
    return null;
  }
}

export function requestWriteScope(onToken: (token: string) => void, onError?: (message: string) => void): boolean {
  if (!PROGRAM.googleClientId) return false;
  const oauth = gisOauth();
  if (!oauth) return false;
  try {
    const client = oauth.initTokenClient({
      client_id: PROGRAM.googleClientId,
      scope: `${READ_SCOPES} ${WRITE_SCOPE}`,
      error_callback: (err: { type?: string }) => onError?.(explainGoogleError(err)),
      callback: (resp: { access_token?: string; error?: string; error_description?: string }) => {
        if (resp.access_token) {
          setAccessToken(resp.access_token);
          onToken(resp.access_token);
          return;
        }
        onError?.(explainGoogleError(resp.error_description || resp.error || "no_token"));
      },
    });
    client.requestAccessToken({ prompt: "consent" });
    return true;
  } catch (err) {
    onError?.(explainGoogleError(err instanceof Error ? err.message : "init_failed"));
    return false;
  }
}

export function waitForGoogleSignIn(timeoutMs = 8000): Promise<boolean> {
  if (googleSignInReady()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (googleSignInReady()) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      window.setTimeout(tick, 150);
    };
    tick();
  });
}
