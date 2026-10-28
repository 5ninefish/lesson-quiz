import "./style.css";
import { PROGRAM } from "./config";
import { clearAccessToken, initTokenClient, oauthConfigured, waitForGoogleSignIn } from "./auth/google-token";
import { loadRawWorkbook, loadWorkbookMeta } from "./google/sheets-client";
import { buildSnapshot } from "./workbook/snapshot";
import { instructorMessage, type ErrorCode } from "./errors";
import { renderShell, type Screen } from "./ui/shell";
import type { DashboardSnapshot, LaunchPlan, MutationPreview } from "./types";
import { emptyWizard, wizardFromDuplicate, wizardFromProgram, type WizardState } from "./ui/program-wizard";
import { planAssignmentUpdate, planProgramConfigUpdate } from "./programs/assignment-save";
import { buildLaunchPlan, verifyLaunch } from "./programs/launcher";
import { planCycleReset } from "./programs/reset";
import { buildStudentRows, type RosterImportRow } from "./programs/roster-import";
import { requestWriteScope } from "./auth/google-token";
import { programTableInitMutations, verifyCells } from "./programs/mutations";
import { seedHokulaniPlan } from "./programs/seed";
import { appendRows, executeBatchWrite, readRange } from "./google/batch-write";
import { applyLessonTitleNotes, renameFirstCohort } from "./google/lesson-notes";
import { confirmDialog } from "./ui/dialogs";
import { clearStaySignedIn } from "./ui/relogin-warning";

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
  text: "Sign in with UH Google to read the live student workbook, or load the demo to show staff.",
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
      clearStaySignedIn();
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
      if (account === "demo") {
        banner = { kind: "warn", text: "The demo workbook is not saved. Sign in to launch a program." };
        paint();
        return;
      }
      const start = () => {
        confirmDialog({
          title: `Launch ${plan.program.programName}?`,
          body: [
            `ID ${plan.program.programId} stays the same after launch.`,
            `${plan.students.length} students`,
            `${plan.tests.length} tests`,
            `${plan.state.length} state rows`,
            "Writes the workbook this page is reading. Attempts and results are not copied.",
          ].join("\n"),
          confirmLabel: "Launch",
          onConfirm: () => {
            void runLaunch();
          },
        });
      };
      armWrite(start, "Google will ask for permission to edit this workbook.");
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
          title: "Create program tabs",
          body: `This adds four empty tabs to the workbook this page is reading:\n${planned.addSheets.join(", ")}\n\nIt does not change Students, Questions, Releases, Attempts, or Results, and it does not run setup().`,
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
              banner = { kind: "ok", text: "Program tabs created. Next: Seed Hōkūlani." };
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
      banner = { kind: "ok", text: "Google will ask for permission to edit this workbook." };
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
        title: "Seed Hōkūlani",
        body: `Program hokulani ACTIVE\n${report.memberships} students\n${report.programTests} tests\n${report.stateRows} state rows\n\nWrites the workbook this page is reading.`,
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
            banner = { kind: "ok", text: "Hōkūlani seeded. Open the program to review it." };
            await maybeApplyLessonNotes();
            await refreshLive();
          })();
        },
      });
    },
    onArchive: (id) => {
      void archiveProgram(id);
    },
    onDuplicate: (id) => {
      if (!snap) return;
      const next = wizardFromDuplicate(snap, id);
      if (!next) return;
      wizard = next;
      screen = "wizard";
      banner = {
        kind: "ok",
        text: `Copying configuration into ${next.draft.programId}. Attempts and results stay on the original. Launch on the review step to save it.`,
      };
      paint();
    },
    onImportRoster: (rows) => {
      void importRoster(rows);
    },
    onResetCycle: (username, testId) => {
      void resetCycle(username, testId);
    },
  });
}

function armWrite(start: () => void, pending: string): void {
  if (writeEnabled) {
    start();
    return;
  }
  banner = { kind: "ok", text: pending };
  paint();
  const ok = requestWriteScope(
    () => {
      writeEnabled = true;
      void maybeApplyLessonNotes();
      start();
    },
    (message) => {
      banner = { kind: "err", text: message };
      paint();
    },
  );
  if (!ok) {
    banner = { kind: "err", text: "Google is not ready yet. Wait a moment and try again." };
    paint();
  }
}

function refuseDemo(): boolean {
  if (account !== "demo") return false;
  banner = { kind: "warn", text: "The demo workbook is not a Google Sheet. Sign in to change the live workbook." };
  paint();
  return true;
}

