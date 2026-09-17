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

  it("keeps the demo button for staff walkthrough", () => {
    opts({ snap: null, screen: "programs" });
    expect(document.getElementById("btn-demo")).toBeTruthy();
  });

  it("does not render best complete scores", () => {
    opts({ screen: "results" });
    expect(document.body.textContent || "").not.toMatch(/Best complete scores/i);
  });

  it("roster shows assigned tests, not missing tests or sheet cycles", () => {
    opts({ screen: "roster" });
    const headers = [...document.querySelectorAll("main th")].map((h) => h.textContent);
    expect(headers).toEqual(["Student", "Assigned tests"]);
    expect(document.querySelector("main")?.textContent || "").toMatch(/Soil/);
    expect(document.querySelector("main")?.textContent || "").not.toMatch(/Missing tests/);
  });

  it("renders program cards and missing-test links", () => {
    opts({ screen: "programs" });
    expect(document.body.textContent || "").toMatch(/Summer 2026/);
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
