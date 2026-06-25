// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Your Google Sheet ID (from the URL between /d/ and /edit)
const SHEET_ID = '1wFjzB6PgjhZjHWBcgLLVOa1TtBvaEDqoV8PGFYoX3EI';
const MAX_TRIES = 2;

// Set to a positive number (seconds) to enable a countdown timer on the quiz.
// 0 = no timer.  Example: 600 = 10 minutes.
const QUIZ_TIME_SECONDS = 0;

// Lesson IDs — must match values in the Questions sheet "Lesson" column
// Update LESSON_NAMES to show friendly names in the UI
const LESSONS     = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
const LESSON_NAMES = {
  L1: 'Lesson 1 – Soil',
  L2: 'Lesson 2 – 3D Printing & Coral',
  L3: 'Lesson 3 – Computer Science',
  L4: 'Lesson 4 – Astronomy',
  L5: 'Lesson 5 – Health',
  L6: 'Lesson 6 – Digital Media',
};

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action, username, password, lesson, answers } = body;

    if (action === 'auth_and_load') return authAndLoad(username, password, lesson);
    if (action === 'submit')        return submit(username, password, lesson, answers);
    if (action === 'get_tries')     return getTries(username, password);
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
    return respond({ error: 'max_attempts_reached', tries, allTries: allTriesFor(student) });
  }

  const questions = loadQuestions(ss, lesson);
  if (questions.length === 0) return respond({ error: 'no_questions_found' });

  return respond({
    ok: true, tries, questions,
    lessonName: LESSON_NAMES[lesson] || lesson,
    allTries:   allTriesFor(student),
    timeLimit:  QUIZ_TIME_SECONDS,
  });
}

// Returns all lesson try counts for a student row
function allTriesFor(student) {
  const out = {};
  LESSONS.forEach((l, i) => { out[l] = Number(student.row[2 + i]) || 0; });
  return out;
}

// Lightweight: auth + return all try counts (called on login)
function getTries(username, password) {
  const ss   = SpreadsheetApp.openById(SHEET_ID);
  const data = ss.getSheetByName('Students').getDataRange().getValues();
  const student = findStudent(data, username, password);
  if (!student) return respond({ error: 'invalid_credentials' });
  return respond({ ok: true, allTries: allTriesFor(student), timeLimit: QUIZ_TIME_SECONDS });
}

// Called when a student submits their answers
function submit(username, password, lesson, answers) {
  // Lock prevents race conditions when many students submit simultaneously
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
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

    const qNum    = String(row[1]).trim();
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
  } finally {
    lock.releaseLock();
  }
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

// ─── CUSTOM SHEET MENU ───────────────────────────────────────────────────────

/**
 * Runs automatically when the sheet is opened.
 * Adds a "Quiz Admin" menu to the Google Sheets menu bar.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Quiz Admin')
    .addItem('Reset student tries…', 'showResetDialog')
    .addItem('View attempt summary', 'showSummary')
    .addSeparator()
    .addItem('Hash new passwords', 'bulkHashPasswords_')
    .addToUi();
}

/**
 * Shows a dialog where you can reset a student's try count for a lesson.
 */
