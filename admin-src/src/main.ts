import "./style.css";
import { PROGRAM } from "./config";
import { clearAccessToken, initTokenClient, oauthConfigured, waitForGoogleSignIn } from "./auth/google-token";
import { loadRawWorkbook, loadWorkbookMeta } from "./google/sheets-client";
import { buildSnapshot } from "./workbook/snapshot";
import { instructorMessage, type ErrorCode } from "./errors";
import { renderShell, type Screen } from "./ui/shell";
import type { DashboardSnapshot } from "./types";
import { emptyWizard, type WizardState } from "./ui/program-wizard";
import { requestWriteScope } from "./auth/google-token";
import { programTableInitMutations } from "./programs/mutations";
import { seedHokulaniPlan } from "./programs/seed";
import { appendRows, executeBatchWrite } from "./google/batch-write";
import { confirmDialog } from "./ui/dialogs";
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
  text: "Sign in with UH Google to read the workbook copy, or load the demo to show staff. Student quiz still uses the original live book.",
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
      void startSignIn();
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
      const ok = requestWriteScope(
        () => {
          writeEnabled = true;
          banner = { kind: "ok", text: "Editing is on for this session. Confirm each change." };
          paint();
        },
        (message) => {
          banner = { kind: "err", text: message };
          paint();
        },
      );
      if (!ok) {
        banner = { kind: "warn", text: "Google sign-in is not ready yet. Wait a moment and try Enable editing again." };
        paint();
      }
    },
    onInitTables: () => {
      if (!writeEnabled) {
        banner = { kind: "warn", text: "Enable editing first, then initialize." };
        paint();
        return;
      }
      const planned = programTableInitMutations();
      confirmDialog({
        title: "Initialize Program Launcher",
        body: `Create tabs on the workbook COPY only:\n${planned.addSheets.join(", ")}\n\nDoes not touch Students, Questions, Releases, or the live student book. Never runs setup().`,
        confirmLabel: "Create tabs",
        onConfirm: () => {
          void (async () => {
            const result = await executeBatchWrite({
              addSheets: planned.addSheets,
              valueUpdates: planned.headers.map((h) => ({ range: h.range, values: h.values })),
            });
            if (!result.ok) {
              banner = { kind: "err", text: instructorMessage((result.code as ErrorCode) || "write_verify") };
              paint();
              return;
            }
            banner = { kind: "ok", text: "Program tabs created on the copy. Next: Seed Hōkūlani." };
            await refreshLive();
          })();
        },
      });
    },
    onSeedHokulani: () => {
      if (!writeEnabled || !snap) {
        banner = { kind: "warn", text: "Enable editing first, then seed." };
        paint();
        return;
      }
      const { plan, report } = seedHokulaniPlan({
        students: snap.students,
        releases: snap.releases,
        actor: account || "instructor",
        nowHst: new Date().toISOString(),
      });
      if (report.blocking.length) {
        banner = { kind: "err", text: report.blocking[0] };
        paint();
        return;
      }
      confirmDialog({
        title: "Seed Hōkūlani on the copy",
        body: `Program hokulani ACTIVE\n${report.memberships} students\n${report.programTests} tests\n${report.stateRows} state rows\n\nWrites the copy only.`,
        confirmLabel: "Seed copy",
        onConfirm: () => {
          void (async () => {
            const grouped = new Map<string, string[][]>();
            for (const row of plan.rows) {
              const list = grouped.get(row.tab) || [];
              list.push(row.values);
              grouped.set(row.tab, list);
            }
            for (const [tab, values] of grouped) {
              const result = await appendRows(tab, values);
              if (!result.ok) {
                banner = { kind: "err", text: instructorMessage((result.code as ErrorCode) || "write_verify") };
                paint();
                return;
              }
            }
            banner = { kind: "ok", text: "Hōkūlani seeded on the copy. Open dashboard to review." };
            await refreshLive();
          })();
        },
      });
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

async function startSignIn(): Promise<void> {
  banner = { kind: "ok", text: "Opening Google sign-in…" };
  paint();
  const ready = await waitForGoogleSignIn();
  if (!ready) {
    banner = {
      kind: "err",
      text: "Google sign-in is still loading. Wait a couple of seconds and click Sign in again. If this keeps happening, allow accounts.google.com on this page.",
    };
    paint();
    return;
  }
  const client = initTokenClient(
    () => {
      account = "UH Google";
      void refreshLive();
    },
    (message) => {
      banner = { kind: "err", text: message };
      paint();
    },
  );
  if (!client) {
    banner = {
      kind: "err",
      text: oauthConfigured()
        ? "Google sign-in did not start. Refresh the page once, wait for it to finish loading, then click Sign in."
        : "Google sign-in is not configured yet.",
    };
    paint();
    return;
  }
  client.requestAccessToken({ prompt: "select_account" });
}

async function loadDemo(): Promise<void> {
  const { observedWorkbook } = await import("./fixtures/observed");
  snap = buildSnapshot(observedWorkbook());
  bookName = "Demo (synthetic; not a Google Sheet)";
  account = "demo";
  canEdit = false;
  writeEnabled = false;
  selectedProgramId = snap.programs.find((p) => p.status === "ACTIVE")?.programId || PROGRAM.legacyDefaultProgramId;
  banner = {
    kind: "ok",
    text: `Demo loaded for staff walkthrough. ${snap.programs.length} programs, ${snap.students.length} students. Not the Hōkūlani book.`,
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
    selectedProgramId = snap.programs.find((p) => p.status === "ACTIVE")?.programId || PROGRAM.legacyDefaultProgramId;
    banner = {
      kind: snap.programTablesPresent ? "ok" : "warn",
      text: snap.programTablesPresent
        ? `Workbook copy loaded: ${snap.students.length} students.`
        : "Workbook copy loaded. Program tabs are missing — use Initialize Program Launcher on this copy, never setup() on the live student book.",
    };
  } catch (err) {
    const code = (err as { code?: ErrorCode }).code || "network";
    banner = { kind: "err", text: instructorMessage(code) };
  }
  paint();
}

paint();
