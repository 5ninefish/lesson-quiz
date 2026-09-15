// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Bound script only. Do not openById. File → Make a copy must write THIS book.
const TZ = 'Pacific/Honolulu';
const MAX_TRIES = 2;            // fallback when a Releases row is missing
const QUIZ_TIME_SECONDS = 0;    // fallback when a Releases row is missing
const TIMER_GRACE_SEC = 30;
const START_LOCK_MS = 10000;
const SUBMIT_LOCK_MS = 15000;

const LESSONS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'];
const LESSON_TO_TEST = {
  L1: 'SCI-SOIL',
  L2: 'SCI-CORAL',
  L3: 'SCI-CS',
  L4: 'SCI-ASTRO',
  L5: 'SCI-HEALTH',
  L6: 'SCI-DM',
};
const TEST_TO_LESSON = {
  'SCI-SOIL': 'L1',
  'SCI-CORAL': 'L2',
  'SCI-CS': 'L3',
  'SCI-ASTRO': 'L4',
  'SCI-HEALTH': 'L5',
  'SCI-DM': 'L6',
};
const LESSON_NAMES = {
  L1: 'Lesson 1 – Soil',
  L2: 'Lesson 2 – 3D Printing & Coral',
  L3: 'Lesson 3 – Computer Science',
  L4: 'Lesson 4 – Astronomy',
  L5: 'Lesson 5 – Health',
  L6: 'Lesson 6 – Digital Media',
};
const TEST_META = {
  'SCI-SOIL':  { strand: 'Science', title: 'Soil' },
  'SCI-CORAL': { strand: 'Science', title: '3D Printing & Coral' },
  'SCI-CS':    { strand: 'Science', title: 'Computer Science' },
  'SCI-ASTRO': { strand: 'Science', title: 'Astronomy' },
  'SCI-HEALTH':{ strand: 'Science', title: 'Health' },
  'SCI-DM':    { strand: 'Science', title: 'Digital Media' },
};

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    const username = normalizeUsername_(body.username);
    const password = body.password;
    const testId = resolveTestId_(body.testId || body.lesson);

    if (action === 'auth_and_load') {
      return authAndLoad(username, password, testId);
    }
    if (action === 'submit') {
      return submit(username, password, testId, body.answers || {}, body.submissionId);
    }
    if (action === 'get_tries' || action === 'login') {
      return getTries(username, password);
    }
    if (action === 'lesson_list') {
      return respond({ error: 'unknown_action' });
    }
    return respond({ error: 'unknown_action' });
  } catch (err) {
    return respond({ error: String(err) });
  }
}

function doGet() {
  return respond({ ok: true, service: 'lesson-quiz' });
}

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

// ─── HANDLERS ────────────────────────────────────────────────────────────────
function getTries(username, password) {
  const ss = ss_();
  const studentsData = ss.getSheetByName('Students').getDataRange().getValues();
  const student = findStudent(studentsData, username, password);
  if (!student) return respond({ error: 'invalid_credentials' });
  const allTries = allTriesFor(student);
  const tests = buildTestsPayload_(ss, student);
  return respond({
    ok: true,
    allTries: allTries,
    tests: tests,
    timeLimit: QUIZ_TIME_SECONDS,
  });
}

/*
  auth_and_load / submit sit machine

                    login / get_tries     (no lock)
                           |
              questions + roster UNLOCKED
                           |
              ScriptLock (Attempts join/mint/finalize only)
                           |
          in_flight? --yes--> expired/closed? --yes--> finalize then as none
                |                      no
                no                     return same submissionId + snapshot
                v
          release closed? -> not_released (no mint)
          cycleSits >= max -> max_attempts_reached
          else mint snapshots + StartedAt
*/
function authAndLoad(username, password, testId) {
  if (!testId) return respond({ error: 'invalid_lesson' });

  const ss = ss_();
  ensureRuntimeSchema_(ss);

  const studentsData = ss.getSheetByName('Students').getDataRange().getValues();
  const student = findStudent(studentsData, username, password);
  if (!student) return respond({ error: 'invalid_credentials' });

  const loaded = loadQuestions(ss, testId);
  if (loaded.error) return respond({ error: loaded.error });

  const rel = getRelease_(ss, testId);
  if (rel.error) return respond({ error: rel.error });

  const now = new Date();
  const lockResult = withScriptLock_(START_LOCK_MS, function () {
    const cycle = currentCycle_(student, testId);
    const maxTries = rel.missing ? MAX_TRIES : rel.maxTries;
    const timeLimitSec = rel.missing ? QUIZ_TIME_SECONDS : rel.timeLimitSec;

    const attemptsSheet = ss.getSheetByName('Attempts');
    const inFlight = findInFlight_(attemptsSheet, username, testId, cycle);

    if (inFlight) {
      const startedAt = asDate_(inFlight.startedAt);
      const expired = isTimerExpired_(startedAt, inFlight.timeLimitSec, now);
      const closed = !releaseAllowsStart_(rel, now);
      if (expired) {
        finalizeAttempt_(ss, inFlight, {}, 'time_expired', now);
        repairStudentsCache_(ss, student, testId);
      } else if (closed) {
        finalizeAttempt_(ss, inFlight, {}, 'time_expired', now);
        repairStudentsCache_(ss, student, testId);
        return { error: 'not_released' };
      } else {
        const remaining = remainingSec_(startedAt, inFlight.timeLimitSec, now);
        const questions = parseQuestionsSnapshot_(inFlight.questionsSnapshot) || loaded.questions;
        return joinPayload_(student, testId, inFlight.submissionId, questions, remaining, maxTries, ss);
      }
    }

    const studentNow = reloadStudent_(ss, username, password) || student;
    const cycleNow = currentCycle_(studentNow, testId);
    const sitsNow = cycleSits_(ss, username, testId, cycleNow);

    if (!releaseAllowsStart_(rel, now)) return { error: 'not_released' };
    if (sitsNow >= maxTries) {
      return { error: 'max_attempts_reached', tries: sitsNow, allTries: allTriesFor(studentNow) };
    }
    if (!loaded.questions || loaded.questions.length === 0) {
      return { error: 'no_questions_found' };
    }

    const minted = mintAttempt_(ss, username, testId, cycleNow, loaded, maxTries, timeLimitSec, now);
    return joinPayload_(studentNow, testId, minted.submissionId, loaded.questions, remainingSec_(now, timeLimitSec, now), maxTries, ss);
  });

  if (lockResult && lockResult._busy) return respond({ error: 'busy_try_again' });
  if (lockResult.error) {
    const extra = {};
    if (lockResult.tries !== undefined) extra.tries = lockResult.tries;
    if (lockResult.allTries) extra.allTries = lockResult.allTries;
    return respond(Object.assign({ error: lockResult.error }, extra));
  }
  return respond(lockResult);
}

