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
      "Who this is for",
      "Instructors only. Students take the quiz with a username and password. They never sign in with Google here.",
      "",
      "Sign in with UH Google",
      "Use the UH account that can open the shared workbook. Google’s wording looks like all of Drive. This page only loads that one workbook. The login is kept in this browser tab and disappears if you reload the browser.",
      "",
      "Load demo workbook",
      "Fake students, for showing the screens. Not the real class.",
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
      "What you still do on the Google Sheet",
      "Add a student or change a password: Students tab, or Quiz Admin → Hash new passwords. Then come back here and Edit assignments so they are in the program.",
    ].join("\n"),
  },
  programs: {
    title: "Programs",
    body: [
      "A program is one class or cohort, such as Hōkūlani. Everyone in a program gets the same tests.",
      "",
      "Open dashboard — switch Roster, Releases, Results, and Missing tests to this program.",
      "Copy student link — send this. It does not include a password.",
      "Edit assignments — change who is in this program and which tests it uses. It does not create a new program.",
      "Create program — start a different class. Do this only when you mean a new program.",
      "Archive — hide it. Records stay. You cannot reuse the same program id.",
      "",
      "You cannot give one student a different test list from everyone else in the same program. Put them in another program if they need a different set.",
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
      "People in the selected program.",
      "",
      "Assigned tests is a dropdown so the row stays short. Open it to see each test. Choosing a test opens the student link in a new tab. It does not change who is assigned.",
      "",
      "Every student in the program has the same tests. To add or remove a person, or turn a test on or off, use Programs → Edit assignments.",
      "",
      "This page does not add accounts or change passwords. Do that on the Students tab of the workbook (Quiz Admin → Hash new passwords), then add them here with Edit assignments.",
    ].join("\n"),
  },
  releases: {
    title: "Releases",
    body: [
      "Whether students can start each test in this program.",
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
      "Expired — the timer ran out on screen. The sheet still has the row.",
      "Done — they submitted.",
      "",
      "This is not the score list. Scores are on Results.",
    ].join("\n"),
  },
  results: {
    title: "Results",
    body: [
      "One row per student and test: their highest finished score, written as 5/5.",
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
      "Students in this program who have not finished every assigned test.",
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
    title: "Edit assignments / create a program",
    body: [
      "Five steps.",
      "",
      "1. Name. The short id (hokulani) cannot be changed later.",
      "2. Check the students who belong in this program. Search stays put while you type.",
      "3. Check the tests. L1, L2, L3… are the lesson codes, sitting between the box and the title. L1 is Soil, L2 Coral, L3 Computer Science, L4 Astronomy, L5 Health, L6 Digital Media.",
      "4. For each test: open, closed, or a window; max attempts; timer in minutes.",
      "5. Read the changes, then Save assignments (existing program) or Launch (new program).",
      "",
      "Saving writes the workbook copy you are signed into. It asks you to confirm first.",
    ].join("\n"),
  },
};

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
