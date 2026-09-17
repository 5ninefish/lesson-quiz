import { PROGRAM } from "../config";
import { TEST_TITLES } from "../ids";
import { bestCompleteScores } from "../reports/best-scores";
import { filterSnapshot } from "../programs/summaries";
import type { DashboardSnapshot, LaunchPlan } from "../types";
import { toCsv, downloadCsv } from "../csv";
import { el } from "./dom";
import { renderPrograms } from "./programs";
import { emptyWizard, renderWizard, type WizardState } from "./program-wizard";
import { studentTestUrl } from "../programs/urls";
import { renderReleases } from "./releases";
import { renderMissing } from "./missing";

export type Screen =
  | "overview"
  | "programs"
  | "wizard"
  | "roster"
  | "releases"
  | "attempts"
  | "results"
  | "missing"
  | "health";

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
  onEnableEditing: () => void;
  onInitTables: () => void;
  onSeedHokulani: () => void;
  onArchive: (id: string) => void;
  onDuplicate: (id: string) => void;
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
let onEnableEditingCb: () => void = () => {};
let onInitTablesCb: () => void = () => {};
let onSeedHokulaniCb: () => void = () => {};
let onArchiveCb: (id: string) => void = () => {};
let onDuplicateCb: (id: string) => void = () => {};
let chromeReady = false;

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

function renderRoster(main: HTMLElement, snap: DashboardSnapshot, programId: string): void {
  main.append(el("h1", {}, "Roster"));
  main.append(el("p", { class: "muted" }, "Tests on this program. Open the list next to a student to see them without crowding the row."));
  const wrap = el("div", { class: "table-wrap" });
  wrap.setAttribute("data-filterable", "true");
  const t = el("table");
  const thead = el("thead");
  const hr = el("tr");
  hr.append(el("th", {}, "Student"), el("th", {}, "Assigned tests"));
  thead.append(hr);
  const tb = el("tbody");
  const tests = assignedTests(snap);
  for (const s of snap.students) {
    const tr = el("tr");
    tr.dataset.search = `${s.username} ${tests.map((x) => x.title).join(" ")}`.toLowerCase();
    tr.append(el("td", {}, s.username));
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
  header.append(el("div", { class: "brand", id: "brand" }, PROGRAM.title));
  header.append(el("div", { class: "meta", id: "book-name" }, ""));
  header.append(el("div", { class: "meta", id: "account" }, "Not signed in"));
  header.append(el("div", { class: "meta", id: "role" }, "Read only"));
  header.append(el("div", { class: "meta", id: "stamp" }, ""));
  const prog = el("label", { class: "meta", id: "program-picker-wrap" }, "Program ");
  const sel = el("select", { id: "program-picker" }) as HTMLSelectElement;
  sel.onchange = () => onSelectProgramCb(sel.value);
  prog.append(sel);
  header.append(prog);
  header.append(el("div", { class: "spacer" }));
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
  header.append(demo, signin, refresh, edit, signout);
  app.append(header);

  const banner = el("div", { class: "banner", id: "banner" });
  app.append(banner);

  const nav = el("nav", { "aria-label": "Instructor sections", id: "nav" });
  const items: [Screen, string][] = [
    ["programs", "Programs"],
    ["overview", "Overview"],
    ["roster", "Roster"],
    ["releases", "Releases"],
    ["attempts", "Attempts"],
    ["results", "Results"],
    ["missing", "Missing tests"],
    ["health", "Data Health"],
  ];
  for (const [id, label] of items) {
    const b = el("button", { type: "button", "data-screen": id }, label);
    b.onclick = () => onNavCb(id);
    nav.append(b);
  }
  app.append(nav);

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
    applyFilter(search.value);
  });
  const exp = el("button", { type: "button", id: "btn-export" }, "Export CSV");
  toolbar.append(search, exp);
  app.append(toolbar);

  app.append(el("main", { id: "main" }));
  root.append(app);
  chromeReady = true;
}

