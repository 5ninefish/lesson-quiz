import "./style.css";
import { PROGRAM } from "./config";
import { clearAccessToken, initTokenClient, oauthConfigured } from "./auth/google-token";
import { loadRawWorkbook, loadWorkbookMeta } from "./google/sheets-client";
import { buildSnapshot } from "./workbook/snapshot";
import { instructorMessage, type ErrorCode } from "./errors";
import { renderShell, type Screen } from "./ui/shell";
import type { DashboardSnapshot } from "./types";

let screen: Screen = "overview";
let snap: DashboardSnapshot | null = null;
let bookName: string = PROGRAM.title;
let account = "";
let canEdit = false;
let query = "";
let banner: { kind: "ok" | "warn" | "err"; text: string } | null = {
  kind: "warn",
  text: "Read-only Phase 1. Demo uses synthetic rows. Live Google reads need a UH OAuth client ID.",
};

function paint(): void {
  renderShell({
    snap,
    screen,
    bookName,
    account,
    canEdit,
    banner,
    query,
    onNav: (s) => {
      screen = s;
      paint();
    },
    onSearch: (q) => {
      query = q;
    },
    onRefresh: () => {
      void refreshLive();
    },
    onDemo: () => {
      void loadDemo();
    },
    onSignIn: () => {
      const client = initTokenClient(() => {
        account = "UH Google";
        void refreshLive();
      });
      if (!client) {
        banner = {
          kind: "warn",
          text: oauthConfigured()
            ? "Google Identity script is not loaded yet."
            : "UH OAuth client ID is not configured yet. Use Load demo workbook.",
        };
        paint();
        return;
      }
      client.requestAccessToken();
    },
    onSignOut: () => {
      clearAccessToken();
      snap = null;
      account = "";
      canEdit = false;
      banner = { kind: "ok", text: "Signed out. Token was memory-only and is gone." };
      paint();
    },
  });
}

async function loadDemo(): Promise<void> {
  const { observedWorkbook } = await import("./fixtures/observed");
  snap = buildSnapshot(observedWorkbook());
  bookName = "Synthetic demo (not the live Hōkūlani book)";
  account = "demo";
  canEdit = false;
  banner = {
    kind: "ok",
    text: `Demo loaded. ${snap.students.length} students, ${snap.issues.length} health issues. Results mode: ${snap.resultsHeaderMode}.`,
  };
  paint();
}

async function refreshLive(): Promise<void> {
  try {
    const meta = await loadWorkbookMeta();
    bookName = meta.name;
    canEdit = meta.canEdit;
    const raw = await loadRawWorkbook();
    snap = buildSnapshot(raw);
    banner = { kind: "ok", text: "Workbook refreshed." };
  } catch (err) {
    const code = (err as { code?: ErrorCode }).code || "network";
    banner = { kind: "err", text: instructorMessage(code) };
  }
  paint();
}

paint();