async function appendGrouped(
  rows: Array<{ tab: string; values: string[] }>,
): Promise<{ ok: true; wrote: string[] } | { ok: false; code: string; wrote: string[] }> {
  const grouped = new Map<string, string[][]>();
  for (const row of rows) {
    const list = grouped.get(row.tab) || [];
    list.push(row.values);
    grouped.set(row.tab, list);
  }
  const order = ["Programs", "ProgramStudents", "ProgramTests", "ProgramStudentState", "Students", "Audit"];
  const tabs = [...order.filter((tab) => grouped.has(tab)), ...[...grouped.keys()].filter((tab) => !order.includes(tab))];
  const wrote: string[] = [];
  for (const tab of tabs) {
    const result = await appendRows(tab, grouped.get(tab) || []);
    if (!result.ok) return { ok: false, code: result.code, wrote };
    wrote.push(tab);
  }
  return { ok: true, wrote };
}

async function runLaunch(): Promise<void> {
  if (!snap || !wizard || wizard.mode !== "create") return;
  const draft = { ...wizard.draft, nowHst: new Date().toISOString(), actor: account || "instructor" };
  const plan = buildLaunchPlan({
    draft,
    existingProgramIds: snap.programs.map((p) => p.programId),
    students: snap.students,
    questions: snap.questions,
  });
  if (plan.blocking.length) {
    banner = { kind: "err", text: plan.blocking[0] };
    paint();
    return;
  }
  const wrote = await appendGrouped(plan.rows);
  if (!wrote.ok) {
    banner = {
      kind: "err",
      text: `Launch stopped after writing ${wrote.wrote.join(", ") || "nothing"}. Do not launch ${plan.program.programId} again. Refresh and use Edit assignments if that program row exists.`,
    };
    await refreshLive();
    return;
  }
  const next = await refreshLive();
  const mismatches = next
    ? verifyLaunch(plan, {
        programs: next.programs,
        students: next.programStudents,
        tests: next.programTests,
        state: next.programState,
      })
    : ["The workbook did not reload, so launch was not verified."];
  if (next) {
    const got = new Set(next.programTests.filter((t) => t.programId === plan.program.programId).map((t) => t.testId));
    for (const test of plan.tests) {
      if (!got.has(test.testId)) mismatches.push(`ProgramTests missing ${test.testId}.`);
    }
  }
  if (mismatches.length) {
    banner = { kind: "err", text: mismatches.join(" ") };
  } else {
    selectedProgramId = plan.program.programId;
    screen = "programs";
    wizard = null;
    banner = {
      kind: "ok",
      text: `Launched ${plan.program.programName}. Verified ${plan.students.length} students, ${plan.tests.length} tests, and ${plan.state.length} state rows.`,
    };
  }
  paint();
}

async function archiveProgram(id: string): Promise<void> {
  if (refuseDemo() || !snap) return;
  const program = snap.programs.find((p) => p.programId === id);
  if (!program?.rowNumber) {
    banner = { kind: "err", text: "That program has no sheet row to archive." };
    paint();
    return;
  }
  const write = async () => {
    const live = await readRange(`Programs!A${program.rowNumber}:C${program.rowNumber}`);
    if (!live.ok) {
      banner = { kind: "err", text: instructorMessage((live.code as ErrorCode) || "network") };
      paint();
      return;
    }
    const row = live.values[0] || [];
    if (String(row[0] || "").toLowerCase() !== program.programId || String(row[2] || "").toUpperCase() !== program.status) {
      banner = { kind: "err", text: "That program changed since this page loaded. Nothing was archived. The page was refreshed." };
      await refreshLive();
      return;
    }
    const now = new Date().toISOString();
    const actor = account || "instructor";
    const wrote = await executeBatchWrite({
      valueUpdates: [
        { range: `Programs!C${program.rowNumber}`, values: [["ARCHIVED"]] },
        { range: `Programs!H${program.rowNumber}:I${program.rowNumber}`, values: [[now, actor]] },
      ],
    });
    if (!wrote.ok) {
      banner = { kind: "err", text: instructorMessage((wrote.code as ErrorCode) || "write_verify") };
      paint();
      return;
    }
    const audit = await appendRows("Audit", [[now, actor, "archive_program", `${id} history kept`]]);
    const next = await refreshLive();
    const saved = next?.programs.find((p) => p.programId === id);
    if (!audit.ok || !saved || saved.status !== "ARCHIVED") {
      banner = { kind: "err", text: `Archive of ${id} did not verify. Do not archive it again until the Programs tab is checked.` };
    } else {
      banner = { kind: "ok", text: `${saved.programName} is archived. Its history is still on the workbook.` };
    }
    paint();
  };
  armWrite(write, "Google will ask for permission to edit this workbook.");
}