function renderMain(opts: ShellOpts): void {
  const main = document.getElementById("main");
  const toolbar = document.getElementById("search-toolbar");
  const exportBtn = document.getElementById("btn-export") as HTMLButtonElement | null;
  if (!main) return;
  main.replaceChildren();
  const showSearch = opts.screen === "roster" || opts.screen === "results";
  if (toolbar) toolbar.style.display = showSearch && opts.snap ? "flex" : "none";

  if (!opts.snap) {
    main.append(el("h1", {}, "Instructor dashboard"));
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
            ["username", "assigned_tests"],
            rows.map((s) => [s.username, assigned]),
          ),
        );
      } else if (opts.screen === "results") {
        const rows = bestCompleteScores(snap.results).filter((r) => rowMatchesQuery([r.username, r.testId], q));
        downloadCsv(
          "results.csv",
          toCsv(
            ["username", "assessment", "highest_score"],
            rows.map((r) => [r.username, TEST_TITLES[r.testId], `${r.scoreNum}/${r.scoreDen}`]),
          ),
        );
      }
    };
  }

  if (opts.screen === "overview") {
    main.append(el("h1", {}, "Overview"));
    const cards = el("div", { class: "cards" });
    const add = (label: string, n: number, screen: Screen) => {
      const c = el("button", { type: "button", class: "card" });
      c.append(el("strong", {}, String(n)));
      c.append(el("span", {}, label));
      c.onclick = () => onNavCb(screen);
      cards.append(c);
    };
    add("Students", snap.students.length, "roster");
    add("Assessments", snap.releases.length, "releases");
    add("Complete results", snap.results.filter((r) => r.complete).length, "results");
    add("Active attempts", snap.attempts.filter((a) => a.displayStatus === "in_flight").length, "attempts");
    add("Expired (display)", snap.attempts.filter((a) => a.displayStatus === "expired").length, "attempts");
    add("Missing rows", snap.missing.length, "missing");
    add("Parse warnings", opts.snap.issues.length, "health");
    add("Blank students skipped", snap.skippedBlankStudents, "health");
    main.append(cards);
    main.append(el("p", { class: "muted" }, `Results parse mode: ${snap.resultsHeaderMode}`));
  } else if (opts.screen === "roster") {
    renderRoster(main, snap, opts.selectedProgramId || PROGRAM.legacyDefaultProgramId);
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
  } else if (opts.screen === "releases") {
    renderReleases(main, snap, opts.selectedProgramId || PROGRAM.legacyDefaultProgramId, opts.writeEnabled, (text) => {
      const banner = document.getElementById("banner");
      if (banner) {
        banner.className = "banner show ok";
        banner.textContent = `Preview only: ${text}`;
      }
    });
  } else if (opts.screen === "attempts") {
    main.append(el("h1", {}, "Attempts"));
    main.append(
      table(
        ["Student", "Assessment", "Status", "Started", "Submission", "Row"],
        snap.attempts.map((a) => [
          a.username,
          a.testId ? TEST_TITLES[a.testId] : a.rawTestId,
          a.displayStatus,
          a.startedAt,
          a.submissionId,
          String(a.rowNumber),
        ]),
      ),
    );
  } else if (opts.screen === "results") {
    main.append(el("h1", {}, "Results"));
    main.append(el("p", { class: "muted" }, "Highest complete score for each student and test. Earlier sits are kept on the sheet but not listed here."));
    main.append(
      table(
        ["Student", "Assessment", "Highest score"],
        bestCompleteScores(snap.results).map((r) => [
          r.username,
          TEST_TITLES[r.testId],
          `${r.scoreNum}/${r.scoreDen}`,
        ]),
        true,
      ),
    );
  } else if (opts.screen === "missing") {
    const program = opts.snap.programs.find((p) => p.programId === opts.selectedProgramId);
    renderMissing(main, snap, opts.selectedProgramId || PROGRAM.legacyDefaultProgramId, program?.programName || PROGRAM.title);
  } else {
    main.append(el("h1", {}, "Data Health"));
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
  onEnableEditingCb = opts.onEnableEditing;
  onInitTablesCb = opts.onInitTables;
  onSeedHokulaniCb = opts.onSeedHokulani;
  onArchiveCb = opts.onArchive;
  onDuplicateCb = opts.onDuplicate;

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
}