function submit(username, password, testId, answers, clientSubmissionId) {
  if (!testId) return respond({ error: 'invalid_lesson' });
  const ss = ss_();
  ensureRuntimeSchema_(ss);
  const now = new Date();

  const lockResult = withScriptLock_(SUBMIT_LOCK_MS, function () {
    const studentsSheet = ss.getSheetByName('Students');
    const studentsData = studentsSheet.getDataRange().getValues();
    const student = findStudent(studentsData, username, password);
    if (!student) return { error: 'invalid_credentials' };

    const rel = getRelease_(ss, testId);
    if (rel.error) return { error: rel.error };

    const byId = clientSubmissionId ? findResultsBySubmissionId_(ss, clientSubmissionId) : null;
    if (byId) {
      repairStudentsCache_(ss, student, testId);
      return storedSubmitResponse_(byId, rel, now, student, testId);
    }

    const cycle = currentCycle_(student, testId);
    const attemptsSheet = ss.getSheetByName('Attempts');
    let inFlight = null;
    if (clientSubmissionId) {
      inFlight = findAttemptBySubmissionId_(attemptsSheet, clientSubmissionId);
      if (inFlight && inFlight.status !== 'in_flight') {
        const stored = findResultsBySubmissionId_(ss, clientSubmissionId);
        if (stored) {
          repairStudentsCache_(ss, student, testId);
          return storedSubmitResponse_(stored, rel, now, student, testId);
        }
        return { error: 'invalid_attempt' };
      }
      if (inFlight && (inFlight.username !== username || inFlight.testId !== testId || Number(inFlight.cycle) !== Number(cycle))) {
        return { error: 'invalid_attempt' };
      }
    } else {
      inFlight = findInFlight_(attemptsSheet, username, testId, cycle);
    }
    if (!inFlight || inFlight.status !== 'in_flight') return { error: 'invalid_attempt' };

    const startedAt = asDate_(inFlight.startedAt);
    const expired = isTimerExpired_(startedAt, inFlight.timeLimitSec, now);
    const closed = !releaseAllowsStart_(rel, now);

    if (closed && !expired) {
      return { error: 'not_released' };
    }

    const status = expired ? 'time_expired' : 'submitted';
    const result = finalizeAttempt_(ss, inFlight, answers, status, now);
    repairStudentsCache_(ss, student, testId);
    const studentNow = reloadStudent_(ss, username, password) || student;
    return liveSubmitResponse_(result, rel, now, studentNow, testId, inFlight);
  });

  if (lockResult && lockResult._busy) return respond({ error: 'busy_try_again' });
  if (lockResult.error) return respond({ error: lockResult.error });
  return respond(lockResult);
}

function joinPayload_(student, testId, submissionId, questions, remaining, maxTries, ss) {
  const lesson = TEST_TO_LESSON[testId] || testId;
  const tries = Number(allTriesFor(student)[lesson]) || 0;
  return {
    ok: true,
    submissionId: submissionId,
    tries: tries,
    maxTries: maxTries,
    questions: questions,
    lessonName: LESSON_NAMES[lesson] || (TEST_META[testId] && TEST_META[testId].title) || testId,
    lesson: lesson,
    testId: testId,
    allTries: allTriesFor(student),
    timeLimit: remaining,
  };
}

function liveSubmitResponse_(result, rel, now, student, testId, inFlight) {
  const lesson = TEST_TO_LESSON[testId] || testId;
  const maxTries = Number(inFlight.maxTriesSnapshot) || (rel.missing ? MAX_TRIES : rel.maxTries);
  const attempt = cycleSits_(ss_(), student.username || usernameFromStudent_(student), testId, currentCycle_(student, testId));
  const isLastTry = attempt >= maxTries;
  const graded = stripCorrect_(result.graded, keysVisible_(rel, now));
  const payload = {
    ok: true,
    score: result.score,
    total: result.total,
    attempt: attempt,
    maxTries: maxTries,
    isLastTry: isLastTry,
    status: result.status,
    graded: graded,
    lesson: lesson,
    testId: testId,
  };
  if (result.status === 'time_expired') payload.error = undefined;
  return payload;
}

function storedSubmitResponse_(row, rel, now, student, testId) {
  const maxTries = rel.missing ? MAX_TRIES : rel.maxTries;
  const attempt = Number(row.lifetimeSeq) || cycleSits_(ss_(), usernameFromStudent_(student), testId, currentCycle_(student, testId));
  const graded = stripCorrect_(row.graded || [], keysVisible_(rel, now));
  return {
    ok: true,
    score: row.scoreNum,
    total: row.total || 5,
    attempt: cycleSits_(ss_(), usernameFromStudent_(student), testId, currentCycle_(student, testId)),
    maxTries: maxTries,
    isLastTry: cycleSits_(ss_(), usernameFromStudent_(student), testId, currentCycle_(student, testId)) >= maxTries,
    status: row.status || 'submitted',
    graded: graded,
    lesson: TEST_TO_LESSON[testId] || testId,
    testId: testId,
  };
}

function stripCorrect_(graded, reveal) {
  return (graded || []).map(function (g) {
    const out = { qNum: g.qNum, given: g.given, isRight: g.isRight };
    if (reveal && g.correct) out.correct = g.correct;
    return out;
  });
}

function allTriesFor(student) {
  const out = {};
  LESSONS.forEach(function (l, i) {
    out[l] = Number(student.row[2 + i]) || 0;
  });
  return out;
}

function usernameFromStudent_(student) {
  return normalizeUsername_(student.row[0]);
}

function reloadStudent_(ss, username, password) {
  const data = ss.getSheetByName('Students').getDataRange().getValues();
  return findStudent(data, username, password);
}

function buildTestsPayload_(ss, student) {
  const now = new Date();
  return LESSONS.map(function (lesson) {
    const testId = LESSON_TO_TEST[lesson];
    const rel = getRelease_(ss, testId);
    const maxTries = rel.missing ? MAX_TRIES : rel.maxTries;
    const tries = Number(allTriesFor(student)[lesson]) || 0;
    let state = 'open';
    if (rel.error) state = 'locked';
    else if (rel.missing) state = tries >= maxTries ? 'done' : 'open';
    else if (rel.manual === 'AUTO' && !rel.openAt) state = 'hidden';
    else if (!releaseAllowsStart_(rel, now)) {
      if (rel.manual === 'AUTO' && rel.openAt && now.getTime() < rel.openAt.getTime()) state = 'upcoming';
      else state = 'locked';
    } else {
      state = 'open';
    }
    if (tries >= maxTries) state = 'done';
    const meta = TEST_META[testId] || {};
    return {
      testId: testId,
      lesson: lesson,
      title: meta.title || LESSON_NAMES[lesson] || lesson,
      strand: meta.strand || 'Science',
      state: state,
      tries: tries,
      maxTries: maxTries,
      openAt: rel.openAt ? rel.openAt.toISOString() : '',
      closeAt: rel.closeAt ? rel.closeAt.toISOString() : '',
      timeLimit: rel.missing ? QUIZ_TIME_SECONDS : rel.timeLimitSec,
    };
  }).filter(function (t) { return t.state !== 'hidden'; });
}

// ─── IDENTITY / QUESTIONS ────────────────────────────────────────────────────
function normalizeUsername_(u) {
  return String(u || '').trim().toLowerCase();
}

function resolveTestId_(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const up = s.toUpperCase();
  if (LESSON_TO_TEST[up]) return LESSON_TO_TEST[up];
  if (TEST_TO_LESSON[up]) return up;
  return up;
}

