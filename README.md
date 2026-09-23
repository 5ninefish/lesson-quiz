# Lesson Post-Test Quiz

A lightweight student quiz system: Google Sheets as the database, Google Apps Script as the backend, GitHub Pages as the frontend. No server to manage, no monthly fees.

Students log in, select a lesson, answer multiple-choice questions, and get immediate feedback. Scores and try counts write back to the Google Sheet automatically.

## How it works

```
Student browser (GitHub Pages)
        │  HTTPS POST
        ▼
Google Apps Script (Web App)
        │  read/write
        ▼
Google Sheet (one bound workbook per program)
  ├── Students   (email, assigned password, L1–L6 sit cache, CycleL1–CycleL6)
  ├── Questions  (canonical TestId, stems, choices, Correct — keys stay here)
  ├── Releases   (open/close window, max tries, time limit)
  ├── Attempts   (server submissionId, in_flight clock, snapshots)
  └── Results    (attempt ledger: Cycle, LifetimeSeq, SubmissionId)
```

**Key behaviors:**
- Passwords are the ones you assign. They stay readable in the Students tab.
- Each student gets a configurable max number of attempts per lesson (default: 2)
- Optional countdown timer per quiz
- Scores write back to the Sheet in real time; the teacher sees results immediately

## Setup (~30 minutes)

### Step 1 — Copy the Google Sheet

Make a copy of the [template sheet](#) (or create your own with the schema below).

**Students tab** columns: `Username | Password | L1_tries | L2_tries | ...`

**Questions tab** columns: `Lesson | Question | A | B | C | D | Answer`

### Step 2 — Deploy the Apps Script backend

1. Open your Sheet → **Extensions → Apps Script**
2. Paste `Code.gs`, click **Save**
3. In the function dropdown, select `setup` → **Run** (grants permissions)
4. **Deploy → New deployment → Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployment URL

### Step 3 — Configure the frontend

Edit `index.html` — find the `CONFIG` block near the top:

```js
const API_URL   = 'YOUR_APPS_SCRIPT_DEPLOYMENT_URL';
const LESSONS   = ['L1', 'L2', 'L3'];
const LESSON_NAMES = {
  L1: 'Lesson 1 – Topic Name',
  L2: 'Lesson 2 – Topic Name',
  L3: 'Lesson 3 – Topic Name',
};
```

### Step 4 — Publish the frontend

Push to a GitHub repo and enable **GitHub Pages** (Settings → Pages → main branch). Done.

## Customizing

**Add lessons:** add a column to the Students sheet, add rows to the Questions sheet with the new lesson ID, update `LESSONS` and `LESSON_NAMES` in `index.html`.

**Change attempt limit / timer:** Quiz Admin → Set attempts / Set time limit (Releases row). `MAX_TRIES` and `QUIZ_TIME_SECONDS` in `Code.gs` are fallbacks only when a Releases row is missing.

**Add students:** add rows to the Students sheet with the password you assigned. Leave that cell as you typed it.

## Files

| File | Purpose |
|---|---|
| `Code.gs` | Apps Script backend — auth, question delivery, score submission, Quiz Admin |
| `Dashboard.html` | Legacy Apps Script HTML copy. Prefer `admin.html`. |
| `admin.html` | Instructor dashboard on GitHub Pages. Google sign-in; editors only. Sheet stays the database. |
| `index.html` | Single-page quiz frontend (vanilla JS, no dependencies) |
| `questions-data.csv` | Sample questions (import into the Questions tab) |
| `SETUP.md` | Extended setup walkthrough |

## Stack

- **Backend:** Google Apps Script (serverless, free tier is plenty for a classroom)
- **Database:** Google Sheets (teachers already know how to read it)
- **Frontend:** Vanilla HTML/CSS/JS, single file, no build step
- **Hosting:** GitHub Pages (free)