async function importRoster(rows: RosterImportRow[]): Promise<void> {
  if (refuseDemo() || !snap) return;
  const write = async () => {
    const header = await readRange("Students!1:1");
    if (!header.ok) {
      banner = { kind: "err", text: instructorMessage((header.code as ErrorCode) || "network") };
      paint();
      return;
    }
    const built = buildStudentRows(header.values[0] || [], rows);
    if (built.blocking.length) {
      banner = { kind: "err", text: built.blocking[0] };
      paint();
      return;
    }
    confirmDialog({
      title: "Add students to the shared bank?",
      body: [
        built.values.length + " new usernames",
        rows.map((row) => `${row.username}${row.email ? ` <${row.email}>` : ""}`).join("\n"),
        "",
        "Existing accounts are not changed. Passwords stay as typed and are not shown again here.",
        "This does not enroll them in a program.",
      ].join("\n"),
      confirmLabel: "Add students",
      onConfirm: () => {
        void (async () => {
          const wrote = await appendRows("Students", built.values);
          if (!wrote.ok) {
            banner = { kind: "err", text: instructorMessage((wrote.code as ErrorCode) || "write_verify") };
            paint();
            return;
          }
          const now = new Date().toISOString();
          await appendRows("Audit", [[now, account || "instructor", "import_students", rows.map((row) => row.username).join(",")]]);
          const next = await refreshLive();
          const missing = rows.filter((row) => !next?.students.some((student) => student.username === row.username));
          if (missing.length) {
            banner = {
              kind: "err",
              text: `Import did not verify ${missing.map((row) => row.username).join(", ")}. Do not import those usernames again until the Students tab is checked.`,
            };
          } else {
            banner = { kind: "ok", text: `Added ${rows.length} students to the shared bank. Enroll them from Edit assignments.` };
          }
          paint();
        })();
      },
    });
  };
  armWrite(write, "Google will ask for permission to edit this workbook.");
}

async function resetCycle(username: string, testId: string): Promise<void> {
  if (refuseDemo() || !snap) return;
  const book = snap;
  const programId = selectedProgramId;
  const plan = planCycleReset({
    programId,
    username,
    testId,
    state: book.programState,
    enabledTestIds: book.programTests.filter((test) => test.programId === programId && test.enabled).map((test) => test.testId),
    attempts: book.attempts,
    actor: account || "instructor",
    nowHst: new Date().toISOString(),
  });
  if (plan.blocking.length) {
    banner = { kind: "err", text: plan.blocking[0] };
    paint();
    return;
  }
  const write = async () => {
    for (const row of book.programState.filter((item) => item.programId === programId && item.username === username.trim().toLowerCase())) {
      if (testId !== "ALL" && row.testId !== testId) continue;
      const live = await readRange(`ProgramStudentState!D${row.rowNumber}`);
      if (!live.ok) {
        banner = { kind: "err", text: instructorMessage((live.code as ErrorCode) || "network") };
        paint();
        return;
      }
      if (String((live.values[0] || [])[0] || "") !== String(row.cycle)) {
        banner = { kind: "err", text: "That cycle changed since this page loaded. Nothing was reset. The page was refreshed." };
        await refreshLive();
        return;
      }
    }
    confirmDialog({
      title: "Reset allowance?",
      body: plan.summary,
      confirmLabel: "Reset",
      onConfirm: () => {
        void (async () => {
          if (plan.updates.length) {
            const wrote = await executeBatchWrite({ valueUpdates: plan.updates });
            if (!wrote.ok) {
              banner = { kind: "err", text: instructorMessage((wrote.code as ErrorCode) || "write_verify") };
              paint();
              return;
            }
          }
          for (const block of plan.appends) {
            const wrote = await appendRows(block.tab, block.values);
            if (!wrote.ok) {
              banner = {
                kind: "err",
                text: `Reset stopped while writing ${block.tab}. Do not reset ${username} in ${programId} again until that tab is checked.`,
              };
              await refreshLive();
              return;
            }
          }
          const beforeState = book.programState;
          const beforeTests = book.programTests;
          const next = await refreshLive();
          const wanted = testId === "ALL"
            ? beforeTests.filter((test) => test.programId === programId && test.enabled).map((test) => test.testId)
            : [testId];
          const failed = wanted.filter((id) => {
            const before = beforeState.find((row) => row.programId === programId && row.username === username.trim().toLowerCase() && row.testId === id);
            const after = next?.programState.find((row) => row.programId === programId && row.username === username.trim().toLowerCase() && row.testId === id);
            const expected = (before?.cycle || 1) + 1;
            return !after || after.cycle !== expected || after.sitCache !== 0;
          });
          if (failed.length) {
            banner = { kind: "err", text: `Reset did not verify ${failed.join(", ")}. Do not reset those again until ProgramStudentState is checked.` };
          } else {
            banner = { kind: "ok", text: `Reset verified. ${plan.summary}` };
          }
          paint();
        })();
      },
    });
  };
  armWrite(write, "Google will ask for permission to edit this workbook.");
}

