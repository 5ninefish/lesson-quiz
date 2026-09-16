import { PROGRAM } from "../config";
import { TEST_TITLES, type TestId } from "../ids";
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
    tr.hidden = Boolean(q) && !hay.includes(q);
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

function searchBar(query: string, onSearch: (q: string) => void): HTMLInputElement {
  const search = el("input", {
    type: "search",
    id: "instructor-search",
    placeholder: "Search username",
  }) as HTMLInputElement;
  search.value = query;
  search.oninput = () => {
    onSearch(search.value);
    applyFilter(search.value);
  };
  return search;
}

export function renderShell(opts: {
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
}): void {
  const root = document.getElementById("app");
  if (!root) return;
  root.innerHTML = "";
  const app = el("div", { class: "app" });
  const header = el("header");
  header.append(el("div", { class: "brand" }, PROGRAM.title));
  header.append(el("div", { class: "meta" }, opts.bookName));
  header.append(el("div", { class: "meta" }, opts.account || "Not signed in"));
  header.append(el("div", { class: "meta" }, opts.canEdit ? "Editor" : "Read only"));
  if (opts.snap) header.append(el("div", { class: "meta" }, `Refreshed ${opts.snap.fetchedAt}`));
  header.append(el("div", { class: "spacer" }));
  const demo = el("button", {}, "Load demo workbook");
  demo.onclick = opts.onDemo;
  const signin = el("button", { class: "primary" }, "Sign in with UH Google");
  signin.onclick = opts.onSignIn;
  const refresh = el("button", {}, "Refresh");
  refresh.onclick = opts.onRefresh;
  const signout = el("button", {}, "Sign out");
  signout.onclick = opts.onSignOut;
  header.append(demo, signin, refresh, signout);
  app.append(header);

  const banner = el("div", { class: `banner ${opts.banner ? "show " + opts.banner.kind : ""}` }, opts.banner?.text || "");
  app.append(banner);

  const nav = el("nav", { "aria-label": "Instructor sections" });
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
    const b = el("button", id === opts.screen ? { "aria-current": "page" } : {}, label);
    b.onclick = () => opts.onNav(id);
    nav.append(b);
  }
  app.append(nav);

  const main = el("main");
  if (!opts.snap) {
    main.append(el("h1", {}, "Instructor dashboard"));
    main.append(
      el(
        "p",
        { class: "muted" },
        "Read-only. Sign in with a UH account that can open the program workbook, or load the synthetic demo. The live student quiz is unchanged.",
      ),
    );
    app.append(main);
    root.append(app);
    return;
  }

  const snap = opts.snap;
  if (opts.screen === "overview") {
    main.append(el("h1", {}, "Overview"));
    const cards = el("div", { class: "cards" });
    const add = (label: string, n: number, screen: Screen) => {
      const c = el("button", { class: "card" });
      c.append(el("strong", {}, String(n)));
      c.append(el("span", {}, label));
      c.onclick = () => opts.onNav(screen);
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
    const bar = el("div", { class: "toolbar" });
    const search = searchBar(opts.query, opts.onSearch);
    const exp = el("button", {}, "Export CSV");
    exp.onclick = () => {
      const rows = snap.students.filter((s) => rowMatchesQuery([s.username], liveQuery(opts.query)));
      downloadCsv(
        "roster.csv",
        toCsv(
          ["username", "row"],
          rows.map((s) => [s.username, String(s.rowNumber)]),
        ),
      );
    };
    bar.append(search, exp);
    main.append(bar);
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
    const bar = el("div", { class: "toolbar" });
    const search = searchBar(opts.query, opts.onSearch);
    const exp = el("button", {}, "Export CSV");
    exp.onclick = () => {
      const rows = snap.results.filter((r) => rowMatchesQuery([r.username, r.testId || r.rawTestId], liveQuery(opts.query)));
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
    };
    bar.append(search, exp);
    main.append(bar);
    main.append(el("h2", {}, "Best complete scores"));
    main.append(
      table(
        ["Student", "Assessment", "Best", "Complete sits"],
        snap.bestScores.map((b) => [
          b.username,
          TEST_TITLES[b.testId as TestId],
          `${b.scoreNum}/${b.scoreDen}`,
          String(b.completeCount),
        ]),
      ),
    );
    main.append(el("h2", {}, "All results"));
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
  app.append(main);
  root.append(app);
  applyFilter(opts.query);
}
