import { PROGRAM } from "../config";

export type TokenClient = {
  requestAccessToken: () => void;
};

let memoryToken: string | null = null;

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

/** GIS token client. No-op until a UH Web client ID is configured. */
export function initTokenClient(onToken: (token: string) => void): TokenClient | null {
  if (!PROGRAM.googleClientId) return null;
  const gis = (window as unknown as { google?: { accounts?: { oauth2?: { initTokenClient: Function } } } }).google;
  if (!gis?.accounts?.oauth2) return null;
  return gis.accounts.oauth2.initTokenClient({
    client_id: PROGRAM.googleClientId,
    scope: "openid email profile https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/spreadsheets.readonly",
    callback: (resp: { access_token?: string }) => {
      if (resp.access_token) {
        setAccessToken(resp.access_token);
        onToken(resp.access_token);
      }
    },
  }) as TokenClient;
}
