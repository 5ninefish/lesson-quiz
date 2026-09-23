/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { renderShell, resetChromeForTests } from "./shell";
import { observedWorkbook } from "../fixtures/observed";
import { buildSnapshot } from "../workbook/snapshot";

function opts(over: Partial<Parameters<typeof renderShell>[0]> = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  resetChromeForTests();
  const snap = buildSnapshot(observedWorkbook());
  const o = {
    snap,
    screen: "roster" as const,
    bookName: "demo",
    account: "demo",
    canEdit: false,
    banner: null,
    query: "",
    onNav: () => {},
    onRefresh: () => {},
    onDemo: () => {},
    onSignIn: () => {},
    onSignOut: () => {},
    onSearch: () => {},
    writeEnabled: false,
    selectedProgramId: "hokulani",
    wizard: null,
    onSelectProgram: () => {},
    onWizardChange: () => {},
    onEditAssignments: () => {},
    onLaunch: () => {},
    onEnableEditing: () => {},
    onInitTables: () => {},
    onSeedHokulani: () => {},
    onArchive: () => {},
    onDuplicate: () => {},
    ...over,
  };
  renderShell(o);
  return o;
}

afterEach(() => {
  resetChromeForTests();
  document.body.innerHTML = "";
});

describe("search input", () => {
  it("keeps the same input node after typing two characters", () => {
    const state = { q: "" };
    opts({
      onSearch: (q) => {
        state.q = q;
      },
    });
    const input = document.getElementById("instructor-search") as HTMLInputElement;
    input.focus();
    input.value = "s";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const afterOne = document.getElementById("instructor-search");
    expect(afterOne).toBe(input);
    expect(document.activeElement).toBe(input);
    input.value = "st";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.getElementById("instructor-search")).toBe(input);
    expect(state.q).toBe("st");
  });

  it("opens a cheat sheet", () => {
    opts({ screen: "roster" });
    (document.getElementById("btn-cheat-sheet") as HTMLButtonElement).click();
    expect(document.getElementById("dialog-overlay")?.textContent || "").toMatch(/Sign in with UH Google/);
    expect(document.getElementById("dialog-overlay")?.textContent || "").not.toMatch(/Who this is for/);
    (document.querySelector("main .help-btn") as HTMLButtonElement).click();
    expect(document.getElementById("dialog-overlay")?.textContent || "").toMatch(/Assigned tests/);
    (document.querySelector("#dialog-overlay button") as HTMLButtonElement).click();
  });

  it("keeps the demo button for staff walkthrough", () => {
    opts({ snap: null, screen: "programs", account: "" });
    expect(document.getElementById("btn-demo")).toBeTruthy();
    expect((document.getElementById("btn-signin") as HTMLButtonElement).style.display).not.toBe("none");
  });

  it("hides sign in after a Google login", () => {
    opts({ account: "UH Google", canEdit: true, screen: "programs" });
    expect((document.getElementById("btn-signin") as HTMLButtonElement).style.display).toBe("none");
    expect((document.getElementById("btn-signout") as HTMLButtonElement).style.display).not.toBe("none");
  });

  it("does not render a separate best-complete-scores section", () => {
    opts({ screen: "results" });
    expect(document.body.textContent || "").not.toMatch(/Best complete scores/i);
  });

  it("results shows only the highest complete score per student and test", () => {
    opts({ screen: "results" });
    const body = document.querySelector("main")?.textContent || "";
    expect(body).toMatch(/Highest score/);
    expect(body).toMatch(/When/);
    expect(body).toMatch(/5\/5/);
    expect(body).not.toMatch(/4\/5/);
  });

  it("roster shows assigned tests in a dropdown, not a crowded line", () => {
    opts({ screen: "roster" });
    const headers = [...document.querySelectorAll("main th")].map((h) => h.textContent);
    expect(headers).toEqual(["Student", "Assigned tests"]);
    const select = document.querySelector("main select") as HTMLSelectElement | null;
    expect(select).toBeTruthy();
    expect([...select!.options].some((o) => /Soil/.test(o.text))).toBe(true);
    expect(document.querySelector("main")?.textContent || "").not.toMatch(/Missing tests/);
  });

  it("renders program cards and missing-test links", () => {
    opts({ screen: "programs" });
    expect(document.body.textContent || "").toMatch(/Summer 2026/);
    expect(document.querySelector("main a")?.getAttribute("href") || "").toMatch(/docs.google.com\/spreadsheets/);
    expect(document.body.textContent || "").toMatch(/Hōkūlani Fall Interns/);
    expect(document.body.textContent || "").toMatch(/Hash new passwords/);
    opts({ screen: "missing", selectedProgramId: "hokulani" });
    const links = document.querySelectorAll("main a[href*='program=hokulani']");
    expect(links.length).toBeGreaterThan(0);
    expect([...links].every((a) => !a.getAttribute("href")?.includes("username="))).toBe(true);
  });

  it("opens the student email dialog with the required sentence and no date", () => {
    opts({ screen: "missing", selectedProgramId: "hokulani" });
    const compose = document.querySelector("main button");
    const emailBtn = [...document.querySelectorAll("main button")].find((b) => b.textContent === "Compose");
    expect(emailBtn).toBeTruthy();
    (emailBtn as HTMLButtonElement).click();
    const body = (document.getElementById("email-body") as HTMLTextAreaElement | null)?.value || "";
    expect(body).toContain("Please complete these assessments this week.");
    expect(body).not.toMatch(/\b20\d{2}-\d{2}-\d{2}\b/);
    expect(document.getElementById("dialog-overlay")).toBeTruthy();
    void compose;
  });
});
