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
Google Sheet
  ├── Students tab  (username, hashed password, try counts per lesson)
  └── Questions tab (question text, choices, correct answer, lesson ID)
```

**Key behaviors:**
- Passwords are stored as SHA-256 hashes (never plaintext after setup)
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
3. In the function dropdown, select `setup` → **Run** (grants permissions + hashes passwords)
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

**Change attempt limit:** set `MAX_TRIES` in `Code.gs`.

**Add a timer:** set `QUIZ_TIME_SECONDS` in `Code.gs` (e.g. `600` = 10 minutes).

**Add students:** add rows to the Students sheet with plaintext passwords → re-run `setup()` to hash them.

## Files

| File | Purpose |
|---|---|
| `Code.gs` | Apps Script backend — auth, question delivery, score submission |
| `index.html` | Single-page quiz frontend (vanilla JS, no dependencies) |
| `questions-data.csv` | Sample questions (import into the Questions tab) |
| `SETUP.md` | Extended setup walkthrough |

## Stack

- **Backend:** Google Apps Script (serverless, free tier is plenty for a classroom)
- **Database:** Google Sheets (teachers already know how to read it)
- **Frontend:** Vanilla HTML/CSS/JS, single file, no build step
- **Hosting:** GitHub Pages (free)
