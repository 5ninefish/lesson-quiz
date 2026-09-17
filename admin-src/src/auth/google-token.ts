import { PROGRAM, READ_SCOPES, WRITE_SCOPE } from "../config";

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
    scope: READ_SCOPES,
    callback: (resp: { access_token?: string }) => {
      if (resp.access_token) {
        setAccessToken(resp.access_token);
        onToken(resp.access_token);
      }
    },
  }) as TokenClient;
}

export function requestWriteScope(onToken: (token: string) => void): boolean {
  if (!PROGRAM.googleClientId) return false;
  const gis = (window as unknown as { google?: { accounts?: { oauth2?: { initTokenClient: Function } } } }).google;
  if (!gis?.accounts?.oauth2) return false;
  const client = gis.accounts.oauth2.initTokenClient({
    client_id: PROGRAM.googleClientId,
    scope: WRITE_SCOPE,
    callback: (resp: { access_token?: string }) => {
      if (resp.access_token) {
        setAccessToken(resp.access_token);
        onToken(resp.access_token);
      }
    },
  });
  client.requestAccessToken();
  return true;
}
