import { PROGRAM } from "../config";
import { TEST_TITLES } from "../ids";
import { bestCompleteScores, formatScore } from "../reports/best-scores";
import { phaseOf } from "../programs/ids";
import { filterSnapshot } from "../programs/summaries";
import type { DashboardSnapshot, LaunchPlan, MutationPreview } from "../types";
import { toCsv, downloadCsv } from "../csv";
import { el } from "./dom";
import { openHelp, pageHeading } from "./help";
import { renderPrograms } from "./programs";
import { renderLessons, type LessonDraft } from "./lessons";
import { renderOverview } from "./overview";
import { emptyWizard, renderWizard, type WizardState } from "./program-wizard";
import { pageOf, parseRosterPaste, type RosterImportRow } from "../programs/roster-import";
import { studentTestUrl } from "../programs/urls";
import { renderReleases } from "./releases";
import { renderMissing } from "./missing";
import { warnIfBrowserRefreshSignedOut } from "./relogin-warning";
import { attemptDeadlineMs, formatClock, timeLeftText } from "../workbook/attempts";
import { reviewSit } from "../reports/item-review";
import { scoreDialog } from "./dialogs";

export type Screen =
  | "overview"
  | "programs"
  | "wizard"
  | "roster"
  | "releases"
  | "attempts"
  | "results"
  | "missing"
  | "health"
  | "lessons";

export type ShellOpts = {
  snap: DashboardSnapshot | null;
  screen: Screen;
  bookName: string;
  account: string;
  canEdit: boolean;
  writeEnabled: boolean;
  selectedProgramId: string;
  wizard: WizardState | null;
  banner: { kind: "ok" | "warn" | "err"; text: string } | null;
  query: string;
  onNav: (s: Screen) => void;
  onRefresh: () => void;
  onDemo: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onSearch: (q: string) => void;
  onSelectProgram: (id: string) => void;
  onWizardChange: (w: WizardState) => void;
  onEditAssignments: (programId: string) => void;
  onLaunch: (plan: LaunchPlan) => void;
  onApplyRelease: (preview: MutationPreview) => void;
  onEnableEditing: () => void;
  onInitTables: () => void;
  onSeedHokulani: () => void;
  onArchive: (id: string) => void;
  onDuplicate: (id: string) => void;
  onImportRoster: (rows: RosterImportRow[]) => void;
  onResetCycle: (username: string, testId: string) => void;
  onSaveLessons: (programId: string, lessons: LessonDraft[]) => void;
  onRegisterLessons: () => void;
};

let onSearchCb: (q: string) => void = () => {};
let onNavCb: (s: Screen) => void = () => {};
let onRefreshCb: () => void = () => {};
let onDemoCb: () => void = () => {};
let onSignInCb: () => void = () => {};
let onSignOutCb: () => void = () => {};
let onSelectProgramCb: (id: string) => void = () => {};
let onWizardChangeCb: (w: WizardState) => void = () => {};
let onEditAssignmentsCb: (programId: string) => void = () => {};
let onLaunchCb: (plan: LaunchPlan) => void = () => {};
let onApplyReleaseCb: (preview: MutationPreview) => void = () => {};
let onEnableEditingCb: () => void = () => {};
let onInitTablesCb: () => void = () => {};
let onSeedHokulaniCb: () => void = () => {};
let onArchiveCb: (id: string) => void = () => {};
let onDuplicateCb: (id: string) => void = () => {};
let onImportRosterCb: (rows: RosterImportRow[]) => void = () => {};
let onResetCycleCb: (username: string, testId: string) => void = () => {};
let onSaveLessonsCb: (programId: string, lessons: LessonDraft[]) => void = () => {};
let onRegisterLessonsCb: () => void = () => {};
let chromeReady = false;
let rosterPage = 1;
let rosterQuery = "";
const ROSTER_PAGE = 20;