function hashPassword(plain) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(plain)
  );
  return bytes.map(function (b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function findStudent(data, username, password) {
  const hash = hashPassword(password);
  const want = normalizeUsername_(username);
  for (let i = 1; i < data.length; i++) {
    if (normalizeUsername_(data[i][0]) === want && String(data[i][1]) === hash) {
      return { row: data[i], sheetRow: i + 1, username: want };
    }
  }
  return null;
}

function loadQuestions(ss, testId) {
  const canon = resolveTestId_(testId);
  const alias = TEST_TO_LESSON[canon] || '';
  const sheet = ss.getSheetByName('Questions');
  if (!sheet) return { error: 'no_questions_found' };
  const data = sheet.getDataRange().getValues();
  let hasCanon = false;
  let hasAlias = false;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0]).trim();
    if (id === canon) hasCanon = true;
    if (alias && id === alias) hasAlias = true;
  }
  if (hasCanon && hasAlias) return { error: 'bad_question_bank' };

  const matchId = hasCanon ? canon : (hasAlias ? alias : canon);
  const questions = [];
  const corrects = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() !== matchId) continue;
    const opts = [data[i][3], data[i][4], data[i][5], data[i][6], data[i][7], data[i][8]]
      .map(String)
      .filter(function (s) { return s.trim() !== ''; });
    questions.push({ num: data[i][1], question: data[i][2], options: opts });
    corrects.push(String(data[i][9] || '').trim().toUpperCase());
  }
  if (questions.length === 0) return { error: 'no_questions_found' };
  return { questions: questions, corrects: corrects };
}

function fingerprint_(questions, correctSnapshot) {
  return hashPassword(JSON.stringify({ q: questions, c: correctSnapshot }));
}

function correctSnapshotFrom_(corrects) {
  return (corrects || []).map(function (c) { return String(c || '').trim().toUpperCase(); }).join('|');
}

function grade_(answers, questions, correctSnapshot) {
  const keys = String(correctSnapshot || '').split('|');
  const graded = [];
  let score = 0;
  (questions || []).forEach(function (q, i) {
    const correct = (keys[i] || '').trim().toUpperCase();
    const given = String(answers[q.num] || '').trim().toUpperCase();
    const isRight = given !== '' && given === correct;
    if (isRight) score++;
    graded.push({ qNum: q.num, given: given, isRight: isRight, correct: correct });
  });
  return { score: score, total: (questions || []).length, graded: graded };
}

// ─── RELEASES ────────────────────────────────────────────────────────────────
function getRelease_(ss, testId) {
  const canon = resolveTestId_(testId);
  const alias = TEST_TO_LESSON[canon] || '';
  const sheet = ss.getSheetByName('Releases');
  if (!sheet) return { missing: true, maxTries: MAX_TRIES, timeLimitSec: QUIZ_TIME_SECONDS, manual: 'AUTO' };
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { missing: true, maxTries: MAX_TRIES, timeLimitSec: QUIZ_TIME_SECONDS, manual: 'AUTO' };

  const matches = [];
  for (let i = 1; i < data.length; i++) {
    const id = resolveTestId_(data[i][0]);
    if (id === canon) matches.push(data[i]);
  }
  if (matches.length > 1) return { error: 'bad_question_bank' };
  if (matches.length === 0) return { missing: true, maxTries: MAX_TRIES, timeLimitSec: QUIZ_TIME_SECONDS, manual: 'AUTO' };

  const row = matches[0];
  const openAt = parseSheetDate_(row[3]);
  const closeAt = parseSheetDate_(row[4]);
  const manual = String(row[5] || 'AUTO').trim().toUpperCase() || 'AUTO';
  const maxTries = Number(row[6]) > 0 ? Number(row[6]) : MAX_TRIES;
  const timeLimitSec = Number(row[7]) >= 0 ? Number(row[7]) : QUIZ_TIME_SECONDS;
  return {
    missing: false,
    testId: canon,
    strand: String(row[1] || ''),
    title: String(row[2] || ''),
    openAt: openAt,
    closeAt: closeAt,
    manual: manual,
    maxTries: maxTries,
    timeLimitSec: timeLimitSec,
  };
}

function releaseAllowsStart_(rel, now) {
  if (!rel || rel.missing) return true;
  if (rel.manual === 'OPEN') return true;
  if (rel.manual === 'CLOSED') return false;
  if (rel.manual === 'AUTO' && !rel.openAt) return false;
  const t = now.getTime();
  if (rel.openAt && t < rel.openAt.getTime()) return false;
  if (rel.closeAt && t > rel.closeAt.getTime()) return false;
  return true;
}

function keysVisible_(rel, now) {
  if (!rel || rel.missing) return false;
  if (rel.manual === 'OPEN') return false;
  if (rel.manual === 'CLOSED') return true;
  if (rel.closeAt && now.getTime() > rel.closeAt.getTime()) return true;
  return false;
}

function parseSheetDate_(val) {
  if (val === '' || val === null || val === undefined) return null;
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) return val;
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function asDate_(val) {
  const d = parseSheetDate_(val);
  return d || new Date(0);
}

function remainingSec_(startedAt, timeLimitSec, now) {
  const cap = Number(timeLimitSec) || 0;
  if (cap <= 0) return 0;
  const used = Math.floor((now.getTime() - asDate_(startedAt).getTime()) / 1000);
  return Math.max(0, cap - used);
}

function isTimerExpired_(startedAt, timeLimitSec, now) {
  const cap = Number(timeLimitSec) || 0;
  if (cap <= 0) return false;
  return now.getTime() - asDate_(startedAt).getTime() >= (cap + TIMER_GRACE_SEC) * 1000;
}

// ─── ATTEMPTS / RESULTS / CYCLE ──────────────────────────────────────────────
function currentCycle_(student, testId) {
  const lesson = TEST_TO_LESSON[testId];
  const li = LESSONS.indexOf(lesson);
  if (li < 0) return 1;
  const idx = 8 + li;
  if (student.row.length > idx && student.row[idx] !== '' && student.row[idx] !== null) {
    const n = Number(student.row[idx]);
    return n > 0 ? n : 1;
  }
  return 1;
}

function cycleSits_(ss, username, testId, cycle) {
  const sheet = ss.getSheetByName('Results');
  if (!sheet) return 0;
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const userCol = 1;
  const testCol = headerIndex_(headers, 'TestId') >= 0 ? headerIndex_(headers, 'TestId') : 2;
  const cycleCol = headerIndex_(headers, 'Cycle');
  const want = normalizeUsername_(username);
  const canon = resolveTestId_(testId);
  const alias = TEST_TO_LESSON[canon] || '';
  let n = 0;
  for (let i = 1; i < data.length; i++) {
    if (normalizeUsername_(data[i][userCol]) !== want) continue;
    const rowTest = resolveTestId_(data[i][testCol]);
    if (rowTest !== canon && String(data[i][testCol]).trim() !== alias) continue;
    if (cycleCol >= 0) {
      const c = Number(data[i][cycleCol]) || 1;
      if (c !== Number(cycle)) continue;
    }
    n++;
  }
  return n;
}

function nextLifetimeSeq_(ss, username, testId) {
  const sheet = ss.getSheetByName('Results');
  if (!sheet) return 1;
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const userCol = 1;
  const testCol = headerIndex_(headers, 'TestId') >= 0 ? headerIndex_(headers, 'TestId') : 2;
  const seqCol = headerIndex_(headers, 'LifetimeSeq');
  const attemptCol = headerIndex_(headers, 'Attempt');
  const want = normalizeUsername_(username);
  const canon = resolveTestId_(testId);
  let max = 0;
  for (let i = 1; i < data.length; i++) {
    if (normalizeUsername_(data[i][userCol]) !== want) continue;
    if (resolveTestId_(data[i][testCol]) !== canon && String(data[i][testCol]).trim() !== (TEST_TO_LESSON[canon] || '')) continue;
    const seq = seqCol >= 0 ? Number(data[i][seqCol]) : Number(data[i][attemptCol]);
    if (seq > max) max = seq;
  }
  return max + 1;
}

function headerIndex_(headers, name) {
  const n = String(name).trim().toLowerCase();
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === n) return i;
  }
  return -1;
}

