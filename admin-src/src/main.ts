import "./style.css";
import { PROGRAM } from "./config";
import { clearAccessToken, initTokenClient, oauthConfigured } from "./auth/google-token";
import { loadRawWorkbook, loadWorkbookMeta } from "./google/sheets-client";
import { buildSnapshot } from "./workbook/snapshot";
import { instructorMessage, type ErrorCode } from "./errors";
import { renderShell, type Screen } from "./ui/shell";
import type { DashboardSnapshot } from "./types";
import { emptyWizard, type WizardState } from "./ui/program-wizard";
import { requestWriteScope } from "./auth/google-token";
import { programTableInitMutations } from "./programs/mutations";
import { duplicateConfig } from "./ui/programs";

let screen: Screen = "programs";
let snap: DashboardSnapshot | null = null;
let bookName: string = PROGRAM.title;
let account = "";
let canEdit = false;
let writeEnabled = false;
let selectedProgramId: string = PROGRAM.legacyDefaultProgramId;
let wizard: WizardState | null = null;
let query = "";
let banner: { kind: "ok" | "warn" | "err"; text: string } | null = {
  kind: "warn",
  text: "Program Launcher is preview-first. Demo uses synthetic rows. Live Google reads need a UH OAuth client ID. Writes need a workbook copy.",
};

function paint(): void {
  renderShell({
    snap,
    screen,
    bookName,
    account,
    canEdit,
    writeEnabled,
    selectedProgramId,
    wizard,
    banner,
    query,
    onNav: (s) => {
      if (s === "wizard" && !wizard) wizard = emptyWizard();
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
      writeEnabled = false;
      banner = { kind: "ok", text: "Signed out. Token was memory-only and is gone." };
      paint();
    },
    onSelectProgram: (id) => {
      selectedProgramId = id;
      paint();
    },
    onWizardChange: (w) => {
      wizard = w;
      paint();
    },
    onLaunch: (plan) => {
      if (plan.blocking.length) {
        banner = { kind: "err", text: plan.blocking[0] };
        paint();
        return;
      }
      banner = {
        kind: "warn",
        text: `Launch plan ready for ${plan.program.programId}: ${plan.students.length} students, ${plan.tests.length} tests, ${plan.state.length} state rows. Live writes are blocked until a workbook copy is approved.`,
      };
      screen = "programs";
      paint();
    },
    onEnableEditing: () => {
      if (!canEdit) {
        banner = { kind: "warn", text: "This account cannot edit the workbook." };
        paint();
        return;
      }
      const ok = requestWriteScope(() => {
        writeEnabled = true;
        banner = { kind: "ok", text: "Write scope granted in this browser session. Still confirm each mutation." };
        paint();
      });
      if (!ok) {
        banner = { kind: "warn", text: "Could not request write scope. OAuth client ID is still required." };
        paint();
      }
    },
    onInitTables: () => {
      const planned = programTableInitMutations();
      banner = {
        kind: "warn",
        text: `Would create tabs ${planned.addSheets.join(", ")} on a workbook copy. Live book is not mutated from this session.`,
      };
      paint();
    },
    onArchive: (id) => {
      banner = { kind: "warn", text: `Archive of ${id} is preview-only until workbook-copy writes are enabled.` };
      paint();
    },
    onDuplicate: (id) => {
      const src = snap?.programs.find((p) => p.programId === id);
      if (!src) return;
      const hint = duplicateConfig(src);
      wizard = emptyWizard(hint.name);
      wizard.draft.programId = hint.idHint;
      screen = "wizard";
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
  writeEnabled = false;
  selectedProgramId = snap.programs.find((p) => p.status === "ACTIVE")?.programId || PROGRAM.legacyDefaultProgramId;
  banner = {
    kind: "ok",
    text: `Demo loaded. ${snap.programs.length} programs, ${snap.students.length} students, ${snap.legacyAttributedResults} legacy-attributed results. Writes disabled.`,
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
