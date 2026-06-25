// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Your Google Sheet ID (from the URL between /d/ and /edit)
const SHEET_ID = '1wFjzB6PgjhZjHWBcgLLVOa1TtBvaEDqoV8PGFYoX3EI';
const MAX_TRIES = 2;

// Lesson IDs — must match values in the Questions sheet "Lesson" column
// Update LESSON_NAMES to show friendly names in the UI
const LESSONS     = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
const LESSON_NAMES = {
  L1: 'Lesson 1 – Soil',
  L2: 'Lesson 2 – 3D Printing & Coral',
  L3: 'Lesson 3',
  L4: 'Lesson 4',
  L5: 'Lesson 5',
  L6: 'Lesson 6',
};

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action, username, password, lesson, answers } = body;

    if (action === 'auth_and_load') return authAndLoad(username, password, lesson);
    if (action === 'submit')        return submit(username, password, lesson, answers);
    if (action === 'lesson_list')   return lessonList();

    return respond({ error: 'unknown_action' });
  } catch (err) {
    return respond({ error: err.toString() });
  }
}

// Also handle GET for health check
function doGet() {
  return respond({ ok: true, service: 'lesson-quiz' });
}

// ─── HANDLERS ────────────────────────────────────────────────────────────────

// Called when a student selects a lesson and clicks "Start Test"
// Returns the questions (without correct answers) if auth + try-count pass
function authAndLoad(username, password, lesson) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const studentsData = ss.getSheetByName('Students').getDataRange().getValues();

  const student = findStudent(studentsData, username, password);
  if (!student) return respond({ error: 'invalid_credentials' });

  const li = LESSONS.indexOf(lesson);
  if (li < 0) return respond({ error: 'invalid_lesson' });

  const tries = Number(student.row[2 + li]) || 0;
  if (tries >= MAX_TRIES) {
    return respond({ error: 'max_attempts_reached', tries });
  }

  const questions = loadQuestions(ss, lesson);
  if (questions.length === 0) return respond({ error: 'no_questions_found' });

  return respond({ ok: true, tries, questions, lessonName: LESSON_NAMES[lesson] || lesson });
}

// Called when a student submits their answers
function submit(username, password, lesson, answers) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const studentsSheet = ss.getSheetByName('Students');
  const studentsData  = studentsSheet.getDataRange().getValues();

  const student = findStudent(studentsData, username, password);
  if (!student) return respond({ error: 'invalid_credentials' });

  const li    = LESSONS.indexOf(lesson);
  const tries = Number(student.row[2 + li]) || 0;
  if (tries >= MAX_TRIES) return respond({ error: 'max_attempts_reached' });

  // Grade answers
  const questionsData = ss.getSheetByName('Questions').getDataRange().getValues();
  let score = 0;
  const graded     = [];
  const answerLog  = [];

  for (let i = 1; i < questionsData.length; i++) {
    const row = questionsData[i];
    if (String(row[0]) !== lesson) continue;

    const qNum    = Number(row[1]);
    const correct = String(row[9]).trim().toUpperCase();  // Column J = Correct
    const given   = String(answers[qNum] || '').trim().toUpperCase();
    const isRight = given === correct;

    if (isRight) score++;
    answerLog.push(given);

    graded.push({ qNum, given, correct, isRight });
  }

  const total      = graded.length;
  const attemptNum = tries + 1;
  const isLastTry  = attemptNum >= MAX_TRIES;

  // Write to Results tab
  ss.getSheetByName('Results').appendRow([
    new Date().toISOString(),
    username,
    lesson,
    attemptNum,
    score + '/' + total,
    ...answerLog,
  ]);

  // Increment try count in Students tab
  studentsSheet.getRange(student.sheetRow, 3 + li).setValue(attemptNum);

  // Only reveal correct answers on the final attempt
  const returnGraded = graded.map(g => ({
    qNum:    g.qNum,
    given:   g.given,
    isRight: g.isRight,
    correct: isLastTry ? g.correct : undefined,  // hidden on first attempt
  }));

  return respond({ ok: true, score, total, attempt: attemptNum, isLastTry, graded: returnGraded });
}

// Returns lesson list with try counts for the logged-in student
function lessonList() {
  // This action is called by the lesson-select screen after login
  // (username/password are re-sent with this request too, via auth_and_load flow)
  // For simplicity the frontend calls auth_and_load per lesson button click.
  return respond({ lessons: LESSONS, names: LESSON_NAMES });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function hashPassword(plain) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(plain)
  );
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