function findInFlight_(attemptsSheet, username, testId, cycle) {
  if (!attemptsSheet) return null;
  const data = attemptsSheet.getDataRange().getValues();
  const want = normalizeUsername_(username);
  const canon = resolveTestId_(testId);
  for (let i = 1; i < data.length; i++) {
    if (normalizeUsername_(data[i][0]) !== want) continue;
    if (resolveTestId_(data[i][1]) !== canon) continue;
    if (Number(data[i][2]) !== Number(cycle)) continue;
    if (String(data[i][9]).trim() !== 'in_flight') continue;
    return attemptFromRow_(data[i], i + 1);
  }
  return null;
}

function findAttemptBySubmissionId_(attemptsSheet, submissionId) {
  if (!attemptsSheet || !submissionId) return null;
  const data = attemptsSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][3]) === String(submissionId)) return attemptFromRow_(data[i], i + 1);
  }
  return null;
}

function attemptFromRow_(row, sheetRow) {
  return {
    username: normalizeUsername_(row[0]),
    testId: resolveTestId_(row[1]),
    cycle: Number(row[2]) || 1,
    submissionId: String(row[3]),
    startedAt: row[4],
    timeLimitSec: Number(row[5]) || 0,
    maxTriesSnapshot: Number(row[6]) || MAX_TRIES,
    questionFingerprint: String(row[7] || ''),
    correctSnapshot: String(row[8] || ''),
    status: String(row[9] || ''),
    questionsSnapshot: row[10] !== undefined ? String(row[10] || '') : '',
    sheetRow: sheetRow,
  };
}

function parseQuestionsSnapshot_(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.length ? parsed : null;
  } catch (e) {
    return null;
  }
}

function mintAttempt_(ss, username, testId, cycle, loaded, maxTries, timeLimitSec, now) {
  const sheet = ss.getSheetByName('Attempts');
  const submissionId = Utilities.getUuid();
  const correctSnapshot = correctSnapshotFrom_(loaded.corrects);
  const questionsSnapshot = JSON.stringify(loaded.questions);
  const fp = fingerprint_(loaded.questions, correctSnapshot);
  sheet.appendRow([
    username,
    testId,
    cycle,
    submissionId,
    now,
    timeLimitSec,
    maxTries,
    fp,
    correctSnapshot,
    'in_flight',
    questionsSnapshot,
  ]);
  SpreadsheetApp.flush();
  return { submissionId: submissionId, correctSnapshot: correctSnapshot, questionsSnapshot: questionsSnapshot };
}

function finalizeAttempt_(ss, inFlight, answers, status, now) {
  const questions = parseQuestionsSnapshot_(inFlight.questionsSnapshot) || [];
  const graded = grade_(answers || {}, questions, inFlight.correctSnapshot);
  const lifetimeSeq = nextLifetimeSeq_(ss, inFlight.username, inFlight.testId);
  const results = ss.getSheetByName('Results');
  const answerLog = [];
  for (let q = 1; q <= 5; q++) {
    const g = graded.graded.filter(function (x) { return String(x.qNum) === String(q); })[0];
    answerLog.push(g ? g.given : '');
  }
  const headers = results.getRange(1, 1, 1, Math.max(13, results.getLastColumn())).getValues()[0];
  const row = [];
  for (let c = 0; c < headers.length; c++) row[c] = '';
  function setCol(name, aliases, value) {
    let idx = headerIndex_(headers, name);
    if (idx < 0 && aliases) {
      for (let a = 0; a < aliases.length; a++) {
        idx = headerIndex_(headers, aliases[a]);
        if (idx >= 0) break;
      }
    }
    if (idx >= 0) row[idx] = value;
  }
  setCol('Timestamp', null, now.toISOString());
  setCol('Username', null, inFlight.username);
  setCol('TestId', ['Lesson'], inFlight.testId);
  setCol('Cycle', null, inFlight.cycle);
  setCol('LifetimeSeq', ['Attempt'], lifetimeSeq);
  setCol('Score', null, graded.score + '/' + graded.total);
  setCol('Q1', null, answerLog[0]);
  setCol('Q2', null, answerLog[1]);
  setCol('Q3', null, answerLog[2]);
  setCol('Q4', null, answerLog[3]);
  setCol('Q5', null, answerLog[4]);
  setCol('SubmissionId', null, inFlight.submissionId);
  setCol('Status', null, status);
  results.appendRow(row);
  ss.getSheetByName('Attempts').getRange(inFlight.sheetRow, 10).setValue('done');
  SpreadsheetApp.flush();
  return {
    score: graded.score,
    total: graded.total,
    graded: graded.graded,
    status: status,
    lifetimeSeq: lifetimeSeq,
    submissionId: inFlight.submissionId,
  };
}

function findResultsBySubmissionId_(ss, submissionId) {
  const sheet = ss.getSheetByName('Results');
  if (!sheet || !submissionId) return null;
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const idCol = headerIndex_(headers, 'SubmissionId');
  if (idCol < 0) return null;
  const scoreCol = headerIndex_(headers, 'Score');
  const cycleCol = headerIndex_(headers, 'Cycle');
  const seqCol = headerIndex_(headers, 'LifetimeSeq') >= 0 ? headerIndex_(headers, 'LifetimeSeq') : headerIndex_(headers, 'Attempt');
  const statusCol = headerIndex_(headers, 'Status');
  const q1 = headerIndex_(headers, 'Q1');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) !== String(submissionId)) continue;
    const scoreRaw = String(scoreCol >= 0 ? data[i][scoreCol] : '');
    const parts = scoreRaw.split('/');
    const scoreNum = Number(parts[0]) || 0;
    const total = Number(parts[1]) || 5;
    const graded = [];
    for (let q = 1; q <= 5; q++) {
      const qi = q1 >= 0 ? q1 + (q - 1) : 5 + q;
      graded.push({ qNum: q, given: String(data[i][qi] || ''), isRight: false });
    }
    return {
      submissionId: submissionId,
      cycle: cycleCol >= 0 ? (Number(data[i][cycleCol]) || 1) : 1,
      lifetimeSeq: seqCol >= 0 ? (Number(data[i][seqCol]) || 1) : 1,
      scoreNum: scoreNum,
      total: total,
      status: statusCol >= 0 ? String(data[i][statusCol] || 'submitted') : 'submitted',
      graded: graded,
    };
  }
  return null;
}

function repairStudentsCache_(ss, student, testId) {
  const lesson = TEST_TO_LESSON[testId];
  const li = LESSONS.indexOf(lesson);
  if (li < 0) return;
  const cycle = currentCycle_(student, testId);
  const sits = cycleSits_(ss, usernameFromStudent_(student), testId, cycle);
  ss.getSheetByName('Students').getRange(student.sheetRow, 3 + li).setValue(sits);
  SpreadsheetApp.flush();
}

function bumpCycle_(ss, username, lessonOrAll) {
  const sheet = ss.getSheetByName('Students');
  const data = sheet.getDataRange().getValues();
  ensureCycleHeaders_(sheet, data[0]);
  const want = normalizeUsername_(username);
  for (let i = 1; i < data.length; i++) {
    if (normalizeUsername_(data[i][0]) !== want) continue;
    const lessons = lessonOrAll === 'ALL' ? LESSONS : [lessonOrAll];
    lessons.forEach(function (lesson) {
      const li = LESSONS.indexOf(lesson);
      if (li < 0) return;
      const cycleCol = 9 + li;
      const cur = Number(sheet.getRange(i + 1, cycleCol).getValue()) || 1;
      sheet.getRange(i + 1, cycleCol).setValue(cur + 1);
      sheet.getRange(i + 1, 3 + li).setValue(0);
    });
    return true;
  }
  return false;
}

