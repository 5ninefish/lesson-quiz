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

  it("does not render best complete scores", () => {
    opts({ screen: "results" });
    expect(document.body.textContent || "").not.toMatch(/Best complete scores/i);
  });
});