// Finds a student row by username+password. Returns {row, sheetRow} or null.
// Caches the entire sheet in memory (one read) to avoid rate-limit issues at peak.
function findStudent(data, username, password) {
  const hash = hashPassword(password);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === username && String(data[i][1]) === hash) {
      return { row: data[i], sheetRow: i + 1 };
    }
  }
  return null;
}

// Loads questions for a lesson WITHOUT the correct answer column
function loadQuestions(ss, lesson) {
  const data = ss.getSheetByName('Questions').getDataRange().getValues();
  const out  = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== lesson) continue;
    // Columns: Lesson(0) | Q#(1) | Question(2) | A(3) B(4) C(5) D(6) E(7) F(8) | Correct(9)
    const opts = [data[i][3], data[i][4], data[i][5], data[i][6], data[i][7], data[i][8]]
      .map(String)
      .filter(s => s.trim() !== '');
    out.push({ num: data[i][1], question: data[i][2], options: opts });
    // correct answer (data[i][9]) intentionally NOT included
  }
  return out;
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── ONE-TIME SETUP  (run from Apps Script editor, not via web) ───────────────

/**
 * Run this ONCE to:
 *  1. Add L1–L6 try-count columns to the Students tab
 *  2. Hash all plaintext passwords in the Students tab
 *  3. Create the Results tab with headers
 *  4. Create the Questions tab with headers
 */
function setup() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  // ── Students tab ──────────────────────────────────────────────────────────
  const students = ss.getSheetByName('Students');
  const headerRow = students.getRange(1, 1, 1, 8).getValues()[0];
  if (headerRow[2] !== 'L1') {
    students.getRange(1, 3, 1, 6).setValues([['L1','L2','L3','L4','L5','L6']]);
    const numStudents = students.getLastRow() - 1;
    if (numStudents > 0) {
      const zeros = Array.from({ length: numStudents }, () => [0,0,0,0,0,0]);
      students.getRange(2, 3, numStudents, 6).setValues(zeros);
    }
    Logger.log('Students tab: added L1–L6 columns');
  }

  // ── Hash passwords ─────────────────────────────────────────────────────────
  bulkHashPasswords_();

  // ── Results tab ───────────────────────────────────────────────────────────
  if (!ss.getSheetByName('Results')) {
    const r = ss.insertSheet('Results');
    r.getRange(1, 1, 1, 10).setValues([[
      'Timestamp','Username','Lesson','Attempt','Score','Q1','Q2','Q3','Q4','Q5'
    ]]);
    r.setFrozenRows(1);
    Logger.log('Results tab created');
  }

  // ── Questions tab ─────────────────────────────────────────────────────────
  if (!ss.getSheetByName('Questions')) {
    const q = ss.insertSheet('Questions');
    q.getRange(1, 1, 1, 10).setValues([[
      'Lesson','Q#','Question','A','B','C','D','E','F','Correct'
    ]]);
    q.setFrozenRows(1);
    Logger.log('Questions tab created — fill in your questions!');
  }

  SpreadsheetApp.getUi().alert(
    '✅ Setup complete!\n\n' +
    '• Students tab: L1–L6 columns added, passwords hashed\n' +
    '• Results tab: created\n' +
    '• Questions tab: created\n\n' +
    'Next: fill in the Questions tab (see SETUP.md for format).'
  );
}

/**
 * Hashes any un-hashed passwords in column B of the Students tab.
 * Safe to run multiple times — already-hashed values (64-char hex) are skipped.
 */
function bulkHashPasswords_() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Students');
  const data  = sheet.getDataRange().getValues();
  let count   = 0;
  for (let i = 1; i < data.length; i++) {
    const val = String(data[i][1]);
    const alreadyHashed = val.length === 64 && /^[0-9a-f]+$/.test(val);
    if (!alreadyHashed && val.trim() !== '') {
      sheet.getRange(i + 1, 2).setValue(hashPassword(val));
      count++;
    }
  }
  Logger.log('Hashed ' + count + ' passwords');
}

/**
 * INSTRUCTOR TOOL: Reset a student's try count for a specific lesson.
 * Call from the Script Editor when a student needs an extra attempt.
 * Example: resetTries('hoku003', 'L2')
 */
function resetTries(username, lesson) {
  const ss      = SpreadsheetApp.openById(SHEET_ID);
  const sheet   = ss.getSheetByName('Students');
  const data    = sheet.getDataRange().getValues();
  const li      = LESSONS.indexOf(lesson);
  if (li < 0) { Logger.log('Invalid lesson: ' + lesson); return; }
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === username) {
      sheet.getRange(i + 1, 3 + li).setValue(0);
      Logger.log('Reset ' + username + ' tries for ' + lesson);
      return;
    }
  }
  Logger.log('Student not found: ' + username);
}