export function rowMatchesQuery(cells: string[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return cells.some((c) => c.toLowerCase().includes(q));
}

function applyFilter(query: string): void {
  const q = query.trim().toLowerCase();
  document.querySelectorAll<HTMLTableRowElement>("[data-filterable] tbody tr").forEach((tr) => {
    const hay = tr.dataset.search || "";
    tr.style.display = q && !hay.includes(q) ? "none" : "";
  });
}

function table(headers: string[], rows: string[][], filterable = false): HTMLElement {
  const wrap = el("div", { class: "table-wrap" });
  if (filterable) wrap.setAttribute("data-filterable", "true");
  const t = el("table");
  const thead = el("thead");
  const tr = el("tr");
  for (const h of headers) tr.append(el("th", {}, h));
  thead.append(tr);
  const tb = el("tbody");
  for (const row of rows) {
    const r = el("tr");
    if (filterable) r.dataset.search = row.join(" ").toLowerCase();
    for (const c of row) r.append(el("td", {}, c));
    tb.append(r);
  }
  t.append(thead, tb);
  wrap.append(t);
  return wrap;
}

function assignedTests(snap: DashboardSnapshot) {
  return snap.releases.map((r) => ({ id: r.testId, title: r.title })).filter((t) => t.title);
}

function assignedTestLabel(snap: DashboardSnapshot): string {
  return assignedTests(snap)
    .map((t) => t.title)
    .join("; ");
}

function renderRoster(
  main: HTMLElement,
  snap: DashboardSnapshot,
  programId: string,
  query: string,
  bank: DashboardSnapshot["students"],
): void {
  pageHeading(main, "Roster", "roster");
  main.append(el("p", { class: "muted" }, "Open the list to see each test. Choosing one opens the student link. It does not change assignments. Add people to the shared bank here, then put them in a program with Edit assignments."));
  const names = new Map(snap.programs.map((program) => [program.programId, program.programName || program.programId]));
  const activeByStudent = new Map<string, string[]>();
  for (const row of snap.programStudents) {
    if (!row.active || !row.username) continue;
    const list = activeByStudent.get(row.username) || [];
    if (!list.includes(row.programId)) list.push(row.programId);
    activeByStudent.set(row.username, list);
  }
  const overlaps = [...activeByStudent.entries()].filter(([, ids]) => ids.length > 1);
  if (overlaps.length) {
    const note = el("div", { class: "callout" });
    note.append(el("strong", {}, "More than one active program"));
    note.append(
      el(
        "p",
        {},
        overlaps
          .map(([username, ids]) => `${username}: ${ids.map((id) => names.get(id) || id).join(", ")}`)
          .join(" · ") + ". Leave one active assignment for each student. Do not delete the historical rows.",
      ),
    );
    main.append(note);
  }
  const wrap = el("div", { class: "table-wrap" });
  wrap.setAttribute("data-filterable", "true");
  const t = el("table");
  const thead = el("thead");
  const hr = el("tr");
  hr.append(el("th", {}, "Username"), el("th", {}, "Email"), el("th", {}, "Assigned tests"));
  thead.append(hr);
  const tb = el("tbody");
  const tests = assignedTests(snap);
  const q = query.trim().toLowerCase();
  if (q !== rosterQuery) {
    rosterQuery = q;
    rosterPage = 1;
  }
  const matched = snap.students.filter((s) => !q || `${s.username} ${s.email}`.includes(q));
  const paged = pageOf(matched, rosterPage, ROSTER_PAGE);
  rosterPage = paged.page;
  for (const s of paged.rows) {
    const tr = el("tr");
    tr.dataset.search = `${s.username} ${tests.map((x) => x.title).join(" ")}`.toLowerCase();
    tr.append(el("td", {}, s.username));
    tr.append(el("td", {}, s.email || "—"));
    const td = el("td");
    const sel = el("select", { "aria-label": `Assigned tests for ${s.username}` }) as HTMLSelectElement;
    sel.append(new Option(tests.length ? `${tests.length} assigned tests` : "No tests assigned", ""));
    for (const test of tests) {
      sel.append(new Option(test.title, test.id));
    }
    sel.onchange = () => {
      if (!sel.value) return;
      window.open(studentTestUrl(programId, sel.value), "_blank", "noopener");
      sel.selectedIndex = 0;
    };
    td.append(sel);
    tr.append(td);
    tb.append(tr);
  }
  t.append(thead, tb);
  wrap.append(t);
  main.append(wrap);
  const pager = el("div", { class: "toolbar" });
  const prev = el("button", { type: "button" }, "Previous");
  const next = el("button", { type: "button" }, "Next");
  prev.disabled = paged.page <= 1;
  next.disabled = paged.page >= paged.pages;
  prev.onclick = () => {
    rosterPage = paged.page - 1;
    onNavCb("roster");
  };
  next.onclick = () => {
    rosterPage = paged.page + 1;
    onNavCb("roster");
  };
  pager.append(prev, el("span", {}, `Page ${paged.page} of ${paged.pages} · ${matched.length} students`), next);
  main.append(pager);

  const add = el("section", { class: "release-card" });
  add.append(el("h2", {}, "Add students"));
  add.append(el("p", { class: "muted" }, "One person per line: username, email, password. Email can be blank. This does not change existing accounts."));
  const box = el("textarea", { id: "roster-import", rows: "5" }) as HTMLTextAreaElement;
  box.placeholder = "ada, ada@example.edu, assigned-password";
  const preview = el("div", { id: "roster-import-preview" });
  let ready: RosterImportRow[] = [];
  const previewBtn = el("button", { type: "button" }, "Preview import");
  previewBtn.onclick = () => {
    const parsed = parseRosterPaste(box.value, bank.map((s) => s.username));
    ready = parsed.accepted;
    const lines = [
      `Accepted ${parsed.accepted.length}: ${parsed.accepted.map((r) => `${r.username}${r.email ? ` <${r.email}>` : ""}`).join(", ") || "none"}`,
      `Duplicates ${parsed.duplicates.length}: ${parsed.duplicates.map((d) => d.username).join(", ") || "none"}`,
      `Rejected ${parsed.rejected.length}: ${parsed.rejected.map((r) => `line ${r.line} ${r.reason}`).join("; ") || "none"}`,
    ];
    preview.replaceChildren(...lines.map((line) => el("p", {}, line)));
    saveBtn.disabled = ready.length === 0;
  };
  const saveBtn = el("button", { type: "button", class: "primary" }, "Add accepted students");
  saveBtn.disabled = true;
  saveBtn.onclick = () => {
    if (!ready.length) return;
    onImportRosterCb(ready);
  };
  const tools = el("div", { class: "toolbar" });
  tools.append(previewBtn, saveBtn);
  add.append(box, tools, preview);
  main.append(add);
}

function liveQuery(fallback: string): string {
  const node = document.getElementById("instructor-search") as HTMLInputElement | null;
  return node ? node.value : fallback;
}

function setText(id: string, text: string): void {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function setShown(id: string, show: boolean): void {
  const node = document.getElementById(id);
  if (node) node.style.display = show ? "" : "none";
}

function mountChrome(): void {
  const root = document.getElementById("app");
  if (!root) return;
  root.replaceChildren();
  const app = el("div", { class: "app" });

  const header = el("header");
  const brandRow = el("div", { class: "brand-row" });
  const brand = el("div", { class: "brand", id: "brand" });
  brand.append(document.createTextNode("Hōkūlani"));
  brand.append(el("small", {}, "LEARN · EXPLORE · CREATE"));
  brandRow.append(brand);
  const context = el("div", { class: "context" });
  const prog = el("label", { id: "program-picker-wrap" }, "Program");
  const sel = el("select", { id: "program-picker" }) as HTMLSelectElement;
  sel.onchange = () => onSelectProgramCb(sel.value);
  prog.append(sel);
  const person = el("div", { class: "person" });
  person.append(el("span", { id: "account" }, "Not signed in"));
  person.append(el("small", { id: "role" }, "Read only"));
  context.append(prog, person);
  brandRow.append(context);
  const ops = el("div", { class: "ops" });
  const cheat = el("button", { type: "button", id: "btn-cheat-sheet", class: "help-btn" }, "Cheat sheet");
  cheat.onclick = () => openHelp("start");
  const demo = el("button", { type: "button", id: "btn-demo" }, "Load demo workbook");
  demo.onclick = () => onDemoCb();
  const signin = el("button", { type: "button", class: "primary", id: "btn-signin" }, "Sign in with UH Google");
  signin.onclick = () => onSignInCb();
  const refresh = el("button", { type: "button", id: "btn-refresh" }, "Refresh");
  refresh.onclick = () => onRefreshCb();
  const signout = el("button", { type: "button", id: "btn-signout" }, "Sign out");
  signout.onclick = () => onSignOutCb();
  const edit = el("button", { type: "button", id: "btn-enable-editing" }, "Enable editing");
  edit.onclick = () => onEnableEditingCb();
  ops.append(cheat, demo, signin, refresh, edit, signout);
  header.append(brandRow, ops);
  app.append(header);

  const banner = el("div", { class: "banner", id: "banner" });
  app.append(banner);

  const layout = el("div", { class: "layout" });
  const nav = el("nav", { "aria-label": "Instructor sections", id: "nav" });
  const items: [Screen, string][] = [
    ["programs", "Programs"],
    ["overview", "Overview"],
    ["roster", "Roster"],
    ["lessons", "Lessons & tests"],
    ["releases", "Releases"],
    ["attempts", "Attempts"],
    ["results", "Results"],
    ["missing", "Missing work"],
    ["health", "Data Health"],
  ];
  for (const [id, label] of items) {
    const b = el("button", { type: "button", "data-screen": id }, label);
    b.onclick = () => onNavCb(id);
    nav.append(b);
  }
  const column = el("div", { class: "column" });
  const toolbar = el("div", { class: "toolbar", id: "search-toolbar" });
  const search = el("input", {
    type: "text",
    id: "instructor-search",
    name: "instructor-search",
    placeholder: "Search username",
    autocomplete: "off",
    autocorrect: "off",
    autocapitalize: "off",
    spellcheck: "false",
    inputmode: "search",
  }) as HTMLInputElement;
  search.addEventListener("input", () => {
    onSearchCb(search.value);
    const onRoster = document.querySelector('#nav button[aria-current="page"]')?.getAttribute("data-screen") === "roster";
    if (onRoster) onNavCb("roster");
    else applyFilter(search.value);
  });
  const exp = el("button", { type: "button", id: "btn-export" }, "Export CSV");
  toolbar.append(search, exp);
  column.append(toolbar, el("main", { id: "main" }));
  layout.append(nav, column);
  app.append(layout);
  const footer = el("footer", { class: "app-footer" });
  footer.append(el("span", { id: "book-name" }, ""));
  footer.append(el("span", {}, "Instructor portal"));
  footer.append(el("span", { id: "stamp" }, ""));
  app.append(footer);
  root.append(app);
  chromeReady = true;
}

let attemptClock: ReturnType<typeof setInterval> | null = null;

function stopAttemptClock(): void {
  if (attemptClock) clearInterval(attemptClock);
  attemptClock = null;
}

function paintTimeLeft(node: HTMLElement, now = new Date()): void {
  const deadline = Number(node.dataset.deadline || "");
  if (!deadline) {
    node.textContent = node.dataset.fallback || "No time limit";
    node.classList.remove("up");
    return;
  }
  const left = Math.floor((deadline - now.getTime()) / 1000);
  if (left <= 0) {
    node.textContent = "Time is up";
    node.classList.add("up");
    return;
  }
  node.classList.remove("up");
  node.textContent = formatClock(left);
}

function startAttemptClock(root: ParentNode): void {
  stopAttemptClock();
  const nodes = [...root.querySelectorAll<HTMLElement>("[data-time-left]")];
  if (!nodes.some((n) => n.dataset.deadline)) return;
  const tick = () => nodes.forEach((n) => paintTimeLeft(n));
  tick();
  attemptClock = setInterval(tick, 1000);
}

function renderMain(opts: ShellOpts): void {
  stopAttemptClock();
  const main = document.getElementById("main");
  const toolbar = document.getElementById("search-toolbar");
  const exportBtn = document.getElementById("btn-export") as HTMLButtonElement | null;
  if (!main) return;
  main.replaceChildren();
  const showSearch = opts.screen === "roster" || opts.screen === "results";
  if (toolbar) toolbar.style.display = showSearch && opts.snap ? "flex" : "none";

  if (!opts.snap) {
    pageHeading(main, "Instructor dashboard", "start");
    main.append(
      el(
        "p",
        { class: "muted" },
        "Sign in with a UH account that can open the program workbook, or load the demo to walk staff through the dashboard. The live student quiz is unchanged.",
      ),
    );
    return;
  }

  const scoped =
    opts.snap.programTablesPresent && opts.selectedProgramId && opts.screen !== "programs" && opts.screen !== "wizard"
      ? filterSnapshot(opts.snap, opts.selectedProgramId)
      : opts.snap;
  const snap = scoped;
  if (exportBtn) {
    exportBtn.onclick = () => {
      const q = liveQuery(opts.query);
      if (opts.screen === "roster") {
        const assigned = assignedTestLabel(snap);
        const rows = snap.students.filter((s) => rowMatchesQuery([s.username], q));
        downloadCsv(
          "roster.csv",
          toCsv(
            ["username", "email", "assigned_tests"],
            rows.map((s) => [s.username, s.email, assigned]),
          ),
        );
      } else if (opts.screen === "results") {
        const rows = bestCompleteScores(snap.results, snap.questionCounts).filter((r) =>
          rowMatchesQuery([r.username, r.testId], q),
        );
        downloadCsv(
          "results.csv",
          toCsv(
            ["username", "assessment", "phase", "highest_score", "when", "sits", "cycle"],
            rows.map((r) => [
              r.username,
              phaseOf(r.phase) === "SINGLE" ? TEST_TITLES[r.testId] : `${TEST_TITLES[r.testId]} (${phaseOf(r.phase)})`,
              phaseOf(r.phase),
              formatScore(r.scoreNum, r.scoreDen),
              r.timestamp,
              String(r.completeCount),
              r.cycle == null ? "" : String(r.cycle),
            ]),
          ),
        );
      }
    };
  }

  if (opts.screen === "overview") {
    renderOverview(
      main,
      snap,
      opts.selectedProgramId || PROGRAM.legacyDefaultProgramId,
      () => onNavCb("missing"),
      () => onNavCb("health"),
      () => onNavCb("overview"),
    );
  } else if (opts.screen === "roster") {
    renderRoster(main, snap, opts.selectedProgramId || PROGRAM.legacyDefaultProgramId, opts.query, opts.snap.students);
  } else if (opts.screen === "programs") {
    renderPrograms(main, opts.snap, opts.selectedProgramId, {
      canEdit: opts.canEdit,
      writeEnabled: opts.writeEnabled,
      signedIn: Boolean(opts.account) && opts.account !== "demo",
      onOpen: (id) => {
        onSelectProgramCb(id);
        onNavCb("overview");
      },
      onWizard: () => onNavCb("wizard"),
      onEdit: (id) => onEditAssignmentsCb(id),
      onLessons: (id) => {
        onSelectProgramCb(id);
        onNavCb("lessons");
      },
      onArchive: (id) => onArchiveCb(id),
      onDuplicate: (id) => onDuplicateCb(id),
      onInit: () => onInitTablesCb(),
      onSeed: () => onSeedHokulaniCb(),
    });
  } else if (opts.screen === "wizard") {
    renderWizard(
      main,
      opts.snap,
      opts.wizard || emptyWizard(),
      (w) => onWizardChangeCb(w),
      () => onNavCb("programs"),
      (plan) => onLaunchCb(plan),
    );
  } else if (opts.screen === "lessons") {
    renderLessons(
      main,
      snap,
      opts.selectedProgramId || PROGRAM.legacyDefaultProgramId,
      opts.writeEnabled,
      (id, lessons) => onSaveLessonsCb(id, lessons),
      () => onRegisterLessonsCb(),
    );
  } else if (opts.screen === "releases") {
    renderReleases(
      main,
      snap,
      opts.selectedProgramId || PROGRAM.legacyDefaultProgramId,
      opts.writeEnabled,
      opts.account || "instructor",
      (preview) => onApplyReleaseCb(preview),
    );
  } else if (opts.screen === "attempts") {
    pageHeading(main, "Attempts", "attempts");
    main.append(
      el(
        "p",
        { class: "muted" },
        "Time left counts down from when they started. No time limit means the sit stays open until they submit. Time is up means the clock finished; the row stays until they submit or open that test again.",
      ),
    );
    const wrap = el("div", { class: "table-wrap" });
    const t = el("table");
    const thead = el("thead");
    const hr = el("tr");
    for (const h of ["Student", "Assessment", "Status", "Time left", "Started"]) {
      hr.append(el("th", {}, h));
    }
    thead.append(hr);
    const tb = el("tbody");
    for (const a of snap.attempts) {
      const r = el("tr");
      const deadline = attemptDeadlineMs(a.startedAt, a.timeLimitSec);
      const timeCell = el("td", { class: "time-left" });
      timeCell.dataset.timeLeft = "1";
      timeCell.dataset.fallback = timeLeftText(a);
      if (deadline && a.displayStatus === "in_flight") timeCell.dataset.deadline = String(deadline);
      timeCell.textContent = timeLeftText(a);
      if (timeCell.textContent === "Time is up") timeCell.classList.add("up");
      r.append(
        el("td", {}, a.username),
        el("td", {}, a.testId
          ? (phaseOf(a.phase) === "SINGLE" ? TEST_TITLES[a.testId] : `${TEST_TITLES[a.testId]} (${phaseOf(a.phase)})`)
          : a.rawTestId),
        el("td", {}, a.displayStatus),
        timeCell,
        el("td", {}, a.startedAt),
      );
      tb.append(r);
    }
    t.append(thead, tb);
    wrap.append(t);
    main.append(wrap);
    startAttemptClock(main);
    const reset = el("section", { class: "release-card" });
    reset.append(el("h2", {}, "Reset allowance"));
    reset.append(
      el(
        "p",
        { class: "muted" },
        "Starts a new cycle for this student in the selected program only. Earlier attempts stay on the sheet. Another program is left alone.",
      ),
    );
    const studentSel = el("select", { id: "reset-student", "aria-label": "Student to reset" }) as HTMLSelectElement;
    studentSel.append(new Option("Choose a student", ""));
    for (const s of snap.students) studentSel.append(new Option(s.username, s.username));
    const testSel = el("select", { id: "reset-test", "aria-label": "Assessment to reset" }) as HTMLSelectElement;
    testSel.append(new Option("All enabled assessments", "ALL"));
    const programTests = snap.programTests.filter((test) => test.programId === opts.selectedProgramId && test.enabled);
    if (programTests.length) {
      for (const test of programTests) {
        const phase = phaseOf(test.phase);
        const label = phase === "SINGLE" ? TEST_TITLES[test.testId] : `${TEST_TITLES[test.testId]} (${phase})`;
        testSel.append(new Option(label, `${test.testId}|${phase}`));
      }
    } else {
      for (const test of snap.releases) testSel.append(new Option(test.title, test.testId));
    }
    const resetBtn = el("button", { type: "button" }, "Reset allowance");
    resetBtn.onclick = () => onResetCycleCb(studentSel.value, testSel.value);
    const resetTools = el("div", { class: "toolbar" });
    resetTools.append(studentSel, testSel, resetBtn);
    reset.append(resetTools);
    main.append(reset);
  } else if (opts.screen === "results") {
    pageHeading(main, "Results", "results");
    main.append(
      el(
        "p",
        { class: "muted" },
        "One row per student and test: the highest complete score. Click the score to see which questions were right and wrong on that sit.",
      ),
    );
    const scores = bestCompleteScores(snap.results, snap.questionCounts);
    const wrap = el("div", { class: "table-wrap" });
    wrap.setAttribute("data-filterable", "true");
    const t = el("table");
    const thead = el("thead");
    const hr = el("tr");
    for (const h of ["Student", "Assessment", "Highest score", "When", "Complete sits", "Cycle"]) {
      hr.append(el("th", {}, h));
    }
    thead.append(hr);
    const tb = el("tbody");
    for (const r of scores) {
      const tr = el("tr");
      tr.dataset.search = [r.username, r.testId, TEST_TITLES[r.testId]].join(" ").toLowerCase();
      const scoreBtn = el("button", { type: "button", class: "score-link" }, formatScore(r.scoreNum, r.scoreDen));
      scoreBtn.onclick = () => {
        const attempt = snap.attempts.find((item) => r.submissionId && item.submissionId === r.submissionId);
        const pinned = attempt?.pinnedKey;
        const items = reviewSit(
          snap.questions.filter((q) => q.testId === r.testId),
          r.answers,
          pinned,
        );
        const note = pinned?.length ? "" : " Current question bank; this older sit has no pinned key.";
        const phase = phaseOf(r.phase);
        const name = phase === "SINGLE" ? TEST_TITLES[r.testId] : `${TEST_TITLES[r.testId]} (${phase})`;
        scoreDialog(`${r.username} · ${name} · ${formatScore(r.scoreNum, r.scoreDen)}.${note}`, items);
      };
      const scoreCell = el("td");
      scoreCell.append(scoreBtn);
      tr.append(
        el("td", {}, r.username),
        el("td", {}, phaseOf(r.phase) === "SINGLE" ? TEST_TITLES[r.testId] : `${TEST_TITLES[r.testId]} (${phaseOf(r.phase)})`),
        scoreCell,
        el("td", {}, r.timestamp || "—"),
        el("td", {}, String(r.completeCount)),
        el("td", {}, r.cycle == null ? "—" : String(r.cycle)),
      );
      tb.append(tr);
    }
    t.append(thead, tb);
    wrap.append(t);
    main.append(wrap);
  } else if (opts.screen === "missing") {
    const program = opts.snap.programs.find((p) => p.programId === opts.selectedProgramId);
    renderMissing(main, snap, opts.selectedProgramId || PROGRAM.legacyDefaultProgramId, program?.programName || PROGRAM.title);
  } else {
    pageHeading(main, "Data Health", "health");
    main.append(el("p", { class: "muted" }, "Diagnostic only. There is no fix-everything action."));
    main.append(
      el(
        "p",
        {},
        `Legacy Hōkūlani result attributions: ${opts.snap.legacyAttributedResults}. Results not rewritten. Program tables present: ${opts.snap.programTablesPresent ? "yes" : "no"}.`,
      ),
    );
    main.append(
      table(
        ["Severity", "Tab", "Row", "Issue"],
        snap.issues.map((i) => [i.severity, i.tab, i.rowNumber == null ? "—" : String(i.rowNumber), i.message]),
      ),
    );
  }
  applyFilter(liveQuery(opts.query));
}

export function renderShell(opts: ShellOpts): void {
  onSearchCb = opts.onSearch;
  onNavCb = opts.onNav;
  onRefreshCb = opts.onRefresh;
  onDemoCb = opts.onDemo;
  onSignInCb = opts.onSignIn;
  onSignOutCb = opts.onSignOut;
  onSelectProgramCb = opts.onSelectProgram;
  onWizardChangeCb = opts.onWizardChange;
  onEditAssignmentsCb = opts.onEditAssignments;
  onLaunchCb = opts.onLaunch;
  onApplyReleaseCb = opts.onApplyRelease;
  onEnableEditingCb = opts.onEnableEditing;
  onInitTablesCb = opts.onInitTables;
  onSeedHokulaniCb = opts.onSeedHokulani;
  onArchiveCb = opts.onArchive;
  onDuplicateCb = opts.onDuplicate;
  onImportRosterCb = opts.onImportRoster;
  onResetCycleCb = opts.onResetCycle;
  onSaveLessonsCb = opts.onSaveLessons;
  onRegisterLessonsCb = opts.onRegisterLessons;

  if (!chromeReady || !document.getElementById("instructor-search")) mountChrome();

  setText("book-name", opts.bookName);
  setText("account", opts.account || "Not signed in");
  const signedIn = Boolean(opts.account) && opts.account !== "demo";
  setText(
    "role",
    !opts.account ? "Not signed in" : opts.account === "demo" ? "Demo" : opts.writeEnabled ? "Signed in, editing on" : "Signed in",
  );
  setShown("btn-signin", !signedIn);
  setShown("btn-signout", Boolean(opts.account));
  warnIfBrowserRefreshSignedOut(opts.account);
  setShown("btn-enable-editing", signedIn && !opts.writeEnabled);
  setShown("btn-refresh", Boolean(opts.snap));
  setText("stamp", opts.snap ? `Refreshed ${opts.snap.fetchedAt}` : "");
  const picker = document.getElementById("program-picker") as HTMLSelectElement | null;
  if (picker) {
    picker.replaceChildren();
    if (opts.snap?.programs.length) {
      for (const p of opts.snap.programs) {
        const o = document.createElement("option");
        o.value = p.programId;
        o.textContent = `${p.programName} (${p.status})`;
        picker.append(o);
      }
      picker.value = opts.selectedProgramId;
      picker.disabled = false;
    } else {
      const o = document.createElement("option");
      o.value = PROGRAM.legacyDefaultProgramId;
      o.textContent = "Hōkūlani (legacy)";
      picker.append(o);
      picker.disabled = true;
    }
  }

  const banner = document.getElementById("banner");
  if (banner) {
    banner.className = `banner ${opts.banner ? "show " + opts.banner.kind : ""}`;
    banner.textContent = opts.banner?.text || "";
  }

  document.querySelectorAll<HTMLButtonElement>("#nav button[data-screen]").forEach((b) => {
    if (b.getAttribute("data-screen") === opts.screen) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });

  renderMain(opts);
}

export function resetChromeForTests(): void {
  chromeReady = false;
  stopAttemptClock();
}