async function saveRelease(preview: MutationPreview): Promise<void> {
  const write = async () => {
    const live = await readRange(preview.range);
    if (!live.ok) {
      banner = { kind: "err", text: instructorMessage((live.code as ErrorCode) || "network") };
      paint();
      return;
    }
    if (verifyCells(preview.before, live.values[0] || []).length) {
      banner = { kind: "err", text: "That release changed since this page loaded. Nothing was saved. The page was refreshed." };
      await refreshLive();
      return;
    }
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
  const program = snap.programs.find((item) => item.programId === draft.programId);
  const config = program ? planProgramConfigUpdate(program, draft) : null;
  const update = planAssignmentUpdate({
    programId: draft.programId,
    draft,
    memberships: snap.programStudents,
    programTests: snap.programTests,
    state: snap.programState,
  });
  if (update.blocking.length) {
    banner = { kind: "err", text: update.blocking[0] };
    paint();
    return;
  }
  if (!config && !update.updates.length && !update.appends.length) {
    banner = { kind: "ok", text: "No assignment changes to save." };
    screen = "programs";
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
      `New state rows: ${update.addedState}`,
      config ? "Program name, dates, or status will also be saved." : "",
      "",
      "Writes the workbook this page is reading. History is kept.",
    ].join("\n"),
    confirmLabel: "Save",
    onConfirm: () => {
      void (async () => {
        if (config) {
          const wrote = await executeBatchWrite({ valueUpdates: [config] });
          if (!wrote.ok) {
            banner = { kind: "err", text: instructorMessage((wrote.code as ErrorCode) || "write_verify") };
            paint();
            return;
          }
        }
        if (update.updates.length) {
          const wrote = await executeBatchWrite({
            valueUpdates: update.updates.map((u) => ({ range: u.range, values: u.values })),
          });
          if (!wrote.ok) {
            banner = {
              kind: "err",
              text: "Assignment update stopped after an earlier write. Do not save this program again until the program tabs are checked.",
            };
            await refreshLive();
            return;
          }
        }
        const appended: string[] = [];
        for (const block of update.appends) {
          const wrote = await appendRows(block.tab, block.values);
          if (!wrote.ok) {
            banner = {
              kind: "err",
              text: `Assignment save stopped after ${appended.join(", ") || "the updates"}. ${block.tab} was not written. Do not save again until that tab is checked.`,
            };
            await refreshLive();
            return;
          }
          appended.push(block.tab);
        }
        banner = { kind: "ok", text: "Assignments saved. The workbook was read back." };
        screen = "programs";
        const next = await refreshLive();
        const members = next?.programStudents.filter((row) => row.programId === draft.programId && row.active).length || 0;
        const enabled = next?.programTests.filter((row) => row.programId === draft.programId && row.enabled).length || 0;
        if (members !== draft.usernames.length || enabled !== draft.tests.length) {
          banner = {
            kind: "err",
            text: `Save did not verify. Expected ${draft.usernames.length} students and ${draft.tests.length} tests; found ${members} and ${enabled}. Do not save again until the program tabs are checked.`,
          };
          paint();
        }
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

async function refreshLive(): Promise<DashboardSnapshot | null> {
  try {
    const meta = await loadWorkbookMeta();
    bookName = meta.name;
    canEdit = meta.canEdit;
    const raw = await loadRawWorkbook();
    const previous = selectedProgramId;
    snap = buildSnapshot(raw);
    if (!snap.programs.some((p) => p.programId === previous)) {
      selectedProgramId = snap.programs.find((p) => p.status === "ACTIVE")?.programId || PROGRAM.legacyDefaultProgramId;
    }
    banner = {
      kind: snap.programTablesPresent ? "ok" : "warn",
      text: snap.programTablesPresent
        ? `Live workbook loaded: ${snap.students.length} students.`
        : "Live workbook loaded. Program tabs are missing — use Initialize Program Launcher, then Seed Hōkūlani. Do not run setup().",
    };
  } catch (err) {
    const code = (err as { code?: ErrorCode }).code || "network";
    banner = { kind: "err", text: instructorMessage(code) };
    paint();
    return null;
  }
  paint();
  return snap;
}

paint();