// ─── LOCK / SCHEMA ───────────────────────────────────────────────────────────
function withScriptLock_(ms, fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(ms);
  } catch (e) {
    return { _busy: true };
  }
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function ensureRuntimeSchema_(ss) {
  ensureResultsHeaders_(ss);
  ensureAttemptsSheet_(ss);
  const students = ss.getSheetByName('Students');
  if (students) ensureCycleHeaders_(students, students.getRange(1, 1, 1, Math.max(14, students.getLastColumn())).getValues()[0]);
}

function ensureCycleHeaders_(sheet, headerRow) {
  if (!headerRow || headerRow[8] === 'CycleL1') return;
  const needed = ['CycleL1', 'CycleL2', 'CycleL3', 'CycleL4', 'CycleL5', 'CycleL6'];
  sheet.getRange(1, 9, 1, 6).setValues([needed]);
  const last = sheet.getLastRow();
  if (last > 1) {
    const ones = [];
    for (let i = 0; i < last - 1; i++) ones.push([1, 1, 1, 1, 1, 1]);
    sheet.getRange(2, 9, last - 1, 6).setValues(ones);
  }
}

function ensureResultsHeaders_(ss) {
  let sheet = ss.getSheetByName('Results');
  if (!sheet) {
    sheet = ss.insertSheet('Results');
    sheet.getRange(1, 1, 1, 13).setValues([[
      'Timestamp', 'Username', 'TestId', 'Cycle', 'LifetimeSeq', 'Score',
      'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'SubmissionId', 'Status',
    ]]);
    sheet.setFrozenRows(1);
    return;
  }
  const lastCol = Math.max(10, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const extra = [];
  if (headerIndex_(headers, 'Cycle') < 0) extra.push('Cycle');
  if (headerIndex_(headers, 'LifetimeSeq') < 0 && headerIndex_(headers, 'Attempt') < 0) extra.push('LifetimeSeq');
  if (headerIndex_(headers, 'SubmissionId') < 0) extra.push('SubmissionId');
  if (headerIndex_(headers, 'Status') < 0) extra.push('Status');
  if (extra.length) {
    sheet.getRange(1, lastCol + 1, 1, extra.length).setValues([extra]);
  }
}

function ensureAttemptsSheet_(ss) {
  if (ss.getSheetByName('Attempts')) return;
  const a = ss.insertSheet('Attempts');
  a.getRange(1, 1, 1, 11).setValues([[
    'Username', 'TestId', 'Cycle', 'SubmissionId', 'StartedAt', 'TimeLimitSec',
    'MaxTriesSnapshot', 'QuestionFingerprint', 'CorrectSnapshot', 'Status', 'QuestionsSnapshot',
  ]]);
  a.setFrozenRows(1);
}

function ensureAuditSheet_(ss) {
  if (ss.getSheetByName('Audit')) return;
  const a = ss.insertSheet('Audit');
  a.getRange(1, 1, 1, 4).setValues([['TimestampHST', 'Actor', 'Action', 'Detail']]);
  a.setFrozenRows(1);
}

function logAudit_(action, detail) {
  try {
    const ss = ss_();
    ensureAuditSheet_(ss);
    const ts = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
    ss.getSheetByName('Audit').appendRow([ts, Session.getEffectiveUser().getEmail(), action, detail]);
  } catch (e) {}
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── CUSTOM SHEET MENU ───────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Quiz Admin')
    .addItem('Reset student tries…', 'showResetDialog')
    .addItem('View attempt summary', 'showSummary')
    .addSeparator()
    .addItem('Open test now…', 'adminOpenNow')
    .addItem('Close test now…', 'adminCloseNow')
    .addItem('Set window…', 'adminSetWindow')
    .addItem('Set attempts…', 'adminSetAttempts')
    .addItem('Set time limit…', 'adminSetTimeLimit')
    .addSeparator()
    .addItem('Sync roster from RosterImport', 'syncRoster')
    .addItem('Hash new passwords', 'bulkHashPasswords_')
    .addToUi();
}

function showResetDialog() {
  const ss = ss_();
  const sheet = ss.getSheetByName('Students');
  const data = sheet.getDataRange().getValues();
  const students = data.slice(1).map(function (r) { return r[0]; }).filter(function (u) { return u !== ''; });

  const html = HtmlService.createHtmlOutput(
    '<style>body{font-family:Arial,sans-serif;padding:16px;font-size:14px}label{display:block;margin-top:10px;font-weight:bold}select{width:100%;padding:6px;margin-top:4px;font-size:14px}button{margin-top:16px;padding:8px 20px;background:#1a73e8;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;width:100%}#msg{margin-top:12px;color:green;font-weight:bold;display:none}</style>' +
    '<label>Student:</label><select id="student">' +
    students.map(function (u) { return '<option value="' + u + '">' + u + '</option>'; }).join('') +
    '</select><label>Lesson:</label><select id="lesson">' +
    LESSONS.map(function (l) { return '<option value="' + l + '">' + l + '</option>'; }).join('') +
    '<option value="ALL">ALL lessons</option></select>' +
    '<button onclick="doReset()">Reset Tries (new cycle)</button><div id="msg"></div>' +
    '<script>function doReset(){google.script.run.withSuccessHandler(function(result){var msg=document.getElementById("msg");msg.textContent=result;msg.style.display="block";}).resetTriesFromDialog(document.getElementById("student").value,document.getElementById("lesson").value);}<\/script>'
  ).setWidth(320).setHeight(280);
  SpreadsheetApp.getUi().showModalDialog(html, 'Reset Student Tries');
}

function resetTriesFromDialog(username, lesson) {
  const ss = ss_();
  ensureRuntimeSchema_(ss);
  const ok = bumpCycle_(ss, username, lesson);
  if (!ok) return 'Student not found: ' + username;
  logAudit_('reset_cycle', username + ' ' + lesson);
  return username + ' / ' + lesson + ': cycle incremented, cache 0. Results kept.';
}

function resetTries(username, lesson) {
  ensureRuntimeSchema_(ss_());
  bumpCycle_(ss_(), username, lesson);
}

function showSummary() {
  const ss = ss_();
  const sheet = ss.getSheetByName('Students');
  const data = sheet.getDataRange().getValues();
  let rows = '';
  for (let i = 1; i < data.length; i++) {
    const u = data[i][0];
    const tries = LESSONS.map(function (l, li) {
      const t = Number(data[i][2 + li]) || 0;
      const color = t >= 2 ? '#dc2626' : t === 1 ? '#d97706' : '#16a34a';
      return '<td style="text-align:center;color:' + color + ';font-weight:bold">' + t + '</td>';
    }).join('');
    rows += '<tr><td style="padding:4px 8px">' + u + '</td>' + tries + '</tr>';
  }
  const html = HtmlService.createHtmlOutput(
    '<style>body{font-family:Arial,sans-serif;font-size:13px;padding:12px}table{border-collapse:collapse;width:100%}th{background:#f1f5f9;padding:6px 8px;text-align:center}th:first-child{text-align:left}td{padding:4px 8px;border-bottom:1px solid #e2e8f0}</style>' +
    '<table><tr><th>Username</th>' + LESSONS.map(function (l) { return '<th>' + l + '</th>'; }).join('') + '</tr>' + rows + '</table>' +
    '<p class="legend" style="margin-top:8px;font-size:11px;color:#64748b">Cache of current-cycle sits. Reset increments Cycle, does not delete Results.</p>'
  ).setWidth(500).setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(html, 'Attempt Summary');
}

function pickTestId_() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Test ID', 'Canonical or alias (SCI-CS or L3)', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return '';
  return resolveTestId_(r.getResponseText());
}

