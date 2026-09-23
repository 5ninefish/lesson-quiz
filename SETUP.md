# Lesson Post-Test Site — Setup Guide

Two parts: Google Apps Script (the backend) and GitHub Pages (the frontend).
Total time: ~30 minutes.

---

## Part 1 — Google Apps Script

### Step 1: Open the Script Editor

1. Open your Google Sheet
2. Click **Extensions → Apps Script**

### Step 2: Paste the code

1. Delete everything in the editor (Ctrl+A, Delete)
2. Paste the entire contents of `Code.gs` from this repo
3. Click **Save** (Ctrl+S)
4. Add the instructor dashboard file: **File → New → HTML file**, name it exactly `Dashboard` (Apps Script adds `.html`), paste `Dashboard.html` from this repo, Save.

Reopen the spreadsheet after Save so `onOpen` rebuilds the menu.

Instructor UI is **GitHub Pages** (`admin.html`), not an Apps Script popup. After the one-time Google client ID, dashboard layout changes are `git push` only. You still Deploy a new Web App version when `Code.gs` (the data API) changes.

### Step 3: Run the one-time setup

1. In the function dropdown at the top, select **`setup`**
2. Click **Run**
3. When prompted, click **Review permissions → Allow**
4. A popup will confirm setup is complete

   This will:
   - Add L1–L6 try-count columns and CycleL1–CycleL6 (default 1)
   - Leave assigned passwords readable in column B
   - Create **Results**, **Questions**, **Attempts**, **Releases**, **Audit**, **RosterImport**
   - Set spreadsheet timezone to Pacific/Honolulu
   - Seed Releases as CLOSED (use Quiz Admin to open a window)

   Bound script: uses **this** spreadsheet (`getActiveSpreadsheet`). Do not paste a Sheet ID.
   A copied workbook needs its own Deploy → Web App, then paste **that** exec URL into that program's `index.html`.

### Step 4: Fill in the Questions tab

The Questions tab needs one row per question. Column layout:

| Lesson | Q# | Question | A | B | C | D | E | F | Correct |
|--------|----|----------|---|---|---|---|---|---|---------|

- **Lesson**: canonical TestId (`SCI-SOIL`, `SCI-CORAL`, `SCI-CS`, `SCI-ASTRO`, `SCI-HEALTH`, `SCI-DM`). The API still accepts `L1`–`L6`. Do not store both L3 and SCI-CS.
- **Q#**: 1–5
- **Question**: the full question text
- **A–F**: answer options (leave E and F blank for 4-option questions)
- **Correct**: the letter of the correct answer (A, B, C, D, E, or F) — **no asterisk**

`questions-data.csv` has stems only — **no answer keys**. Paste into Questions, then fill the **Correct** column on the sheet. Keys must not live in the public repo.

### Step 5: Deploy the web app

1. Click **Deploy → New deployment**
2. Click the gear icon next to "Select type" → choose **Web app**
3. Set:
   - **Description**: Lesson Quiz
   - **Execute as**: Me
   - **Who has access**: Anyone
4. Click **Deploy**
5. **Copy the web app URL** — it looks like:
   `https://script.google.com/macros/s/AKfy.../exec`

Every time you change `Code.gs`, **Deploy → Manage deployments → Edit → New version → Deploy** on the existing student Web App (Anyone). Do not add a second deployment.

### Step 5b: Instructor dashboard (once)

Keep the student deployment as **Anyone**. Do not change it.

1. Google Cloud Console → APIs & Services → Credentials → Create **OAuth client ID** → Application type **Web application**
2. Authorized JavaScript origins: `https://5ninefish.github.io`
3. Copy the client ID (`….apps.googleusercontent.com`)
4. Sheet → **Quiz Admin → Set Google client ID…** → paste
5. Push `admin.html` to GitHub Pages (this repo)
6. Open https://5ninefish.github.io/lesson-quiz/admin.html and sign in with an account that can **edit** the workbook

Do not put the roster sheet ID in `admin.html`. Do not run `setup()` on the live Hōkūlani book during test week.

---

## Part 2 — GitHub Pages