function showResetDialog() {
  const ss      = SpreadsheetApp.openById(SHEET_ID);
  const sheet   = ss.getSheetByName('Students');
  const data    = sheet.getDataRange().getValues();
  const students = data.slice(1).map(r => r[0]).filter(u => u !== '');

  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; padding: 16px; font-size: 14px; }
      label { display: block; margin-top: 10px; font-weight: bold; }
      select { width: 100%; padding: 6px; margin-top: 4px; font-size: 14px; }
      button { margin-top: 16px; padding: 8px 20px; background: #1a73e8;
               color: white; border: none; border-radius: 4px; cursor: pointer;
               font-size: 14px; width: 100%; }
      button:hover { background: #1557b0; }
      #msg { margin-top: 12px; color: green; font-weight: bold; display: none; }
    </style>
    <label>Student:</label>
    <select id="student">
      ${students.map(u => `<option value="${u}">${u}</option>`).join('')}
    </select>
    <label>Lesson:</label>
    <select id="lesson">
      <option value="L1">L1</option>
      <option value="L2">L2</option>
      <option value="L3">L3</option>
      <option value="L4">L4</option>
      <option value="L5">L5</option>
      <option value="L6">L6</option>
      <option value="ALL">ALL lessons</option>
    </select>
    <button onclick="doReset()">Reset Tries</button>
    <div id="msg"></div>
    <script>
      function doReset() {
        const u = document.getElementById('student').value;
        const l = document.getElementById('lesson').value;
        google.script.run
          .withSuccessHandler(function(result) {
            const msg = document.getElementById('msg');
            msg.textContent = result;
            msg.style.display = 'block';
          })
          .resetTriesFromDialog(u, l);
      }
    <\/script>
  `)
  .setWidth(320)
  .setHeight(260);

  SpreadsheetApp.getUi().showModalDialog(html, 'Reset Student Tries');
}

/** Called by the reset dialog. */
function resetTriesFromDialog(username, lesson) {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Students');
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== username) continue;
    if (lesson === 'ALL') {
      sheet.getRange(i + 1, 3, 1, 6).setValues([[0, 0, 0, 0, 0, 0]]);
      return username + ': all lessons reset to 0.';
    }
    const li = LESSONS.indexOf(lesson);
    if (li < 0) return 'Invalid lesson: ' + lesson;
    sheet.getRange(i + 1, 3 + li).setValue(0);
    return username + ' / ' + lesson + ' reset to 0.';
  }
  return 'Student not found: ' + username;
}

/** Shows a color-coded attempt summary for all students. */
function showSummary() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Students');
  const data  = sheet.getDataRange().getValues();

  let rows = '';
  for (let i = 1; i < data.length; i++) {
    const u = data[i][0];
    const tries = LESSONS.map((l, li) => {
      const t = Number(data[i][2 + li]) || 0;
      const color = t >= 2 ? '#dc2626' : t === 1 ? '#d97706' : '#16a34a';
      return `<td style="text-align:center;color:${color};font-weight:bold">${t}</td>`;
    }).join('');
    rows += `<tr><td style="padding:4px 8px">${u}</td>${tries}</tr>`;
  }

  const html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: Arial, sans-serif; font-size: 13px; padding: 12px; }
      table { border-collapse: collapse; width: 100%; }
      th { background: #f1f5f9; padding: 6px 8px; text-align: center; }
      th:first-child { text-align: left; }
      tr:nth-child(even) { background: #f8fafc; }
      td { padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
      .legend { margin-top: 8px; font-size: 11px; color: #64748b; }
    </style>
    <table>
      <tr><th>Username</th>${LESSONS.map(l => `<th>${l}</th>`).join('')}</tr>
      ${rows}
    </table>
    <p class="legend">
      <span style="color:#16a34a">&#9679;</span> 0 attempts &nbsp;
      <span style="color:#d97706">&#9679;</span> 1 attempt &nbsp;
      <span style="color:#dc2626">&#9679;</span> 2 attempts (done)
    </p>
  `)
  .setWidth(500)
  .setHeight(400);

  SpreadsheetApp.getUi().showModalDialog(html, 'Attempt Summary');
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
/**
 * Clears the Questions tab and populates it with L1 (Soil) and L2 (3D Printing & Coral).
 * Run this ONCE from the Script Editor.
 * Add your L3–L6 rows manually in the Questions tab afterward.
 */
