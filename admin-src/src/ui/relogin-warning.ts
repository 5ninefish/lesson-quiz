import { confirmDialog, infoDialog } from "./dialogs";

const STAY_SIGNED_IN = "hokulani-stay-signed-in";

let reloadGuard = false;
let listenersReady = false;

export function markStaySignedIn(): void {
  sessionStorage.setItem(STAY_SIGNED_IN, "1");
}

export function clearStaySignedIn(): void {
  sessionStorage.removeItem(STAY_SIGNED_IN);
}

function isBrowserRefreshKey(ev: KeyboardEvent): boolean {
  if (ev.key === "F5") return true;
  return (ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "r";
}

function warnBeforeBrowserRefresh(): void {
  confirmDialog({
    title: "You will have to log in again",
    body: "Refreshing the browser signs you out. You will have to log in again with UH Google.\n\nUse the Refresh button at the top of this page to reload the sheet and stay logged in.",
    confirmLabel: "Refresh anyway",
    cancelLabel: "Stay signed in",
    onConfirm: () => {
      reloadGuard = false;
      clearStaySignedIn();
      window.location.reload();
    },
  });
}

function installReloadGuard(): void {
  if (listenersReady || typeof window === "undefined") return;
  listenersReady = true;
  window.addEventListener("keydown", (ev) => {
    if (!reloadGuard || !isBrowserRefreshKey(ev)) return;
    ev.preventDefault();
    warnBeforeBrowserRefresh();
  });
  window.addEventListener("beforeunload", (ev) => {
    if (!reloadGuard) return;
    ev.preventDefault();
    ev.returnValue = "";
  });
}

/** Real Google sign-in only. Demo and signed-out states do not block a refresh. */
export function setReloadGuard(signedIn: boolean): void {
  installReloadGuard();
  reloadGuard = signedIn;
}

/**
 * Browser reload keeps sessionStorage and drops the memory-only Google token.
 * Show this once when that happens. Sign out clears the flag first, so it does not warn.
 */
export function warnIfBrowserRefreshSignedOut(account: string): void {
  const signedIn = Boolean(account) && account !== "demo";
  if (signedIn) {
    markStaySignedIn();
    setReloadGuard(true);
    return;
  }
  setReloadGuard(false);
  if (account === "demo") {
    clearStaySignedIn();
    return;
  }
  if (sessionStorage.getItem(STAY_SIGNED_IN) !== "1") return;
  clearStaySignedIn();
  infoDialog(
    "You will have to log in again",
    "Refreshing the browser signed you out. You will have to log in again with UH Google.\n\nNext time, use the Refresh button at the top of this page. That reloads the sheet and keeps you logged in.",
  );
}