### Step 6: Create a GitHub repo

1. Go to github.com → **New repository**
2. Name it something like `lesson-quiz` (or anything you like)
3. Set it to **Public** (required for free GitHub Pages)
4. Don't add a README — you'll push from your computer

### Step 7: Paste your Apps Script URL into index.html

Open `index.html` and find this line near the top:

```js
const API_URL = 'PASTE_YOUR_APPS_SCRIPT_URL_HERE';
```

Replace it with the URL you copied in Step 5.

### Step 8: Push to GitHub

```bash
cd /Users/dalen/Public/clients/lesson-quiz
git init
git add index.html
git commit -m "initial lesson quiz site"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/lesson-quiz.git
git push -u origin main
```

### Step 9: Enable GitHub Pages

1. On GitHub, go to your repo → **Settings → Pages**
2. Under "Branch", select **main** and **/ (root)**
3. Click **Save**

Your site will be live at:
`https://YOUR_USERNAME.github.io/lesson-quiz/`

(Takes 1–2 minutes to go live after first push.)

---

## Part 3 — Student Access

### Share with students

Send students:
- The URL: `https://YOUR_USERNAME.github.io/lesson-quiz/`
- Their username and password (from the Students tab)

---

## Instructor Reference

### View all results
Open your Google Sheet → **Results** tab. Columns:
- Timestamp, Username, Lesson, Attempt (1 or 2), Score, then each answer

### Give a student an extra try
Use **Quiz Admin → Reset student tries**. That increments `CycleL*` and zeroes the sit cache. It does **not** delete Results rows.

Do not just zero the L1–L6 cell; eligibility is counted from Results for the current cycle.

### Instructor dashboard
https://5ninefish.github.io/lesson-quiz/admin.html — full browser tab. Sign in with Google (must be able to edit the workbook). UI ships with `git push`. Data still lives in the sheet via the existing Web App.

Quiz Admin → Open dashboard is a shortcut to that URL.

### Open / close a test
Dashboard → Releases, or Quiz Admin: Open now, Close now, Set window, Set attempts, Set time limit.
Manual OPEN overrides CloseAt. Empty OpenAt + AUTO = hidden.

### Scores and reports
Students never see a score or correct answers. Scores live on the Results tab.

Quiz Admin:
- **Students in progress** — open sits and time left (also writes `InProgress` tab)
- **Best scores** — per student per test, only sits where every question was answered; uses the best of those (writes `BestScores`)
- **Missing tests** — who has not completed which tests (writes `MissingTests`)

Timer: the iPad submits whatever is filled when the clock hits 0. Status `time_expired`. If they never submit, the next Start closes that sit. A sit counts as complete only if every question has an answer.

### Add more lessons
1. Add rows to the Questions tab (use L3, L4, L5, or L6 in the Lesson column)
2. Update `LESSON_NAMES` in `Code.gs` and in `index.html` with the real lesson names
3. Re-deploy the Apps Script (Step 5 above)
4. Push the updated `index.html` to GitHub

### Update lesson names
Two places — keep them in sync:

`Code.gs` (line ~10):
```js
const LESSON_NAMES = {
  L1: 'Lesson 1 – Soil',
  L2: 'Lesson 2 – 3D Printing & Coral',
  L3: 'Lesson 3',   // ← update these
  ...
};
```

`index.html` (line ~220):
```js
const LESSON_NAMES = {
  L1: 'Lesson 1 – Soil',
  L2: 'Lesson 2 – 3D Printing & Coral',
  L3: 'Lesson 3',   // ← same update here
  ...
};
```

---

## Troubleshooting

**Students can't log in:**
- Check that the Password cell matches the password you assigned
- Confirm the Apps Script URL in `index.html` is correct
- Make sure the web app is deployed as "Anyone" (not "Anyone with Google account")

**Results aren't appearing in the sheet:**
- Check that the Results tab exists (created by `setup()`)
- Re-run the deployment (Step 5) after any code changes

**Site shows "Setup Required":**
- You haven't replaced `PASTE_YOUR_APPS_SCRIPT_URL_HERE` in `index.html`