function populateQuestions() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Questions');

  // Clear everything and reset
  sheet.clearContents();

  const rows = [
    // Header
    ['Lesson','Q#','Question','A','B','C','D','E','F','Correct'],
    // ── L1: Soil ──────────────────────────────────────────────────────────
    ['L1',1,'Put the following soil types in the correct order from largest particles to smallest:',
     'Clay, human hair, sand, silt, cornstarch',
     'Sand, human hair, silt, clay, cornstarch',
     'Sand, human hair, clay, silt, cornstarch',
     'Human hair, clay, sand, silt, cornstarch','','','B'],
    ['L1',2,'Which statement is true?',
     'Water moves through sandy soil slower than silty soil.',
     'Water moves through clayey soil faster than sandy soil.',
     'Water moves through sandy soil faster than silty soil.',
     "It doesn't make a difference. Water moves through all soils at the same rate.",'','','C'],
    ['L1',3,'Which particle size is best for water-loving plants like rice, water lilies, cattails, and taro?',
     'Soil with small particle sizes, such as clay',
     'Soil with large particle sizes, such as sand',
     'A 3-to-2 mixture of large particle sizes such as sand, and small particle sizes such as clay',
     'Either small or large is good for water-loving plants','','','A'],
    ['L1',4,'Which of the following is NOT a texture of soil?',
     'Sandy','Clayey','Grainy','Sparkly','a & b','c & d','D'],
    ['L1',5,'Which texture of soil gives the longest ribbon of soil?',
     'Sandy','Silty loam','Clay loam','Clayey','','','D'],
    // ── L2: 3D Printing & Coral ───────────────────────────────────────────
    ['L2',1,'What is coral?',
     'Coral is a plant because it uses photosynthesis to grow.',
     'Coral is an animal because it does not make its own food.',
     'Coral is both an animal and a plant because of symbiosis.',
     'Coral is neither a plant nor an animal because of its unique characteristics and physical structures.',
     '','','B'],
    ['L2',2,'What scale is used to measure the acidity of a substance?',
     'pH scale','Digital scale','Interval scale','Acidic scale','','','A'],
    ['L2',3,'True or False: Usually when there is a chemical change, the process can be undone.',
     'True','False','','','','','B'],
    ['L2',4,'What process does a 3D printer use?',
     'Subtractive process','Continuous flow process','Selective process','Additive process','','','D'],
    ['L2',5,'How can 3D printed coral be helpful for the ocean?',
     'It provides much needed food for some fish.',
     '3D printed coral is bad for the ocean because it is made of plastic.',
     'Eventually with enough 3D printed coral, we will no longer need real coral.',
     'Marine life can live in the 3D printed coral.','','','D'],
    // ── L3: Computer Science ──────────────────────────────────────────────
    ['L3',1,'What is the definition of an algorithm?',
     'A command that repeats certain steps over and over',
     'A list of steps that you can follow to finish a task',
     'A device used for storing and processing data',
     'A command given as an if-then statement','','','B'],
    ['L3',2,'In computer science, what is a program?',
     'The study of computers and computing concepts, including hardware, software, networking, and the Internet',
     'A series of actions completed in a specific order',
     'A show that comes on TV',
     'An algorithm that has been coded into a computer language that can then be run by a machine','','','D'],
    ['L3',3,'True or False: If a list (or sequence) of directions is incorrect, it is still an algorithm.',
     'True','False','','','','','A'],
    // Q4 — single image-choice question
    ['L3',4,'In the image below, the Artist has a pencil and is ready to draw. Select the correct algorithm that allows the Artist to draw the diamond.<img src="https://5ninefish.github.io/lesson-quiz/images/cs_q4_diamond.png" style="max-width:140px;display:block;margin:.5rem auto .4rem">',
     'https://5ninefish.github.io/lesson-quiz/images/cs_q4_choice_a.svg',
     'https://5ninefish.github.io/lesson-quiz/images/cs_q4_choice_b.svg',
     'https://5ninefish.github.io/lesson-quiz/images/cs_q4_choice_c.svg',
     '','','','A'],
    ['L3',5,'For the code in question 4, what command could be used to shorten the repeated lines of code?',
     'Loop','Conditional statement','Set color','None of the above','','','A'],
  ];

  sheet.getRange(1, 1, rows.length, 10).setValues(rows);
  sheet.setFrozenRows(1);

  // Bold the header
  sheet.getRange(1, 1, 1, 10).setFontWeight('bold');

  Logger.log('Questions tab populated: ' + (rows.length - 1) + ' questions written.');
  SpreadsheetApp.getUi().alert(
    'Done! ' + (rows.length - 1) + ' questions written to the Questions tab.\n\n' +
    'Add L4–L6 questions directly in the Questions tab using the same format.'
  );
}

// Run this from the Apps Script editor to append only the L3 (Computer Science) questions
// without clearing existing L1/L2 questions.
function addL3Questions() {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Questions');

  // Remove any existing L3 placeholder rows first
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === 'L3') sheet.deleteRow(i + 1);
  }

  const rows = [
    ['L3',1,'What is the definition of an algorithm?',
     'A command that repeats certain steps over and over',
     'A list of steps that you can follow to finish a task',
     'A device used for storing and processing data',
     'A command given as an if-then statement','','','B'],
    ['L3',2,'In computer science, what is a program?',
     'The study of computers and computing concepts, including hardware, software, networking, and the Internet',
     'A series of actions completed in a specific order',
     'A show that comes on TV',
     'An algorithm that has been coded into a computer language that can then be run by a machine','','','D'],
    ['L3',3,'True or False: If a list (or sequence) of directions is incorrect, it is still an algorithm.',
     'True','False','','','','','A'],
    // Q4 — single image-choice question
    ['L3',4,'In the image below, the Artist has a pencil and is ready to draw. Select the correct algorithm that allows the Artist to draw the diamond.<img src="https://5ninefish.github.io/lesson-quiz/images/cs_q4_diamond.png" style="max-width:140px;display:block;margin:.5rem auto .4rem">',
     'https://5ninefish.github.io/lesson-quiz/images/cs_q4_choice_a.svg',
     'https://5ninefish.github.io/lesson-quiz/images/cs_q4_choice_b.svg',
     'https://5ninefish.github.io/lesson-quiz/images/cs_q4_choice_c.svg',
     '','','','A'],
    ['L3',5,'For the code in question 4, what command could be used to shorten the repeated lines of code?',
     'Loop','Conditional statement','Set color','None of the above','','','A'],
  ];

  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, 10).setValues(rows);
  Logger.log('L3 questions added: ' + rows.length);
  SpreadsheetApp.getUi().alert('Done! L3 Computer Science questions added (Q4 is now a single image-choice question).');
}

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

