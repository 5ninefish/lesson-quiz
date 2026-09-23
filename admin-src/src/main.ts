import "./style.css";
import { PROGRAM } from "./config";
import { clearAccessToken, initTokenClient, oauthConfigured, waitForGoogleSignIn } from "./auth/google-token";
import { loadRawWorkbook, loadWorkbookMeta } from "./google/sheets-client";
import { buildSnapshot } from "./workbook/snapshot";
import { instructorMessage, type ErrorCode } from "./errors";
import { renderShell, type Screen } from "./ui/shell";
import type { DashboardSnapshot, MutationPreview } from "./types";
import { emptyWizard, wizardFromProgram, type WizardState } from "./ui/program-wizard";
import { planAssignmentUpdate } from "./programs/assignment-save";
import { requestWriteScope } from "./auth/google-token";
import { programTableInitMutations } from "./programs/mutations";
import { seedHokulaniPlan } from "./programs/seed";
import { appendRows, executeBatchWrite } from "./google/batch-write";
import { applyLessonTitleNotes, renameFirstCohort } from "./google/lesson-notes";
import { confirmDialog } from "./ui/dialogs";
import { duplicateConfig } from "./ui/programs";

let screen: Screen = "programs";
let snap: DashboardSnapshot | null = null;
let bookName: string = PROGRAM.title;
let account = "";
let canEdit = false;
let writeEnabled = false;
let lessonNotesApplied = false;
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
    onEditAssignments: (programId) => {
      if (!snap) return;
      const next = wizardFromProgram(snap, programId);
      if (!next) {
        banner = { kind: "err", text: "That program is not on this workbook." };
        paint();
        return;
      }
      wizard = next;
      screen = "wizard";
      paint();
    },
    onApplyRelease: (preview) => {
      void saveRelease(preview);
    },
    onLaunch: (plan) => {
      if (plan.blocking.length) {
        banner = { kind: "err", text: plan.blocking[0] };
        paint();
        return;
      }
      if (wizard?.mode === "edit" && snap) {
        void saveAssignments();
        return;
      }
      banner = {
        kind: "warn",
        text: `Launch plan ready for ${plan.program.programId}: ${plan.students.length} students, ${plan.tests.length} tests. Creating a brand-new program on the copy still needs a confirm on the review screen after editing is on.`,
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
          void maybeApplyLessonNotes();
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
      const startInit = () => {
        const planned = programTableInitMutations();
        confirmDialog({
          title: "Create program tabs on the copy",
          body: `This adds four empty tabs to the copied workbook:\n${planned.addSheets.join(", ")}\n\nIt does not change Students, Questions, Releases, or the live student quiz.`,
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
              await maybeApplyLessonNotes();
              await refreshLive();
            })();
          },
        });
      };
      if (writeEnabled) {
        startInit();
        return;
      }
      banner = { kind: "ok", text: "Google will ask for permission to edit the copy." };
      paint();
      const ok = requestWriteScope(
        () => {
          writeEnabled = true;
          void maybeApplyLessonNotes();
          startInit();
        },
        (message) => {
          banner = { kind: "err", text: message };
          paint();
        },
      );
      if (!ok) {
        banner = { kind: "err", text: "Google is not ready yet. Wait a moment and click Initialize again." };
        paint();
      }
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
            await maybeApplyLessonNotes();
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

async function saveRelease(preview: MutationPreview): Promise<void> {
  const write = async () => {
    const result = await executeBatchWrite({
      valueUpdates: [{ range: preview.range, values: [preview.after] }],
    });
    if (!result.ok) {
      banner = { kind: "err", text: instructorMessage((result.code as ErrorCode) || "write_verify") };
      paint();
      return;
    }
    await appendRows("Audit", [[new Date().toISOString(), account || "instructor", preview.id, preview.description]]);
    banner = { kind: "ok", text: "Saved on the workbook this page is reading." };
    await refreshLive();
  };
  if (!writeEnabled) {
    const ok = requestWriteScope(
      () => {
        writeEnabled = true;
        void write();
      },
      (message) => {
        banner = { kind: "err", text: message };
        paint();
      },
    );
    if (!ok) {
      banner = { kind: "err", text: "Turn on Enable editing, then open the test again." };
      paint();
    }
    return;
  }
  await write();
}

async function maybeApplyLessonNotes(): Promise<void> {
  if (!writeEnabled || lessonNotesApplied) return;
  const result = await applyLessonTitleNotes();
  const renamed = await renameFirstCohort();
  if (result.ok && renamed.ok) lessonNotesApplied = true;
}

async function saveAssignments(): Promise<void> {
  if (!snap || !wizard || wizard.mode !== "edit") return;
  const draft = { ...wizard.draft, nowHst: new Date().toISOString(), actor: account || "instructor" };
  const update = planAssignmentUpdate({
    programId: draft.programId,
    draft,
    memberships: snap.programStudents,
    programTests: snap.programTests,
  });
  if (update.blocking.length) {
    banner = { kind: "err", text: update.blocking[0] };
    paint();
    return;
  }
  if (!writeEnabled) {
    const ok = requestWriteScope(
      () => {
        writeEnabled = true;
        void saveAssignments();
      },
      (message) => {
        banner = { kind: "err", text: message };
        paint();
      },
    );
    if (!ok) {
      banner = { kind: "err", text: "Google is not ready to save yet. Wait a moment and try Save assignments again." };
      paint();
    }
    return;
  }
  confirmDialog({
    title: "Save assignments",
    body: [
      `Program: ${draft.programName}`,
      `Add students: ${update.addedStudents.length || "none"}`,
      `Remove students: ${update.removedStudents.length || "none"}`,
      `Add tests: ${update.addedTests.length || "none"}`,
      `Remove tests: ${update.removedTests.length || "none"}`,
      "",
      "Writes the copy only.",
    ].join("\n"),
    confirmLabel: "Save",
    onConfirm: () => {
      void (async () => {
        if (update.updates.length) {
          const wrote = await executeBatchWrite({
            valueUpdates: update.updates.map((u) => ({ range: u.range, values: u.values })),
          });
          if (!wrote.ok) {
            banner = { kind: "err", text: instructorMessage((wrote.code as ErrorCode) || "write_verify") };
            paint();
            return;
          }
        }
        for (const block of update.appends) {
          const wrote = await appendRows(block.tab, block.values);
          if (!wrote.ok) {
            banner = { kind: "err", text: instructorMessage((wrote.code as ErrorCode) || "write_verify") };
            paint();
            return;
          }
        }
        banner = { kind: "ok", text: "Assignments saved on the copy." };
        screen = "programs";
        await refreshLive();
      })();
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
