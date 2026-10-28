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
import { type RosterImportRow } from "./programs/roster-import";
import { requestWriteScope } from "./auth/google-token";
import { seedHokulaniPlan } from "./programs/seed";
import { minutesToSeconds, phaseOf } from "./programs/ids";
import { postInstructorCommand, type CommandResponse } from "./google/backend-client";
import { PUBLISHED_LESSONS } from "./teaching";
import type { LessonDraft } from "./ui/lessons";
import { confirmDialog } from "./ui/dialogs";
import { clearStaySignedIn } from "./ui/relogin-warning";

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
        confirmDialog({
          title: "Create missing workbook tabs",
          body: "This asks the existing quiz service to add any missing program and catalog tabs. It does not change Students, Questions, Releases, Attempts, or Results, and it does not run setup().",
          confirmLabel: "Create tabs",
          onConfirm: () => {
            void (async () => {
              const created = await postInstructorCommand("init_sheets", {}, crypto.randomUUID());
              if (!created.ok) {
                showCommandResult(created, "");
                paint();
                return;
              }
              const seeded = await postInstructorCommand("seed_catalog", {}, crypto.randomUUID());
              showCommandResult(seeded, "Missing tabs and catalog metadata were saved. Question banks were not imported. Next: Seed Hōkūlani if this book has no program yet.");
              await refreshLive(true);
              paint();
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
            const result = await postInstructorCommand("launch_program", launchPayload(plan), crypto.randomUUID());
            const next = await refreshLive(true);
            const mismatches = next ? verifyLaunch(plan, { programs: next.programs, students: next.programStudents, tests: next.programTests, state: next.programState }) : ["The workbook did not reload."];
            if (!result.ok || mismatches.length) showCommandResult(result.ok ? { ok: false, error: mismatches.join(" ") } : result, "");
            else banner = { kind: "ok", text: "Hōkūlani seeded. Open the program to review it." };
            paint();
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
    onSaveLessons: (programId, lessons) => {
      void saveProgramLessons(programId, lessons);
    },
    onRegisterLessons: () => {
      void registerPublishedLessons();
    },
  });
}

async function registerPublishedLessons(): Promise<void> {
  const write = async () => {
    const result = await postInstructorCommand("register_lessons", {}, crypto.randomUUID());
    const next = await refreshLive(true);
    const have = new Set((next?.lessonCatalog || []).map((row) => row.lessonId));
    const missing = PUBLISHED_LESSONS.filter((pack) => !have.has(pack.lessonId)).map((pack) => pack.lessonId);
    if (!result.ok || missing.length) showCommandResult(result.ok ? { ok: false, error: "verify" } : result, "");
    else banner = { kind: "ok", text: "Published lessons are on the catalog. Assign them from Edit lessons. Existing tests were not changed." };
    paint();
  };
  armWrite(write, "Google will ask for permission to edit this workbook.");
}

async function saveProgramLessons(programId: string, lessons: LessonDraft[]): Promise<void> {
  const write = async () => {
    const result = await postInstructorCommand("save_program_lessons", {
      programId,
      lessons: lessons.map((lesson) => ({
        lessonId: lesson.lessonId,
        enabled: lesson.enabled,
        sortOrder: lesson.sortOrder,
        openAt: lesson.openAt,
        closeAt: lesson.closeAt,
        requirePre: lesson.requirePre,
      })),
    }, crypto.randomUUID());
    const next = await refreshLive(true);
    const saved = (next?.programLessons || []).filter((row) => row.programId === programId);
    const matches = lessons.every((lesson) => {
      const row = saved.find((item) => item.lessonId === lesson.lessonId);
      if (!lesson.enabled) return !row || !row.enabled;
      return !!row &&
        row.enabled &&
        row.sortOrder === lesson.sortOrder &&
        row.openAt === lesson.openAt &&
        row.closeAt === lesson.closeAt &&
        row.requirePre === lesson.requirePre;
    });
    if (!result.ok || !matches) showCommandResult(result.ok ? { ok: false, error: "verify" } : result, "");
    else banner = { kind: "ok", text: "Lessons saved. Assessment release was not changed." };
    paint();
  };
  armWrite(write, "Google will ask for permission to edit this workbook.");
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

function showCommandResult(result: CommandResponse, okText: string): void {
  if (result.uncertain) {
    banner = { kind: "err", text: "Checking save did not confirm this change. It was not repeated. Refresh and look before trying again." };
    return;
  }
  if (!result.ok) {
    const detail = result.error === "stale"
      ? "That record changed since this page loaded. Nothing was saved."
      : result.error === "not_allowed" || result.error === "sign_in"
        ? "This Google account cannot edit the workbook, or the sign-in expired."
        : result.error === "unknown_action"
          ? "The live quiz service does not have this command yet. The workbook was not changed."
          : `Save failed (${result.error || "unknown"}). Nothing else was written.`;
    banner = { kind: "err", text: detail };
    return;
  }
  if (okText) banner = { kind: "ok", text: okText };
}

function launchPayload(plan: LaunchPlan): Record<string, unknown> {
  return {
    program: {
      programId: plan.program.programId,
      programName: plan.program.programName,
      status: plan.program.status,
      startAt: plan.program.startAt,
      endAt: plan.program.endAt,
    },
    students: plan.students.map((student) => ({ username: student.username })),
    tests: plan.tests.map((test) => ({
      testId: test.testId,
      phase: phaseOf(test.phase),
      sortOrder: test.sortOrder,
      manual: test.manual,
      openAt: test.openAt,
      closeAt: test.closeAt,
      maxTries: test.maxTries,
      timeLimitSec: test.timeLimitSec,
    })),
  };
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
  const result = await postInstructorCommand("launch_program", launchPayload(plan), crypto.randomUUID());
  const next = await refreshLive(true);
  const mismatches = result.ok && next
    ? verifyLaunch(plan, {
        programs: next.programs,
        students: next.programStudents,
        tests: next.programTests,
        state: next.programState,
      })
    : result.ok
      ? ["The workbook did not reload, so launch was not verified."]
      : [];
  if (!result.ok || mismatches.length) {
    showCommandResult(result.ok ? { ok: false, error: mismatches.join(" ") } : result, "");
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
  if (!program) {
    banner = { kind: "err", text: "That program is not on this workbook." };
    paint();
    return;
  }
  const write = async () => {
    const result = await postInstructorCommand("archive_program", {
      programId: id,
      expectedStatus: program.status,
    }, crypto.randomUUID());
    const next = await refreshLive(true);
    const saved = next?.programs.find((p) => p.programId === id);
    if (!result.ok || !saved || saved.status !== "ARCHIVED") showCommandResult(result.ok ? { ok: false, error: "verify" } : result, "");
    else banner = { kind: "ok", text: `${saved.programName} is archived. Its history is still on the workbook.` };
    paint();
  };
  armWrite(write, "Google will ask for permission to edit this workbook.");
}

function splitResetSelection(raw: string): { testId: string; phase?: string } {
  if (raw === "ALL") return { testId: "ALL" };
  const [testId, phase] = raw.split("|");
  return phase ? { testId, phase: phaseOf(phase) } : { testId };
}

function resultFingerprint(rows: DashboardSnapshot["results"]): string {
  return rows
    .map((row) => [row.timestamp, row.username, row.testId, phaseOf(row.phase), row.scoreNum, row.scoreDen, row.submissionId].join("|"))
    .join("\n");
}

async function importRoster(rows: RosterImportRow[]): Promise<void> {
  if (refuseDemo() || !snap || !rows.length) return;
  const write = async () => {
    confirmDialog({
      title: "Add students to the shared bank?",
      body: [
        `${rows.length} new usernames`,
        rows.map((row) => `${row.username}${row.email ? ` <${row.email}>` : ""}`).join("\n"),
        "",
        "Existing accounts are not changed. Passwords stay as typed and are not shown again here.",
        "This does not enroll them in a program.",
      ].join("\n"),
      confirmLabel: "Add students",
      onConfirm: () => {
        void (async () => {
          const added: string[] = [];
          const size = 80;
          for (let i = 0; i < rows.length; i += size) {
            const chunk = rows.slice(i, i + size);
            const result = await postInstructorCommand("import_students", {
              students: chunk.map((row) => ({ username: row.username, email: row.email, password: row.password })),
            }, crypto.randomUUID());
            if (!result.ok) {
              showCommandResult(result, "");
              await refreshLive(true);
              paint();
              return;
            }
            const names = (result.result?.added as string[] | undefined) || chunk.map((row) => row.username);
            added.push(...names);
          }
          const next = await refreshLive(true);
          const missing = rows.filter((row) => !next?.students.some((student) => student.username === row.username));
          if (missing.length) {
            banner = {
              kind: "err",
              text: `Import did not verify ${missing.map((row) => row.username).join(", ")}. Do not import those usernames again until the Students tab is checked.`,
            };
          } else {
            banner = { kind: "ok", text: `Added ${added.length} students to the shared bank. Enroll them from Edit assignments.` };
          }
          paint();
        })();
      },
    });
  };
  armWrite(write, "Google will ask for permission to edit this workbook.");
}

async function resetCycle(username: string, selection: string): Promise<void> {
  if (refuseDemo() || !snap) return;
  const book = snap;
  const programId = selectedProgramId;
  const parsed = splitResetSelection(selection);
  const user = username.trim().toLowerCase();
  const enabled = book.programTests.filter((test) => test.programId === programId && test.enabled);
  const plan = planCycleReset({
    programId,
    username: user,
    testId: parsed.testId,
    phase: parsed.phase,
    state: book.programState,
    enabledTestIds: [...new Set(enabled.map((test) => test.testId))],
    attempts: book.attempts,
    actor: account || "instructor",
    nowHst: new Date().toISOString(),
  });
  if (plan.blocking.length) {
    banner = { kind: "err", text: plan.blocking[0] };
    paint();
    return;
  }
  const targets = book.programState.filter((row) => {
    if (row.programId !== programId || row.username !== user) return false;
    if (parsed.testId !== "ALL" && row.testId !== parsed.testId) return false;
    if (parsed.phase && phaseOf(row.phase) !== parsed.phase) return false;
    if (parsed.testId === "ALL" && enabled.length && !enabled.some((test) => test.testId === row.testId && phaseOf(test.phase) === phaseOf(row.phase))) return false;
    return true;
  });
  if (!targets.length) {
    banner = { kind: "err", text: "That student has no allowance row for this assessment. Nothing was reset." };
    paint();
    return;
  }
  const payload = parsed.testId === "ALL"
    ? {
        programId,
        username: user,
        testId: "ALL",
        targets: targets.map((row) => ({ testId: row.testId, phase: phaseOf(row.phase), expectedCycle: row.cycle })),
      }
    : {
        programId,
        username: user,
        testId: parsed.testId,
        phase: phaseOf(parsed.phase || targets[0].phase),
        expectedCycle: targets[0].cycle,
      };
  const write = async () => {
    confirmDialog({
      title: "Reset allowance?",
      body: plan.summary,
      confirmLabel: "Reset",
      onConfirm: () => {
        void (async () => {
          const beforeState = book.programState;
          const beforeResults = resultFingerprint(book.results);
          const result = await postInstructorCommand("reset_cycle", payload, crypto.randomUUID());
          const next = await refreshLive(true);
          const failed = targets.filter((before) => {
            const after = next?.programState.find((row) =>
              row.programId === programId &&
              row.username === user &&
              row.testId === before.testId &&
              phaseOf(row.phase) === phaseOf(before.phase));
            return !after || after.cycle !== before.cycle + 1 || after.sitCache !== 0;
          });
          const otherChanged = beforeState.some((before) => {
            if (before.programId === programId && before.username === user && targets.some((row) => row.testId === before.testId && phaseOf(row.phase) === phaseOf(before.phase))) return false;
            const after = next?.programState.find((row) =>
              row.programId === before.programId &&
              row.username === before.username &&
              row.testId === before.testId &&
              phaseOf(row.phase) === phaseOf(before.phase) &&
              row.cycle === before.cycle);
            return !after;
          });
          const historyChanged = !next || resultFingerprint(next.results) !== beforeResults;
          if (!result.ok || failed.length || otherChanged || historyChanged) {
            showCommandResult(result.ok ? { ok: false, error: "verify" } : result, "");
            if (result.ok) banner = { kind: "err", text: "Reset did not verify. Other programs and historical results must stay unchanged. Do not reset again until ProgramStudentState is checked." };
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
  if (refuseDemo() || !snap) return;
  const current = snap.programTests.find((test) => test.rowNumber === preview.rowNumber);
  if (!current) {
    banner = { kind: "err", text: "That release is not on this workbook." };
    paint();
    return;
  }
  const beforeAttempts = snap.attempts
    .filter((attempt) => attempt.programId === current.programId && attempt.testId === current.testId && phaseOf(attempt.phase) === phaseOf(current.phase))
    .map((attempt) => `${attempt.submissionId || attempt.rowNumber}:${attempt.timeLimitSec}`);
  const write = async () => {
    const result = await postInstructorCommand("save_release", {
      programId: preview.before[0],
      testId: preview.before[1],
      phase: phaseOf(current.phase),
      expected: {
        manual: preview.before[4],
        openAt: preview.before[5],
        closeAt: preview.before[6],
        maxTries: preview.before[7],
        timeLimitSec: preview.before[8],
      },
      manual: preview.after[4],
      openAt: preview.after[5],
      closeAt: preview.after[6],
      maxTries: Number(preview.after[7]),
      timeLimitSec: Number(preview.after[8]),
    }, crypto.randomUUID());
    const next = await refreshLive(true);
    const saved = next?.programTests.find((test) =>
      test.programId === current.programId &&
      test.testId === current.testId &&
      phaseOf(test.phase) === phaseOf(current.phase));
    const policyOk = !!saved &&
      saved.manual === preview.after[4] &&
      saved.openAt === preview.after[5] &&
      saved.closeAt === preview.after[6] &&
      String(saved.maxTries) === String(preview.after[7]) &&
      String(saved.timeLimitSec) === String(preview.after[8]);
    const attemptsOk = (next?.attempts || [])
      .filter((attempt) => attempt.programId === current.programId && attempt.testId === current.testId && phaseOf(attempt.phase) === phaseOf(current.phase))
      .map((attempt) => `${attempt.submissionId || attempt.rowNumber}:${attempt.timeLimitSec}`)
      .join("\n") === beforeAttempts.join("\n");
    if (!result.ok || !policyOk || !attemptsOk) showCommandResult(result.ok ? { ok: false, error: "verify" } : result, "");
    else banner = { kind: "ok", text: "Release saved. An attempt already in progress keeps its own timer and tries." };
    paint();
  };
  armWrite(write, "Google will ask for permission to edit this workbook.");
}

async function saveAssignments(): Promise<void> {
  if (!snap || !wizard || wizard.mode !== "edit") return;
  const draft = { ...wizard.draft, nowHst: new Date().toISOString(), actor: account || "instructor" };
  const program = snap.programs.find((item) => item.programId === draft.programId);
  if (!program) {
    banner = { kind: "err", text: "That program is not on this workbook." };
    paint();
    return;
  }
  const config = planProgramConfigUpdate(program, draft);
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
  const write = async () => {
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
        "The quiz service checks the live rows and writes them together. History is kept.",
      ].join("\n"),
      confirmLabel: "Save",
      onConfirm: () => {
        void (async () => {
          const result = await postInstructorCommand("save_assignments", {
            programId: draft.programId,
            expectedStatus: program.status,
            program: {
              programName: draft.programName.trim(),
              status: draft.status,
              startAt: draft.startAt,
              endAt: draft.endAt,
            },
            students: draft.usernames.map((username) => ({ username })),
            tests: draft.tests.map((test) => ({
              testId: test.testId,
              phase: phaseOf(test.phase),
              sortOrder: test.sortOrder,
              manual: test.manual,
              openAt: test.openAt,
              closeAt: test.closeAt,
              maxTries: test.maxTries,
              timeLimitSec: minutesToSeconds(test.timeLimitMinutes),
            })),
          }, crypto.randomUUID());
          const next = await refreshLive(true);
          const members = (next?.programStudents || [])
            .filter((row) => row.programId === draft.programId && row.active)
            .map((row) => row.username)
            .sort();
          const wantedMembers = [...draft.usernames].map((username) => username.trim().toLowerCase()).sort();
          const enabled = (next?.programTests || []).filter((row) => row.programId === draft.programId && row.enabled);
          const testsOk = enabled.length === draft.tests.length && draft.tests.every((test) => {
            const row = enabled.find((item) => item.testId === test.testId && phaseOf(item.phase) === phaseOf(test.phase));
            return !!row &&
              row.manual === test.manual &&
              row.maxTries === test.maxTries &&
              row.timeLimitSec === minutesToSeconds(test.timeLimitMinutes) &&
              row.openAt === test.openAt &&
              row.closeAt === test.closeAt;
          });
          const savedProgram = next?.programs.find((item) => item.programId === draft.programId);
          const programOk = !!savedProgram &&
            savedProgram.programName === draft.programName.trim() &&
            savedProgram.status === draft.status &&
            savedProgram.startAt === draft.startAt &&
            savedProgram.endAt === draft.endAt;
          if (!result.ok || members.join("\n") !== wantedMembers.join("\n") || !testsOk || !programOk) {
            showCommandResult(result.ok ? { ok: false, error: "verify" } : result, "");
          } else {
            screen = "programs";
            wizard = null;
            banner = { kind: "ok", text: `Assignments saved for ${draft.programName}. ${members.length} students and ${enabled.length} tests verified.` };
          }
          paint();
        })();
      },
    });
  };
  armWrite(write, "Google will ask for permission to edit this workbook.");
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

async function refreshLive(keepBanner = false): Promise<DashboardSnapshot | null> {
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
    if (!keepBanner) {
      banner = {
        kind: snap.programTablesPresent ? "ok" : "warn",
        text: snap.programTablesPresent
          ? `Live workbook loaded: ${snap.students.length} students.`
          : "Live workbook loaded. Program tabs are missing — use Initialize Program Launcher, then Seed Hōkūlani. Do not run setup().",
      };
    }
  } catch (err) {
    const code = (err as { code?: ErrorCode }).code || "network";
    banner = { kind: "err", text: instructorMessage(code) };
    paint();
    return null;
  }
  if (!keepBanner) paint();
  return snap;
}

paint();
