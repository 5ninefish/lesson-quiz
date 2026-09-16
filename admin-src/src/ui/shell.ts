import { PROGRAM } from "../config";
import { TEST_TITLES } from "../ids";
import type { DashboardSnapshot } from "../types";
import { toCsv, downloadCsv } from "../csv";

export type Screen =
  | "overview"
  | "roster"
  | "releases"
  | "attempts"
  | "results"
  | "missing"
  | "health";

type ShellOpts = {
  snap: DashboardSnapshot | null;
  screen: Screen;
  bookName: string;
  account: string;
  canEdit: boolean;
  banner: { kind: "ok" | "warn" | "err"; text: string } | null;
  query: string;
  onNav: (s: Screen) => void;
  onRefresh: () => void;
  onDemo: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onSearch: (q: string) => void;
};

let onSearchCb: (q: string) => void = () => {};
let onNavCb: (s: Screen) => void = () => {};
let onRefreshCb: () => void = () => {};
let onDemoCb: () => void = () => {};
let onSignInCb: () => void = () => {};
let onSignOutCb: () => void = () => {};
let chromeReady = false;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else node.setAttribute(k, v);
  }
  if (text != null) node.textContent = text;
  return node;
}

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

function liveQuery(fallback: string): string {
  const node = document.getElementById("instructor-search") as HTMLInputElement | null;
  return node ? node.value : fallback;
}

function setText(id: string, text: string): void {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
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
  header.append(el("div", { class: "spacer" }));
  const demo = el("button", { type: "button", id: "btn-demo" }, "Load demo workbook");
  demo.onclick = () => onDemoCb();
  const signin = el("button", { type: "button", class: "primary", id: "btn-signin" }, "Sign in with UH Google");
  signin.onclick = () => onSignInCb();
  const refresh = el("button", { type: "button", id: "btn-refresh" }, "Refresh");
  refresh.onclick = () => onRefreshCb();
  const signout = el("button", { type: "button", id: "btn-signout" }, "Sign out");
  signout.onclick = () => onSignOutCb();
  header.append(demo, signin, refresh, signout);
  app.append(header);

  const banner = el("div", { class: "banner", id: "banner" });
  app.append(banner);

  const nav = el("nav", { "aria-label": "Instructor sections", id: "nav" });
  const items: [Screen, string][] = [
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
        "Read-only. Sign in with a UH account that can open the program workbook, or load the synthetic demo. The live student quiz is unchanged.",
      ),
    );
    return;
  }

  const snap = opts.snap;
  if (exportBtn) {
    exportBtn.onclick = () => {
      const q = liveQuery(opts.query);
      if (opts.screen === "roster") {
        const rows = snap.students.filter((s) => rowMatchesQuery([s.username], q));
        downloadCsv("roster.csv", toCsv(["username", "row"], rows.map((s) => [s.username, String(s.rowNumber)])));
      } else if (opts.screen === "results") {
        const rows = snap.results.filter((r) => rowMatchesQuery([r.username, r.testId || r.rawTestId], q));
        downloadCsv(
          "results.csv",
          toCsv(
            ["username", "assessment", "score", "complete", "timestamp", "row"],
            rows.map((r) => [
              r.username,
              r.testId || r.rawTestId,
              r.scoreNum != null && r.scoreDen != null ? `${r.scoreNum}/${r.scoreDen}` : "",
              r.complete ? "yes" : "no",
              r.timestamp,
              String(r.rowNumber),
            ]),
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
    add("Parse warnings", snap.issues.length, "health");
    add("Blank students skipped", snap.skippedBlankStudents, "health");
    main.append(cards);
    main.append(el("p", { class: "muted" }, `Results parse mode: ${snap.resultsHeaderMode}`));
  } else if (opts.screen === "roster") {
    main.append(el("h1", {}, "Roster"));
    main.append(
      table(
        ["Username", "Row", "Cycles"],
        snap.students.map((s) => [s.username, String(s.rowNumber), Object.values(s.cycles).join("/")]),
        true,
      ),
    );
  } else if (opts.screen === "releases") {
    main.append(el("h1", {}, "Releases"));
    main.append(
      table(
        ["Assessment", "State", "Manual", "Window (as stored)", "Max tries", "Timer sec", "Row"],
        snap.releases.map((r) => [
          r.title,
          r.stateLabel,
          r.manual,
          `${r.openAt || "—"} → ${r.closeAt || "—"}`,
          r.maxTries == null ? "—" : String(r.maxTries),
          r.timeLimitSec == null ? "—" : String(r.timeLimitSec),
          String(r.rowNumber),
        ]),
      ),
    );
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
    main.append(
      table(
        ["Student", "Assessment", "Score", "Complete", "When", "Row"],
        snap.results.map((r) => [
          r.username,
          r.testId ? TEST_TITLES[r.testId] : r.rawTestId,
          r.scoreNum != null && r.scoreDen != null ? `${r.scoreNum}/${r.scoreDen}` : "—",
          r.complete ? "yes" : "no",
          r.timestamp,
          String(r.rowNumber),
        ]),
        true,
      ),
    );
  } else if (opts.screen === "missing") {
    main.append(el("h1", {}, "Missing tests"));
    main.append(
      table(
        ["Student", "Missing"],
        snap.missing.map((m) => [m.username, m.missing.map((id) => TEST_TITLES[id]).join("; ")]),
      ),
    );
  } else {
    main.append(el("h1", {}, "Data Health"));
    main.append(el("p", { class: "muted" }, "Diagnostic only. There is no fix-everything action."));
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

  if (!chromeReady || !document.getElementById("instructor-search")) mountChrome();

  setText("book-name", opts.bookName);
  setText("account", opts.account || "Not signed in");
  setText("role", opts.canEdit ? "Editor" : "Read only");
  setText("stamp", opts.snap ? `Refreshed ${opts.snap.fetchedAt}` : "");

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
