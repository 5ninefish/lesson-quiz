import { infoDialog } from "./dialogs";
import { el } from "./dom";

export type HelpTopic =
  | "start"
  | "programs"
  | "overview"
  | "roster"
  | "releases"
  | "attempts"
  | "results"
  | "missing"
  | "health"
  | "wizard";

const HELP: Record<HelpTopic, { title: string; body: string }> = {
  start: {
    title: "Instructor cheat sheet",
    body: [
      "Sign in with UH Google",
      "Use the UH account that can open the shared workbook. Google’s wording looks like all of Drive. This page only loads that one workbook. The login is kept in this browser tab and disappears if you reload the browser.",
      "",
      "Load demo workbook",
      "Fake students, for showing the screens. Not a real cohort.",
      "",
      "Refresh",
      "Reloads the sheet and keeps you signed in. Do not reload the whole browser tab unless you mean to sign out.",
      "",
      "Enable editing",
      "A second Google prompt. Only editors of the workbook should click it, and only when you are about to change something.",
      "",
      "Program menu at the top",
      "The rest of the pages (Roster, Releases, Results, Missing tests) show the program selected here.",
      "",
      "What you can do",
      "See who is missing a test, open or close a test, copy a student link, and edit who is in a program and which tests that program uses.",
      "",
      "Workbook",
      "Programs has the link to the master spreadsheet and how to add people and passwords there.",
    ].join("\n"),
  },
  programs: {
    title: "Programs",
    body: [
      "Hōkūlani is the whole program. Each card here is a cohort inside it, for example Hōkūlani Fall Interns. Everyone in a cohort gets the same tests.",
      "",
      "Open dashboard — switch Roster, Releases, Results, and Missing tests to this cohort.",
      "Copy student link — send this. It does not include a password.",
      "Edit assignments — change who is in this cohort and which tests it uses. It does not create a new cohort.",
      "Create program — add a cohort, such as Hōkūlani Fall Interns. Do this only when you mean a new cohort.",
      "Archive — hide it. Records stay. You cannot reuse the same program id.",
      "",
      "You cannot give one student a different test list from everyone else in the same cohort. Put them in another cohort if they need a different set.",
    ].join("\n"),
  },
  overview: {
    title: "Overview",
    body: [
      "Counts for the program selected at the top.",
      "",
      "Students — people in this program.",
      "Assessments — tests turned on for this program.",
      "Complete results — finished sits, not the highest-score view.",
      "Active attempts — someone started and has not finished.",
      "Missing rows — students who still owe at least one assigned test.",
      "",
      "Click a card to open that page.",
    ].join("\n"),
  },
  roster: {
    title: "Roster",
    body: [
      "People in the selected cohort.",
      "",
      "Assigned tests is a dropdown so the row stays short. Open it to see each test. Choosing a test opens the student link in a new tab. It does not change who is assigned.",
      "",
      "Every student in the cohort has the same tests. To add or remove a person, or turn a test on or off, use Programs → Edit assignments.",
      "",
      "This page does not add accounts. On the Students tab, Username is the login. Email is the column next to it. Password is the one you assigned. Then add them here with Edit assignments.",
    ].join("\n"),
  },
  releases: {
    title: "Releases",
    body: [
      "Whether students can start each test in this cohort.",
      "",
      "Open now — students can start.",
      "Close now — students cannot start.",
      "Schedule window — open and close at the times you type.",
      "Set attempts — how many tries in this round. A whole number, at least 1.",
      "Set time limit — minutes. 0 means no timer.",
      "Return to legacy default — back to “not forced.” If nothing else is set, the test stays open.",
      "",
      "L1 is Soil, L2 is Coral, L3 is Computer Science, L4 is Astronomy, L5 is Health, L6 is Digital Media. On the sheet, hover L1–L6 for the full title.",
      "",
      "If the buttons are grey, click Enable editing first. You will be asked to confirm before anything is written.",
    ].join("\n"),
  },
  attempts: {
    title: "Attempts",
    body: [
      "Someone has started a test and has not finished, or the sit already closed.",
      "",
      "In flight — still going.",
      "Time left — countdown for this sit. No time limit means it stays open until they submit, even overnight. Time is up means the clock finished. The row stays until they submit or open that test again.",
      "Expired — the timer ran out on screen. The sheet still has the row.",
      "Done — they submitted.",
      "",
      "This is not the score list. Scores are on Results.",
    ].join("\n"),
  },
  results: {
    title: "Results",
    body: [
      "One row per student and test: their highest finished score, written as 5/5. Click the score to see which questions were right and which were wrong on that sit.",
      "",
      "When — date and time of that best sit.",
      "Complete sits — how many finished attempts they have. Only the best is shown.",
      "Cycle — which round of tries this was. It goes up when someone grants another set of attempts. Old scores stay on the sheet.",
      "",
      "Students never see this page or their scores.",
    ].join("\n"),
  },
  missing: {
    title: "Missing tests",
    body: [
      "Students in this cohort who have not finished every assigned test.",
      "",
      "A test counts as done only when every answer was filled in. A partial sit does not count.",
      "",
      "Click a test name to open the student link.",
      "Compose — writes an email you can copy or open in your mail app. It does not send. The message has no due date.",
    ].join("\n"),
  },
  health: {
    title: "Data Health",
    body: [
      "Problems in the workbook, such as a duplicate name or a bad date.",
      "",
      "Read this before you trust a number that looks wrong. There is no “fix everything” button.",
      "",
      "Do not run setup() on the live student workbook. That closes tests.",
    ].join("\n"),
  },
  wizard: {
    title: "Edit assignments / create a cohort",
    body: [
      "Five steps. Name the cohort, not the whole program. Example: Hōkūlani Fall Interns. Hōkūlani is the program.",
      "",
      "1. Name. The short id cannot be changed later. Use something like hokulani-fall-interns.",
      "2. Check the students who belong in this cohort. Search stays put while you type.",
      "3. Check the tests. L1, L2, L3… are the lesson codes, sitting between the box and the title. L1 is Soil, L2 Coral, L3 Computer Science, L4 Astronomy, L5 Health, L6 Digital Media.",
      "4. For each test: open, closed, or a window; max attempts; timer in minutes.",
      "5. Read the changes, then Save assignments (existing cohort) or Launch (new cohort).",
      "",
      "Saving writes the live student workbook. It asks you to confirm first.",
    ].join("\n"),
  },
};

export const SPREADSHEET_GUIDE = [
  "Students tab — Username is what they type to log in. Email is the next column, for contacting them. Password is the password you assigned; leave it as you typed it. Do not paste over the L1–L6 columns.",
  "L1–L6 are lesson codes, not the program name. Hover the header for the full title: L1 Soil, L2 Coral, L3 Computer Science, L4 Astronomy, L5 Health, L6 Digital Media. CycleL1–CycleL6 are the same lessons. The number goes up when you grant another round of tries.",
  "After the person exists on Students, come back here and Edit assignments on the cohort so they are included.",
  "Questions tab — the shared question bank. Do not change an answer key unless you mean to change the test.",
  "Do not run setup(). It closes tests.",
].join("\n\n");

export function openHelp(topic: HelpTopic): void {
  const item = HELP[topic];
  infoDialog(item.title, item.body);
}

export function pageHeading(parent: HTMLElement, title: string, topic: HelpTopic): void {
  const row = el("div", { class: "page-head" });
  row.append(el("h1", {}, title));
  const btn = el("button", { type: "button", class: "help-btn" }, "How to use this");
  btn.onclick = () => openHelp(topic);
  row.append(btn);
  parent.append(row);
}
