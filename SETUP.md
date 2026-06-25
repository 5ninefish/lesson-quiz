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

### Step 3: Run the one-time setup

1. In the function dropdown at the top, select **`setup`**
2. Click **Run**
3. When prompted, click **Review permissions → Allow**
4. A popup will confirm setup is complete

   This will:
   - Add L1–L6 try-count columns to your Students tab
   - Hash all the plaintext passwords (column B becomes 64-char hashes)
   - Create a **Results** tab
   - Create a **Questions** tab with headers

### Step 4: Fill in the Questions tab

The Questions tab needs one row per question. Column layout:

| Lesson | Q# | Question | A | B | C | D | E | F | Correct |
|--------|----|----------|---|---|---|---|---|---|---------|

- **Lesson**: use `L1`, `L2`, `L3`, `L4`, `L5`, or `L6`
- **Q#**: 1–5
- **Question**: the full question text
- **A–F**: answer options (leave E and F blank for 4-option questions)
- **Correct**: the letter of the correct answer (A, B, C, D, E, or F) — **no asterisk**

**The L1 (Soil) and L2 (3D Printing & Coral) data is pre-filled in `questions-data.csv`** —
paste it into your Questions tab to get started. Fill in L3–L6 yourself.

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

Every time you change `Code.gs`, you must **Deploy → Manage deployments → Edit → New version → Deploy** to publish the update.

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

Passwords are now hashed in the sheet — students use their original plaintext
password, not the hash.

---

## Instructor Reference

### View all results
Open your Google Sheet → **Results** tab. Columns:
- Timestamp, Username, Lesson, Attempt (1 or 2), Score, then each answer

### Give a student an extra try (manual)
In the **Students** tab, find the student row and set their L1–L6 column back to 0.
Example: to give hoku003 another try on Lesson 2, set the L2 cell to 0.

### Give a student an extra try (via script)
In the Apps Script editor, run:
```js
resetTries('hoku003', 'L2')
```

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
- Check that `setup()` was run (passwords are hashed in column B)
- Confirm the Apps Script URL in `index.html` is correct
- Make sure the web app is deployed as "Anyone" (not "Anyone with Google account")

**Results aren't appearing in the sheet:**
- Check that the Results tab exists (created by `setup()`)
- Re-run the deployment (Step 5) after any code changes

**Site shows "Setup Required":**
- You haven't replaced `PASTE_YOUR_APPS_SCRIPT_URL_HERE` in `index.html`