function ensureReleasesSheet_(ss) {
  let sheet = ss.getSheetByName('Releases');
  if (!sheet) {
    sheet = ss.insertSheet('Releases');
    sheet.getRange(1, 1, 1, 8).setValues([[
      'TestId', 'Strand', 'Title', 'OpenAt', 'CloseAt', 'Manual', 'MaxTries', 'TimeLimitSec',
    ]]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function upsertRelease_(testId, mutator) {
  const ss = ss_();
  const sheet = ensureReleasesSheet_(ss);
  const data = sheet.getDataRange().getValues();
  let rowNum = -1;
  for (let i = 1; i < data.length; i++) {
    if (resolveTestId_(data[i][0]) === testId) { rowNum = i + 1; break; }
  }
  if (rowNum < 0) {
    const meta = TEST_META[testId] || { strand: '', title: testId };
    sheet.appendRow([testId, meta.strand, meta.title, '', '', 'AUTO', MAX_TRIES, 0]);
    rowNum = sheet.getLastRow();
  }
  const row = sheet.getRange(rowNum, 1, 1, 8).getValues()[0];
  mutator(row);
  row[0] = testId;
  sheet.getRange(rowNum, 1, 1, 8).setValues([row]);
  logAudit_('release_update', testId + ' ' + JSON.stringify(row));
}

function adminOpenNow() {
  const testId = pickTestId_();
  if (!testId) return;
  upsertRelease_(testId, function (row) { row[5] = 'OPEN'; });
  SpreadsheetApp.getUi().alert('Opened ' + testId);
}

function adminCloseNow() {
  const testId = pickTestId_();
  if (!testId) return;
  upsertRelease_(testId, function (row) { row[5] = 'CLOSED'; });
  SpreadsheetApp.getUi().alert('Closed ' + testId);
}

function adminSetWindow() {
  const ui = SpreadsheetApp.getUi();
  const testId = pickTestId_();
  if (!testId) return;
  const open = ui.prompt('OpenAt', 'e.g. 2026-09-20 09:00', ui.ButtonSet.OK_CANCEL);
  if (open.getSelectedButton() !== ui.Button.OK) return;
  const close = ui.prompt('CloseAt', 'e.g. 2026-09-20 11:00', ui.ButtonSet.OK_CANCEL);
  if (close.getSelectedButton() !== ui.Button.OK) return;
  upsertRelease_(testId, function (row) {
    row[3] = open.getResponseText();
    row[4] = close.getResponseText();
    row[5] = 'AUTO';
  });
  ui.alert('Window set for ' + testId);
}

function adminSetAttempts() {
  const ui = SpreadsheetApp.getUi();
  const testId = pickTestId_();
  if (!testId) return;
  const r = ui.prompt('MaxTries', 'Positive integer', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const n = Number(r.getResponseText());
  if (!(n > 0)) { ui.alert('Invalid'); return; }
  upsertRelease_(testId, function (row) { row[6] = n; });
  ui.alert('MaxTries=' + n + ' for ' + testId);
}

function adminSetTimeLimit() {
  const ui = SpreadsheetApp.getUi();
  const testId = pickTestId_();
  if (!testId) return;
  const r = ui.prompt('TimeLimitSec', 'Seconds, 0 = no timer', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const n = Number(r.getResponseText());
  if (isNaN(n) || n < 0) { ui.alert('Invalid'); return; }
  upsertRelease_(testId, function (row) { row[7] = n; });
  ui.alert('TimeLimitSec=' + n + ' for ' + testId);
}

function syncRoster() {
  const ss = ss_();
  const src = ss.getSheetByName('RosterImport');
  if (!src) {
    const created = ss.insertSheet('RosterImport');
    created.getRange(1, 1, 1, 2).setValues([['Email', 'Password']]);
    SpreadsheetApp.getUi().alert('Created RosterImport tab. Paste email + plaintext password, then run Sync roster again.');
    return;
  }
  const students = ss.getSheetByName('Students');
  ensureCycleHeaders_(students, students.getRange(1, 1, 1, 14).getValues()[0]);
  const existing = students.getDataRange().getValues();
  const have = {};
  for (let i = 1; i < existing.length; i++) have[normalizeUsername_(existing[i][0])] = true;
  const rows = src.getDataRange().getValues();
  let added = 0;
  for (let i = 1; i < rows.length; i++) {
    const email = normalizeUsername_(rows[i][0]);
    const pass = String(rows[i][1] || '');
    if (!email || !pass) continue;
    if (have[email]) continue;
    students.appendRow([email, pass, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
    have[email] = true;
    added++;
  }
  bulkHashPasswords_();
  logAudit_('sync_roster', 'added ' + added);
  SpreadsheetApp.getUi().alert('Roster sync: added ' + added + ' new students. Existing try counts left alone.');
}

// ─── ONE-TIME SETUP ──────────────────────────────────────────────────────────
function setup() {
  const ss = ss_();
  ss.setSpreadsheetTimeZone(TZ);

  const students = ss.getSheetByName('Students');
  const headerRow = students.getRange(1, 1, 1, 8).getValues()[0];
  if (headerRow[2] !== 'L1') {
    students.getRange(1, 3, 1, 6).setValues([['L1', 'L2', 'L3', 'L4', 'L5', 'L6']]);
    const numStudents = students.getLastRow() - 1;
    if (numStudents > 0) {
      const zeros = [];
      for (let i = 0; i < numStudents; i++) zeros.push([0, 0, 0, 0, 0, 0]);
      students.getRange(2, 3, numStudents, 6).setValues(zeros);
    }
  }
  ensureCycleHeaders_(students, students.getRange(1, 1, 1, 14).getValues()[0]);
  bulkHashPasswords_();
  ensureResultsHeaders_(ss);
  ensureAttemptsSheet_(ss);
  ensureAuditSheet_(ss);

  if (!ss.getSheetByName('Questions')) {
    const q = ss.insertSheet('Questions');
    q.getRange(1, 1, 1, 10).setValues([['Lesson', 'Q#', 'Question', 'A', 'B', 'C', 'D', 'E', 'F', 'Correct']]);
    q.setFrozenRows(1);
  }

  const rel = ensureReleasesSheet_(ss);
  if (rel.getLastRow() < 2) {
    const rows = LESSONS.map(function (l) {
      const id = LESSON_TO_TEST[l];
      const meta = TEST_META[id];
      return [id, meta.strand, meta.title, '', '', 'CLOSED', 2, 0];
    });
    rel.getRange(2, 1, rows.length, 8).setValues(rows);
  }

  if (!ss.getSheetByName('RosterImport')) {
    const ri = ss.insertSheet('RosterImport');
    ri.getRange(1, 1, 1, 2).setValues([['Email', 'Password']]);
  }

  SpreadsheetApp.getUi().alert(
    'Setup complete.\n\n' +
    'Bound spreadsheet timezone: Pacific/Honolulu\n' +
    'Cycle columns, Attempts, Releases, Audit, RosterImport ready.\n' +
    'Releases default CLOSED. Use Quiz Admin to open a window.\n\n' +
    'Questions Lesson column should be canonical TestId (SCI-CS), not L3.\n' +
    'Keys stay in the Correct column on the sheet only.'
  );
}

function bulkHashPasswords_() {
  const sheet = ss_().getSheetByName('Students');
  const data = sheet.getDataRange().getValues();
  let count = 0;
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

function addLessonQuestions_(lessonId, rows) {
  const ss = ss_();
  const sheet = ss.getSheetByName('Questions');
  const data = sheet.getDataRange().getValues();
  const canon = resolveTestId_(lessonId);
  const alias = TEST_TO_LESSON[canon] || '';
  for (let i = data.length - 1; i >= 1; i--) {
    const id = String(data[i][0]).trim();
    if (id === canon || id === alias || id === lessonId) sheet.deleteRow(i + 1);
  }
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, 10).setValues(rows);
  Logger.log(lessonId + ' questions added: ' + rows.length);
  SpreadsheetApp.getUi().alert('Done! ' + rows.length + ' questions added for ' + lessonId + '. Fill Correct on the sheet (not in git).');
}

function blankCorrect_(row) {
  const copy = row.slice();
  while (copy.length < 10) copy.push('');
  copy[9] = '';
  return copy;
}

function populateQuestions() {
  const ss = ss_();
  const sheet = ss.getSheetByName('Questions');
  sheet.clearContents();
  const rows = [['Lesson', 'Q#', 'Question', 'A', 'B', 'C', 'D', 'E', 'F', 'Correct']].concat(
    soilRows_().concat(coralRows_(), csRows_())
  );
  sheet.getRange(1, 1, rows.length, 10).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, 10).setFontWeight('bold');
  SpreadsheetApp.getUi().alert('Questions written without keys. Fill the Correct column on the sheet.');
}

function addL3Questions() { addLessonQuestions_('SCI-CS', csRows_()); }
function addL4Questions() { addLessonQuestions_('SCI-ASTRO', astroRows_()); }
function addL5Questions() { addLessonQuestions_('SCI-HEALTH', healthRows_()); }
function addL6Questions() { addLessonQuestions_('SCI-DM', dmRows_()); }

function soilRows_() {
  return [
    blankCorrect_(['SCI-SOIL', 1, 'Put the following soil types in the correct order from largest particles to smallest:',
      'Clay, human hair, sand, silt, cornstarch',
      'Sand, human hair, silt, clay, cornstarch',
      'Sand, human hair, clay, silt, cornstarch',
      'Human hair, clay, sand, silt, cornstarch', '', '']),
    blankCorrect_(['SCI-SOIL', 2, 'Which statement is true?',
      'Water moves through sandy soil slower than silty soil.',
      'Water moves through clayey soil faster than sandy soil.',
      'Water moves through sandy soil faster than silty soil.',
      "It doesn't make a difference. Water moves through all soils at the same rate.", '', '']),
    blankCorrect_(['SCI-SOIL', 3, 'Which particle size is best for water-loving plants like rice, water lilies, cattails, and taro?',
      'Soil with small particle sizes, such as clay',
      'Soil with large particle sizes, such as sand',
      'A 3-to-2 mixture of large particle sizes such as sand, and small particle sizes such as clay',
      'Either small or large is good for water-loving plants', '', '']),
    blankCorrect_(['SCI-SOIL', 4, 'Which of the following is NOT a texture of soil?',
      'Sandy', 'Clayey', 'Grainy', 'Sparkly', 'a & b', 'c & d']),
    blankCorrect_(['SCI-SOIL', 5, 'Which texture of soil gives the longest ribbon of soil?',
      'Sandy', 'Silty loam', 'Clay loam', 'Clayey', '', '']),
  ];
}

function coralRows_() {
  return [
    blankCorrect_(['SCI-CORAL', 1, 'What is coral?',
      'Coral is a plant because it uses photosynthesis to grow.',
      'Coral is an animal because it does not make its own food.',
      'Coral is both an animal and a plant because of symbiosis.',
      'Coral is neither a plant nor an animal because of its unique characteristics and physical structures.', '', '']),
    blankCorrect_(['SCI-CORAL', 2, 'What scale is used to measure the acidity of a substance?',
      'pH scale', 'Digital scale', 'Interval scale', 'Acidic scale', '', '']),
    blankCorrect_(['SCI-CORAL', 3, 'True or False: Usually when there is a chemical change, the process can be undone.',
      'True', 'False', '', '', '', '']),
    blankCorrect_(['SCI-CORAL', 4, 'What process does a 3D printer use?',
      'Subtractive process', 'Continuous flow process', 'Selective process', 'Additive process', '', '']),
    blankCorrect_(['SCI-CORAL', 5, 'How can 3D printed coral be helpful for the ocean?',
      'It provides much needed food for some fish.',
      '3D printed coral is bad for the ocean because it is made of plastic.',
      'Eventually with enough 3D printed coral, we will no longer need real coral.',
      'Marine life can live in the 3D printed coral.', '', '']),
  ];
}

function csRows_() {
  return [
    blankCorrect_(['SCI-CS', 1, 'What is the definition of an algorithm?',
      'A command that repeats certain steps over and over',
      'A list of steps that you can follow to finish a task',
      'A device used for storing and processing data',
      'A command given as an if-then statement', '', '']),
    blankCorrect_(['SCI-CS', 2, 'In computer science, what is a program?',
      'The study of computers and computing concepts, including hardware, software, networking, and the Internet',
      'A series of actions completed in a specific order',
      'A show that comes on TV',
      'An algorithm that has been coded into a computer language that can then be run by a machine', '', '']),
    blankCorrect_(['SCI-CS', 3, 'True or False: If a list (or sequence) of directions is incorrect, it is still an algorithm.',
      'True', 'False', '', '', '', '']),
    blankCorrect_(['SCI-CS', 4,
      'In the image below, the Artist has a pencil and is ready to draw. Select the correct algorithm that allows the Artist to draw the diamond.<img src="https://5ninefish.github.io/lesson-quiz/images/cs_q4_diamond.png" style="max-width:140px;display:block;margin:.5rem auto .4rem">',
      'https://5ninefish.github.io/lesson-quiz/images/cs_q4_choice_a.svg',
      'https://5ninefish.github.io/lesson-quiz/images/cs_q4_choice_b.svg',
      'https://5ninefish.github.io/lesson-quiz/images/cs_q4_choice_c.svg',
      '', '', '']),
    blankCorrect_(['SCI-CS', 5, 'For the code in question 4, what command could be used to shorten the repeated lines of code?',
      'Loop', 'Conditional statement', 'Set color', 'None of the above', '', '']),
  ];
}

function astroRows_() {
  return [
    blankCorrect_(['SCI-ASTRO', 1, 'The visible light spectrum…',
      'Is the light that you can see', 'Contains the colors you see in a rainbow',
      'Has wavelengths of 400-700 nm', 'All of the above', '', '']),
    blankCorrect_(['SCI-ASTRO', 2, 'What is refraction?',
      'Computing a fraction twice',
      'The phenomenon of light changing directions due to changes in its transmission medium',
      'The science of reflections', 'The process of factoring out parts of a polynomial', '', '']),
    blankCorrect_(['SCI-ASTRO', 3, 'Other than visible light, what is another form of electromagnetic radiation?',
      'Electrical current', 'Magnetic fields', 'Radio waves', 'None of the above', '', '']),
    blankCorrect_(['SCI-ASTRO', 4, 'Which unit of measurement do astronomers use to measure distances?',
      'Inches', 'Astronomical units', 'Sun years', 'Gigameters', '', '']),
    blankCorrect_(['SCI-ASTRO', 5, 'Do the stars in the night sky ever move?',
      'Yes', 'No', '', '', '', '']),
  ];
}

function healthRows_() {
  return [
    blankCorrect_(['SCI-HEALTH', 1, 'What is the most likely cause of death in the United States?',
      'Stroke', 'Cancer', 'Heart disease', 'Murder', '', '']),
    blankCorrect_(['SCI-HEALTH', 2, 'Which are the correct steps of the scientific method?',
      'Identify a problem, develop a question, make a hypothesis, conduct experiment and draw conclusion',
      'Develop a question, make a hypothesis, conduct experiment, identify a problem, and draw conclusion',
      'Identify a problem, develop a question, conduct experiment, make a hypothesis, and draw a conclusion',
      'Make a hypothesis, identify a problem, develop a question, conduct experiment, draw conclusion', '', '']),
    blankCorrect_(['SCI-HEALTH', 3, 'What is an appropriate hypothesis?',
      'If I run, then my heart rate will increase.',
      'Running is not fun.',
      "I don't like to run because it makes me tired.",
      'People run to stay healthy.', '', '']),
    blankCorrect_(['SCI-HEALTH', 4, 'Which is NOT part of vital signs you should get checked every time you see a doctor?',
      'Pulse rate', 'Blood pressure', 'Eye sight', 'Body temperature', '', '']),
    blankCorrect_(['SCI-HEALTH', 5, 'If your blood pressure is consistently high, how can you reduce it?',
      'Exercise more', 'Eat a balanced diet', 'Stop smoking', 'All of the above', '', '']),
  ];
}

function dmRows_() {
  return [
    blankCorrect_(['SCI-DM', 1, 'Which of the following best describes "Artificial Intelligence" (AI)?',
      'A type of computer hardware that processes information quickly.',
      'Software used for creating digital art and designs.',
      'Complex computer code that follows pre-programmed instructions.',
      'Machines that can learn from data and perform tasks that typically require human intelligence.', '', '']),
    blankCorrect_(['SCI-DM', 2, 'What is the fundamental concept behind how AI is able to generate text, images, or videos?',
      'It uses pre-written scripts and templates.',
      'It learns patterns from large amounts of data.',
      'It directly copies existing human-created content.',
      'It relies on random number generation.', '', '']),
    blankCorrect_(['SCI-DM', 3, 'What does it mean for an AI algorithm to "curate" content, such as on a social media feed?',
      'To delete old or unpopular posts.',
      'To organize and present content based on user data and preferences.',
      'To randomly display all available content.',
      'To allow users to manually select everything they see.', '', '']),
    blankCorrect_(['SCI-DM', 4, 'When comparing generative AI and analytical AI, what is the fundamental difference in their primary function?',
      'Generative AI creates new content, while analytical AI interprets and categorizes existing data.',
      'Generative AI requires more computational power than analytical AI.',
      'Generative AI is primarily used for creative tasks, while analytical AI is used for scientific research.',
      'Generative AI relies on different types of algorithms compared to analytical AI.', '', '']),
    blankCorrect_(['SCI-DM', 5, 'What is the role of a "prompt" when using AI tools for text or image generation?',
      "It's an instruction or input given to the AI to guide its creation.",
      "It's the final output generated by the AI.",
      "It's a technical error that occurs during the AI process.",
      "It's a type of file format used for AI-generated media.", '', '']),
  ];
}

// ─── ACCEPTANCE TESTS (script editor only; never live Hōkūlani book) ─────────
function runAcceptanceTests_() {
  const fails = [];
  function check(cond, msg) { if (!cond) fails.push(msg); }

  check(resolveTestId_('L3') === 'SCI-CS', 'alias L3 → SCI-CS');
  check(resolveTestId_('sci-cs') === 'SCI-CS', 'canonical case');
  check(normalizeUsername_('  X@ProjectHokulani.com ') === 'x@projecthokulani.com', 'email normalize');

  const now = new Date('2026-09-20T19:00:00Z'); // 09:00 HST
  const upcoming = {
    missing: false, manual: 'AUTO',
    openAt: new Date('2026-09-20T19:00:00Z'),
    closeAt: new Date('2026-09-20T21:00:00Z'),
    maxTries: 2, timeLimitSec: 600,
  };
  check(!releaseAllowsStart_(upcoming, new Date('2026-09-20T18:59:00Z')), 'before OpenAt not_released');
  check(releaseAllowsStart_(upcoming, now), 'at OpenAt open');
  check(!releaseAllowsStart_(upcoming, new Date('2026-09-20T21:01:00Z')), 'after CloseAt closed');
  const manualOpen = { missing: false, manual: 'OPEN', openAt: upcoming.openAt, closeAt: upcoming.closeAt };
  check(releaseAllowsStart_(manualOpen, new Date('2026-09-20T21:01:00Z')), 'Manual OPEN overrides CloseAt');
  const hidden = { missing: false, manual: 'AUTO', openAt: null, closeAt: null };
  check(!releaseAllowsStart_(hidden, now), 'empty OpenAt AUTO hidden');
  const missing = { missing: true, manual: 'AUTO' };
  check(releaseAllowsStart_(missing, now), 'missing Releases row legacy open');
  check(!keysVisible_(upcoming, now), 'no keys while OPEN');
  check(keysVisible_({ missing: false, manual: 'CLOSED' }, now), 'keys after CLOSED');
  check(!keysVisible_(missing, now), 'legacy missing does not dump keys');

  const started = new Date(now.getTime() - 630 * 1000);
  check(isTimerExpired_(started, 600, now), '630s is expired (limit+grace)');
  check(!isTimerExpired_(started, 600, new Date(started.getTime() + 629 * 1000)), '629s within grace');
  check(isTimerExpired_(started, 600, new Date(started.getTime() + 630 * 1000)), '630s expired');
  check(remainingSec_(now, 600, new Date(now.getTime() + 100 * 1000)) === 500, 'remaining time');
  check(!isTimerExpired_(now, 0, new Date(now.getTime() + 999999)), 'untimed never expires');

  const qs = [{ num: 1, question: 'q', options: ['a', 'b'] }, { num: 2, question: 'q2', options: ['a', 'b'] }];
  const snap = 'A|B';
  const g = grade_({ '1': 'A', '2': 'A' }, qs, snap);
  check(g.score === 1 && g.total === 2, 'grade from snapshot');
  const stripped = stripCorrect_(g.graded, false);
  check(stripped[0].correct === undefined, 'no correct while OPEN');
  check(stripCorrect_(g.graded, true)[0].correct === 'A', 'correct after close');

  const fp1 = fingerprint_(qs, snap);
  const fp2 = fingerprint_(qs, snap);
  check(fp1 === fp2 && fp1.length === 64, 'fingerprint stable sha256');

  const dual = loadQuestions.__testDual || (function () {
    let hasC = false, hasA = false;
    ['L3', 'SCI-CS'].forEach(function (id) {
      if (id === 'SCI-CS') hasC = true;
      if (id === 'L3') hasA = true;
    });
    return hasC && hasA;
  })();
  check(dual, 'dual L3+SCI-CS is bad bank');

  const cs = csRows_();
  check(cs[3][3].indexOf('cs_q4_choice_a.svg') >= 0, 'CS Q4 image option');
  check(String(cs[0][2]).indexOf('algorithm') >= 0, 'CS Q1 stem frozen');
  check(cs.every(function (r) { return r[9] === ''; }), 'loaders have no keys');

  if (fails.length) {
    Logger.log('FAIL\n' + fails.join('\n'));
    throw new Error(fails.length + ' checks failed: ' + fails.join('; '));
  }
  Logger.log('runAcceptanceTests_: all checks passed');
  return 'ok';
}