// ── Lesson population helpers ─────────────────────────────────────────────────

function addLessonQuestions_(lessonId, rows) {
  const ss    = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Questions');
  const data  = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === lessonId) sheet.deleteRow(i + 1);
  }
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, 10).setValues(rows);
  Logger.log(lessonId + ' questions added: ' + rows.length);
  SpreadsheetApp.getUi().alert('Done! ' + rows.length + ' questions added for ' + lessonId + '.');
}

function addL4Questions() {
  addLessonQuestions_('L4', [
    ['L4',1,'The visible light spectrum…',
     'Is the light that you can see',
     'Contains the colors you see in a rainbow',
     'Has wavelengths of 400-700 nm',
     'All of the above','','','D'],
    ['L4',2,'What is refraction?',
     'Computing a fraction twice',
     'The phenomenon of light changing directions due to changes in its transmission medium',
     'The science of reflections',
     'The process of factoring out parts of a polynomial','','','B'],
    ['L4',3,'Other than visible light, what is another form of electromagnetic radiation?',
     'Electrical current','Magnetic fields','Radio waves','None of the above','','','C'],
    ['L4',4,'Which unit of measurement do astronomers use to measure distances?',
     'Inches','Astronomical units','Sun years','Gigameters','','','B'],
    ['L4',5,'Do the stars in the night sky ever move?',
     'Yes','No','','','','','A'],
  ]);
}

function addL5Questions() {
  addLessonQuestions_('L5', [
    ['L5',1,'What is the most likely cause of death in the United States?',
     'Stroke','Cancer','Heart disease','Murder','','','C'],
    ['L5',2,'Which are the correct steps of the scientific method?',
     'Identify a problem, develop a question, make a hypothesis, conduct experiment and draw conclusion',
     'Develop a question, make a hypothesis, conduct experiment, identify a problem, and draw conclusion',
     'Identify a problem, develop a question, conduct experiment, make a hypothesis, and draw a conclusion',
     'Make a hypothesis, identify a problem, develop a question, conduct experiment, draw conclusion','','','A'],
    ['L5',3,'What is an appropriate hypothesis?',
     'If I run, then my heart rate will increase.',
     'Running is not fun.',
     'I don\'t like to run because it makes me tired.',
     'People run to stay healthy.','','','A'],
    ['L5',4,'Which is NOT part of vital signs you should get checked every time you see a doctor?',
     'Pulse rate','Blood pressure','Eye sight','Body temperature','','','C'],
    ['L5',5,'If your blood pressure is consistently high, how can you reduce it?',
     'Exercise more','Eat a balanced diet','Stop smoking','All of the above','','','D'],
  ]);
}

function addL6Questions() {
  addLessonQuestions_('L6', [
    ['L6',1,'Which of the following best describes "Artificial Intelligence" (AI)?',
     'A type of computer hardware that processes information quickly.',
     'Software used for creating digital art and designs.',
     'Complex computer code that follows pre-programmed instructions.',
     'Machines that can learn from data and perform tasks that typically require human intelligence.','','','D'],
    ['L6',2,'What is the fundamental concept behind how AI is able to generate text, images, or videos?',
     'It uses pre-written scripts and templates.',
     'It learns patterns from large amounts of data.',
     'It directly copies existing human-created content.',
     'It relies on random number generation.','','','B'],
    ['L6',3,'What does it mean for an AI algorithm to "curate" content, such as on a social media feed?',
     'To delete old or unpopular posts.',
     'To organize and present content based on user data and preferences.',
     'To randomly display all available content.',
     'To allow users to manually select everything they see.','','','B'],
    ['L6',4,'When comparing generative AI and analytical AI, what is the fundamental difference in their primary function?',
     'Generative AI creates new content, while analytical AI interprets and categorizes existing data.',
     'Generative AI requires more computational power than analytical AI.',
     'Generative AI is primarily used for creative tasks, while analytical AI is used for scientific research.',
     'Generative AI relies on different types of algorithms compared to analytical AI.','','','A'],
    ['L6',5,'What is the role of a "prompt" when using AI tools for text or image generation?',
     'It\'s an instruction or input given to the AI to guide its creation.',
     'It\'s the final output generated by the AI.',
     'It\'s a technical error that occurs during the AI process.',
     'It\'s a type of file format used for AI-generated media.','','','A'],
  ]);
}
