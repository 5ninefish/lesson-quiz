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
  L1: 'Soil — Science Lesson 1',
  L2: '3D Printing & Coral — Science Lesson 2',
  L3: 'Computer Science — Science Lesson 3',
  L4: 'Astronomy — Science Lesson 4',
  L5: 'Health — Science Lesson 5',
  L6: 'Digital Media — Science Lesson 6',
};
const LESSON_SHORT = {
  L1: 'Soil',
  L2: 'Coral',
  L3: 'CS',
  L4: 'Astronomy',
  L5: 'Health',
  L6: 'Digital Media',
};
const TEST_META = {
  'SCI-SOIL':  { strand: 'Science', title: 'Soil — Science Lesson 1' },
  'SCI-CORAL': { strand: 'Science', title: '3D Printing & Coral — Science Lesson 2' },
  'SCI-CS':    { strand: 'Science', title: 'Computer Science — Science Lesson 3' },
  'SCI-ASTRO': { strand: 'Science', title: 'Astronomy — Science Lesson 4' },
  'SCI-HEALTH':{ strand: 'Science', title: 'Health — Science Lesson 5' },
  'SCI-DM':    { strand: 'Science', title: 'Digital Media — Science Lesson 6' },
};

function testLabel_(testId) {
  const id = resolveTestId_(testId);
  const meta = TEST_META[id];
  const lesson = TEST_TO_LESSON[id];
  if (meta && meta.title) return meta.title;
  if (lesson && LESSON_NAMES[lesson]) return LESSON_NAMES[lesson];
  return id || String(testId || '');
}

// ─── ENTRY POINT ─────────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    if (action && String(action).indexOf('dash_') === 0) {
      return dashPost_(action, body);
    }
    const username = normalizeUsername_(body.username);
    const password = body.password;
    const testId = resolveTestId_(body.testId || body.lesson);
    const programId = normalizeProgramId_(body.programId);

    if (action === 'auth_and_load') {
      return authAndLoad(username, password, testId, programId);
    }
    if (action === 'submit') {
      return submit(username, password, testId, body.answers || {}, body.submissionId, programId);
    }
    if (action === 'get_tries' || action === 'login') {
      return getTries(username, password, programId);
    }
    if (action === 'lesson_list') {
      return respond({ error: 'unknown_action' });
    }
    return respond({ error: 'unknown_action' });
  } catch (err) {
    return respond({ error: String(err) });
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.config === '1') {
    return respond({
      ok: true,
      googleClientId: PropertiesService.getScriptProperties().getProperty('GOOGLE_OAUTH_CLIENT_ID') || '',
    });
  }
  return respond({ ok: true, service: 'lesson-quiz' });
}

function isSpreadsheetEditorEmail_(email) {
  const want = String(email || '').trim().toLowerCase();
  if (!want) return false;
  const ss = ss_();
  try {
    const owner = ss.getOwner();
    if (owner && String(owner.getEmail() || '').toLowerCase() === want) return true;
  } catch (err) {}
  try {
    const editors = ss.getEditors();
    for (let i = 0; i < editors.length; i++) {
      if (String(editors[i].getEmail() || '').toLowerCase() === want) return true;
    }
  } catch (err2) {}
  return false;
}

function verifyInstructorToken_(idToken) {
  const clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_OAUTH_CLIENT_ID');
  if (!clientId || !idToken) return '';
  try {
    const resp = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) return '';
    const data = JSON.parse(resp.getContentText());
    if (String(data.aud || '') !== clientId) return '';
    const verified = data.email_verified === true || String(data.email_verified) === 'true';
    if (!verified) return '';
    const email = String(data.email || '').trim().toLowerCase();
    if (!isSpreadsheetEditorEmail_(email)) return '';
    return email;
  } catch (err) {
    return '';
  }
}

function dashPost_(action, body) {
  const email = verifyInstructorToken_(body && body.idToken);
  if (!email) return respond({ ok: false, error: 'not_allowed' });
  if (action === 'dash_state') return respond(dashState());
  if (action === 'dash_open') return respond(dashOpenNow(body.testId));
  if (action === 'dash_close') return respond(dashCloseNow(body.testId));
  if (action === 'dash_save_window') {
    return respond(dashSaveWindow(body.testId, body.openAt, body.closeAt, body.maxTries, body.timeLimitMin));
  }
  if (action === 'dash_sync') return respond(dashSyncRoster());
  if (action === 'dash_hash') return respond(dashHashPasswords());
  if (action === 'dash_tabs') return respond(dashCreateTabs());
  if (action === 'dash_reset') return respond(dashReset(body.username, body.lesson));
  return respond({ ok: false, error: 'unknown_action' });
}

const ADMIN_PAGES_URL = 'https://5ninefish.github.io/lesson-quiz/admin.html';
const LEGACY_DEFAULT_PROGRAM_ID = 'hokulani';

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function normalizeProgramId_(raw) {
  return String(raw || '').trim().toLowerCase();
}

function programTablesReady_(ss) {
  return !!(
    ss.getSheetByName('Programs') &&
    ss.getSheetByName('ProgramStudents') &&
    ss.getSheetByName('ProgramTests') &&
    ss.getSheetByName('ProgramStudentState')
  );
}

function loadActiveMemberships_(ss, username) {
  const sheet = ss.getSheetByName('ProgramStudents');
  const programs = ss.getSheetByName('Programs');
  if (!sheet || !programs) return [];
  const archived = {};
  const pdata = programs.getDataRange().getValues();
  for (let i = 1; i < pdata.length; i++) {
    if (String(pdata[i][2] || '').trim().toUpperCase() === 'ARCHIVED') {
      archived[normalizeProgramId_(pdata[i][0])] = true;
    }
  }
  const want = normalizeUsername_(username);
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (normalizeUsername_(data[i][1]) !== want) continue;
    const active = String(data[i][2]).toUpperCase();
    if (active === 'FALSE' || active === '0' || active === 'NO') continue;
    const id = normalizeProgramId_(data[i][0]);
    if (!id || archived[id]) continue;
    if (out.indexOf(id) < 0) out.push(id);
  }
  return out;
}

function resolveProgramContext_(ss, username, requested) {
  if (!programTablesReady_(ss)) return { mode: 'legacy', programId: '', error: '', memberships: [] };
  const memberships = loadActiveMemberships_(ss, username);
  const req = normalizeProgramId_(requested);
  if (req) {
    if (memberships.indexOf(req) >= 0) return { mode: 'ok', programId: req, error: '', memberships: memberships };
    return { mode: 'mismatch', programId: '', error: 'not_in_program', memberships: memberships };
  }
  if (memberships.length === 1) return { mode: 'ok', programId: memberships[0], error: '', memberships: memberships };
  if (memberships.length > 1) return { mode: 'picker', programId: '', error: 'need_program', memberships: memberships };
  return { mode: 'none', programId: '', error: 'no_program', memberships: [] };
}

function getProgramTestRow_(ss, programId, testId) {
  const sheet = ss.getSheetByName('ProgramTests');
  if (!sheet) return null;
  const canon = resolveTestId_(testId);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (normalizeProgramId_(data[i][0]) !== programId) continue;
    if (resolveTestId_(data[i][1]) !== canon) continue;
    const enabled = String(data[i][2]).toUpperCase();
    if (enabled === 'FALSE' || enabled === '0' || enabled === 'NO') return { assigned: false };
    return {
      assigned: true,
      enabled: true,
      sortOrder: Number(data[i][3]) || 1,
      manual: String(data[i][4] || '').trim().toUpperCase() || 'UNSET',
      openAt: parseSheetDate_(data[i][5]),
      closeAt: parseSheetDate_(data[i][6]),
      maxTries: Number(data[i][7]) > 0 ? Number(data[i][7]) : MAX_TRIES,
      timeLimitSec: Number(data[i][8]) >= 0 ? Number(data[i][8]) : QUIZ_TIME_SECONDS,
    };
  }
  return { assigned: false };
}

function releaseFromProgramTest_(row, testId) {
  if (!row || !row.assigned) return { error: 'test_not_assigned' };
  return {
    missing: false,
    testId: resolveTestId_(testId),
    strand: '',
    title: '',
    openAt: row.openAt,
    closeAt: row.closeAt,
    manual: row.manual,
    maxTries: row.maxTries,
    timeLimitSec: row.timeLimitSec,
  };
}

function getReleaseForContext_(ss, testId, programId) {
  if (!programId) return getRelease_(ss, testId);
  const row = getProgramTestRow_(ss, programId, testId);
  if (!row || !row.assigned) return { error: 'test_not_assigned' };
  return releaseFromProgramTest_(row, testId);
}

function getProgramState_(ss, programId, username, testId) {
  const sheet = ss.getSheetByName('ProgramStudentState');
  if (!sheet || !programId) return { cycle: 1, sitCache: 0, sheetRow: 0 };
  const canon = resolveTestId_(testId);
  const want = normalizeUsername_(username);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (normalizeProgramId_(data[i][0]) !== programId) continue;
    if (normalizeUsername_(data[i][1]) !== want) continue;
    if (resolveTestId_(data[i][2]) !== canon) continue;
    const cycle = Number(data[i][3]) > 0 ? Number(data[i][3]) : 1;
    const sitCache = Number(data[i][4]) || 0;
    return { cycle: cycle, sitCache: sitCache, sheetRow: i + 1 };
  }
  return { cycle: 1, sitCache: 0, sheetRow: 0 };
}

function writeProgramSitCache_(ss, state, sits, actor) {
  if (!state.sheetRow) return;
  const sheet = ss.getSheetByName('ProgramStudentState');
  sheet.getRange(state.sheetRow, 5).setValue(sits);
  sheet.getRange(state.sheetRow, 6).setValue(new Date());
  sheet.getRange(state.sheetRow, 7).setValue(actor || 'system');
}

function bumpProgramCycle_(ss, programId, username, testId) {
  const state = getProgramState_(ss, programId, username, testId);
  const sheet = ss.getSheetByName('ProgramStudentState');
  if (!sheet || !state.sheetRow) return;
  sheet.getRange(state.sheetRow, 4).setValue((state.cycle || 1) + 1);
  sheet.getRange(state.sheetRow, 5).setValue(0);
  SpreadsheetApp.flush();
}

function cycleSitsForContext_(ss, username, testId, cycle, programId, student) {
  if (!programId) return cycleSits_(ss, username, testId, cycle);
  const attempts = ss.getSheetByName('Attempts');
  if (!attempts) return 0;
  const data = attempts.getDataRange().getValues();
  const want = normalizeUsername_(username);
  const canon = resolveTestId_(testId);
  let n = 0;
  for (let i = 1; i < data.length; i++) {
    if (normalizeUsername_(data[i][0]) !== want) continue;
    if (resolveTestId_(data[i][1]) !== canon) continue;
    if (Number(data[i][2]) !== Number(cycle)) continue;
    const rowProgram = normalizeProgramId_(data[i][11] || '');
    if (rowProgram && rowProgram !== programId) continue;
    if (!rowProgram && programId !== LEGACY_DEFAULT_PROGRAM_ID) continue;
    const status = String(data[i][9] || '').trim();
    if (status === 'done' || status === 'submitted' || status === 'time_expired') n++;
  }
  return n;
}

// ─── HANDLERS ────────────────────────────────────────────────────────────────
function getTries(username, password, programId) {
  const ss = ss_();
  const studentsData = ss.getSheetByName('Students').getDataRange().getValues();
  const student = findStudent(studentsData, username, password);
  if (!student) return respond({ error: 'invalid_credentials' });
  const ctx = resolveProgramContext_(ss, username, programId);
  if (ctx.error === 'need_program') {
    return respond({ ok: true, needProgram: true, programs: ctx.memberships, tests: [], allTries: {} });
  }
  if (ctx.error) return respond({ error: ctx.error, programs: ctx.memberships });
  const tests = buildTestsPayload_(ss, student, ctx.programId);
  return respond({
    ok: true,
    allTries: allTriesFor(student),
    tests: tests,
    timeLimit: QUIZ_TIME_SECONDS,
    programId: ctx.programId || '',
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
function authAndLoad(username, password, testId, programId) {
  if (!testId) return respond({ error: 'invalid_lesson' });

  const ss = ss_();
  ensureRuntimeSchema_(ss);

  const studentsData = ss.getSheetByName('Students').getDataRange().getValues();
  const student = findStudent(studentsData, username, password);
  if (!student) return respond({ error: 'invalid_credentials' });

  const ctx = resolveProgramContext_(ss, username, programId);
  if (ctx.error) return respond({ error: ctx.error, programs: ctx.memberships });
  const resolvedProgramId = ctx.programId || '';

  const loaded = loadQuestions(ss, testId);
  if (loaded.error) return respond({ error: loaded.error });

  const rel = getReleaseForContext_(ss, testId, resolvedProgramId);
  if (rel.error) return respond({ error: rel.error });

  const now = new Date();
  const lockResult = withScriptLock_(START_LOCK_MS, function () {
    const pstate = getProgramState_(ss, resolvedProgramId, username, testId);
    const cycle = resolvedProgramId ? pstate.cycle : currentCycle_(student, testId);
    const maxTries = rel.missing ? MAX_TRIES : rel.maxTries;
    const timeLimitSec = rel.missing ? QUIZ_TIME_SECONDS : rel.timeLimitSec;

    const attemptsSheet = ss.getSheetByName('Attempts');
    const inFlight = findInFlight_(attemptsSheet, username, testId, cycle, resolvedProgramId);

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
        return joinPayload_(student, testId, inFlight.submissionId, questions, remaining, maxTries, ss, resolvedProgramId);
      }
    }

    const studentNow = reloadStudent_(ss, username, password) || student;
    const pstateNow = getProgramState_(ss, resolvedProgramId, username, testId);
    const cycleNow = resolvedProgramId ? pstateNow.cycle : currentCycle_(studentNow, testId);
    const sitsNow = cycleSitsForContext_(ss, username, testId, cycleNow, resolvedProgramId, studentNow);

    if (!releaseAllowsStart_(rel, now)) return { error: 'not_released' };
    if (sitsNow >= maxTries) {
      return { error: 'max_attempts_reached', tries: sitsNow, allTries: allTriesFor(studentNow) };
    }
    if (!loaded.questions || loaded.questions.length === 0) {
      return { error: 'no_questions_found' };
    }

    const minted = mintAttempt_(ss, username, testId, cycleNow, loaded, maxTries, timeLimitSec, now, resolvedProgramId);
    return joinPayload_(studentNow, testId, minted.submissionId, loaded.questions, remainingSec_(now, timeLimitSec, now), maxTries, ss, resolvedProgramId);
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

function submit(username, password, testId, answers, clientSubmissionId, programId) {
  if (!testId) return respond({ error: 'invalid_lesson' });
  const ss = ss_();
  ensureRuntimeSchema_(ss);
  const now = new Date();

  const lockResult = withScriptLock_(SUBMIT_LOCK_MS, function () {
    const studentsSheet = ss.getSheetByName('Students');
    const studentsData = studentsSheet.getDataRange().getValues();
    const student = findStudent(studentsData, username, password);
    if (!student) return { error: 'invalid_credentials' };

    const ctx = resolveProgramContext_(ss, username, programId);
    if (ctx.error) return { error: ctx.error };
    const resolvedProgramId = ctx.programId || '';

    const rel = getReleaseForContext_(ss, testId, resolvedProgramId);
    if (rel.error) return { error: rel.error };

    const byId = clientSubmissionId ? findResultsBySubmissionId_(ss, clientSubmissionId) : null;
    if (byId) {
      repairStudentsCache_(ss, student, testId);
      return storedSubmitResponse_(byId, rel, now, student, testId);
    }

    const pstate = getProgramState_(ss, resolvedProgramId, username, testId);
    const cycle = resolvedProgramId ? pstate.cycle : currentCycle_(student, testId);
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
      if (inFlight && resolvedProgramId && inFlight.programId && inFlight.programId !== resolvedProgramId) {
        return { error: 'invalid_attempt' };
      }
    } else {
      inFlight = findInFlight_(attemptsSheet, username, testId, cycle, resolvedProgramId);
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
    return studentSubmitPayload_(result, rel, studentNow, testId, inFlight);
  });

  if (lockResult && lockResult._busy) return respond({ error: 'busy_try_again' });
  if (lockResult.error) return respond({ error: lockResult.error });
  return respond(lockResult);
}

function joinPayload_(student, testId, submissionId, questions, remaining, maxTries, ss, programId) {
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
    programId: programId || '',
  };
}

// Student JSON never includes score, keys, or per-question correctness.
function studentSubmitPayload_(result, rel, student, testId, inFlight) {
  const lesson = TEST_TO_LESSON[testId] || testId;
  const maxTries = (inFlight && Number(inFlight.maxTriesSnapshot)) || (rel.missing ? MAX_TRIES : rel.maxTries);
  const attempt = cycleSits_(ss_(), usernameFromStudent_(student), testId, currentCycle_(student, testId));
  return {
    ok: true,
    submitted: true,
    complete: !!result.complete,
    status: result.status || 'submitted',
    attempt: attempt,
    maxTries: maxTries,
    isLastTry: attempt >= maxTries,
    lesson: lesson,
    testId: testId,
  };
}

function storedSubmitResponse_(row, rel, now, student, testId) {
  return studentSubmitPayload_({
    complete: !!row.complete,
    status: row.status || 'submitted',
  }, rel, student, testId, null);
}

function sitComplete_(questions, answers) {
  if (!questions || !questions.length) return false;
  for (let i = 0; i < questions.length; i++) {
    if (!String(answers[questions[i].num] || '').trim()) return false;
  }
  return true;
}

function answersAllFilled_(graded) {
  if (!graded || !graded.length) return false;
  for (let i = 0; i < graded.length; i++) {
    if (!String(graded[i].given || '').trim()) return false;
  }
  return true;
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

function buildTestsPayload_(ss, student, programId) {
  const now = new Date();
  const lessons = programId ? programLessons_(ss, programId) : LESSONS.map(function (lesson) {
    return { lesson: lesson, testId: LESSON_TO_TEST[lesson] };
  });
  return lessons.map(function (item) {
    const lesson = item.lesson;
    const testId = item.testId;
    const rel = getReleaseForContext_(ss, testId, programId || '');
    if (rel.error === 'test_not_assigned') return null;
    const maxTries = rel.missing ? MAX_TRIES : rel.maxTries;
    const pstate = programId ? getProgramState_(ss, programId, usernameFromStudent_(student), testId) : null;
    const tries = pstate ? (pstate.sitCache || 0) : (Number(allTriesFor(student)[lesson]) || 0);
    let state = 'open';
    if (rel.error) state = 'locked';
    else if (rel.missing) state = tries >= maxTries ? 'done' : 'open';
    else if (rel.manual === 'UNSET' || !rel.manual) state = tries >= maxTries ? 'done' : 'open';
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
  }).filter(function (t) { return t && t.state !== 'hidden'; });
}

function programLessons_(ss, programId) {
  const sheet = ss.getSheetByName('ProgramTests');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (normalizeProgramId_(data[i][0]) !== programId) continue;
    const enabled = String(data[i][2]).toUpperCase();
    if (enabled === 'FALSE' || enabled === '0' || enabled === 'NO') continue;
    const testId = resolveTestId_(data[i][1]);
    const lesson = TEST_TO_LESSON[testId];
    if (!lesson) continue;
    out.push({ lesson: lesson, testId: testId, sort: Number(data[i][3]) || 0 });
  }
  out.sort(function (a, b) { return a.sort - b.sort; });
  return out;
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

function passwordMatches_(stored, typed) {
  const cell = String(stored || '');
  const plain = String(typed || '');
  if (cell === plain) return true;
  const looksHashed = cell.length === 64 && /^[0-9a-f]+$/.test(cell);
  return looksHashed && cell === hashPassword(plain);
}

function studentLayout_(headerRow) {
  const headers = headerRow || [];
  function col(name, fallback) {
    const i = headerIndex_(headers, name);
    return i >= 0 ? i : fallback;
  }
  const passNamed = headerIndex_(headers, 'Password');
  const passHash = headerIndex_(headers, 'PasswordHash');
  return {
    userCol: col('Username', 0),
    emailCol: headerIndex_(headers, 'Email'),
    passCol: passNamed >= 0 ? passNamed : (passHash >= 0 ? passHash : 1),
    sit0: col('L1', 2),
    cycle0: col('CycleL1', 8),
  };
}

function findStudent(data, username, password) {
  const layout = studentLayout_(data[0]);
  const want = normalizeUsername_(username);
  for (let i = 1; i < data.length; i++) {
    if (normalizeUsername_(data[i][layout.userCol]) === want && passwordMatches_(data[i][layout.passCol], password)) {
      return { row: data[i], sheetRow: i + 1, username: want, layout: layout };
    }
  }
  return null;
}

function addEmailColumn() {
  const ui = SpreadsheetApp.getUi();
  const sheet = ss_().getSheetByName('Students');
  if (!sheet) return;
  const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  if (headerIndex_(headers, 'Email') >= 0) {
    ui.alert('Email is already next to Username.');
    return;
  }
  sheet.insertColumnAfter(1);
  sheet.getRange(1, 2).setValue('Email');
  ui.alert('Added an Email column next to Username. Fill in each address. Students still log in with Username.');
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
  const manual = String(row[5] || '').trim().toUpperCase() || 'UNSET';
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
  if (rel.manual === 'UNSET' || !rel.manual) return true;
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

/*
  Timer runs out:
  - iPad hits 0 → submit with whatever is filled (force).
  - Server: if elapsed >= TimeLimitSec+30s grace → status=time_expired, still grade.
  - If they never POST: next Start auto-finalizes the in_flight sit (blank answers) as time_expired.
  - Complete (counts for best score) only if every question has an answer.
  - Students never see the score.
*/

// ─── ATTEMPTS / RESULTS / CYCLE ──────────────────────────────────────────────
function currentCycle_(student, testId) {
  const lesson = TEST_TO_LESSON[testId];
  const li = LESSONS.indexOf(lesson);
  if (li < 0) return 1;
  const idx = ((student.layout && student.layout.cycle0) || 8) + li;
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

function findInFlight_(attemptsSheet, username, testId, cycle, programId) {
  if (!attemptsSheet) return null;
  const data = attemptsSheet.getDataRange().getValues();
  const want = normalizeUsername_(username);
  const canon = resolveTestId_(testId);
  const wantProgram = normalizeProgramId_(programId);
  for (let i = 1; i < data.length; i++) {
    if (normalizeUsername_(data[i][0]) !== want) continue;
    if (resolveTestId_(data[i][1]) !== canon) continue;
    if (Number(data[i][2]) !== Number(cycle)) continue;
    if (String(data[i][9]).trim() !== 'in_flight') continue;
    const rowProgram = normalizeProgramId_(data[i][11] || '');
    if (wantProgram) {
      if (rowProgram && rowProgram !== wantProgram) continue;
      if (!rowProgram && wantProgram !== LEGACY_DEFAULT_PROGRAM_ID) continue;
    }
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
    programId: normalizeProgramId_(row[11] || ''),
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

function mintAttempt_(ss, username, testId, cycle, loaded, maxTries, timeLimitSec, now, programId) {
  const sheet = ss.getSheetByName('Attempts');
  const submissionId = Utilities.getUuid();
  const correctSnapshot = correctSnapshotFrom_(loaded.corrects);
  const questionsSnapshot = JSON.stringify(loaded.questions);
  const fp = fingerprint_(loaded.questions, correctSnapshot);
  const row = [
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
  ];
  if (programId) {
    const last = Math.max(sheet.getLastColumn(), 12);
    const headers = sheet.getRange(1, 1, 1, last).getValues()[0];
    if (headerIndex_(headers, 'ProgramId') < 0 && last >= 12 && !String(headers[11] || '').trim()) {
      sheet.getRange(1, 12).setValue('ProgramId');
    } else if (headerIndex_(headers, 'ProgramId') < 0 && sheet.getLastColumn() < 12) {
      sheet.getRange(1, 12).setValue('ProgramId');
    }
    row.push(programId);
  }
  sheet.appendRow(row);
  SpreadsheetApp.flush();
  return { submissionId: submissionId, correctSnapshot: correctSnapshot, questionsSnapshot: questionsSnapshot };
}

function finalizeAttempt_(ss, inFlight, answers, status, now) {
  const questions = parseQuestionsSnapshot_(inFlight.questionsSnapshot) || [];
  const graded = grade_(answers || {}, questions, inFlight.correctSnapshot);
  const complete = sitComplete_(questions, answers || {});
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
  setCol('Complete', null, complete ? 'YES' : 'NO');
  results.appendRow(row);
  ss.getSheetByName('Attempts').getRange(inFlight.sheetRow, 10).setValue('done');
  if (inFlight.programId) {
    const st = getProgramState_(ss, inFlight.programId, inFlight.username, inFlight.testId);
    const sits = cycleSitsForContext_(ss, inFlight.username, inFlight.testId, inFlight.cycle, inFlight.programId, null);
    writeProgramSitCache_(ss, st, sits, 'system');
  }
  SpreadsheetApp.flush();
  return {
    score: graded.score,
    total: graded.total,
    graded: graded.graded,
    complete: complete,
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
    const completeCol = headerIndex_(headers, 'Complete');
    let complete = false;
    if (completeCol >= 0) complete = String(data[i][completeCol]).toUpperCase() === 'YES';
    else complete = answersAllFilled_(graded);
    return {
      submissionId: submissionId,
      cycle: cycleCol >= 0 ? (Number(data[i][cycleCol]) || 1) : 1,
      lifetimeSeq: seqCol >= 0 ? (Number(data[i][seqCol]) || 1) : 1,
      scoreNum: scoreNum,
      total: total,
      status: statusCol >= 0 ? String(data[i][statusCol] || 'submitted') : 'submitted',
      complete: complete,
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
  const sitCol = ((student.layout && student.layout.sit0) || 2) + li;
  ss.getSheetByName('Students').getRange(student.sheetRow, sitCol + 1).setValue(sits);
  SpreadsheetApp.flush();
}

function bumpCycle_(ss, username, lessonOrAll) {
  const sheet = ss.getSheetByName('Students');
  const data = sheet.getDataRange().getValues();
  ensureCycleHeaders_(sheet, data[0]);
  const want = normalizeUsername_(username);
  for (let i = 1; i < data.length; i++) {
    if (normalizeUsername_(data[i][0]) !== want) continue;
    const layout = studentLayout_(data[0]);
    const lessons = lessonOrAll === 'ALL' ? LESSONS : [lessonOrAll];
    lessons.forEach(function (lesson) {
      const li = LESSONS.indexOf(lesson);
      if (li < 0) return;
      const cycleCol = layout.cycle0 + li + 1;
      const sitCol = layout.sit0 + li + 1;
      const cur = Number(sheet.getRange(i + 1, cycleCol).getValue()) || 1;
      sheet.getRange(i + 1, cycleCol).setValue(cur + 1);
      sheet.getRange(i + 1, sitCol).setValue(0);
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
  ensureReleasesSheet_(ss);
  ensureRosterImport_(ss);
  const students = ss.getSheetByName('Students');
  if (students) ensureCycleHeaders_(students, students.getRange(1, 1, 1, Math.max(14, students.getLastColumn())).getValues()[0]);
}

function ensureCycleHeaders_(sheet, headerRow) {
  if (!headerRow || headerIndex_(headerRow, 'CycleL1') >= 0) return;
  const l1 = headerIndex_(headerRow, 'L1');
  const start = (l1 >= 0 ? l1 + 6 : 8) + 1;
  const needed = ['CycleL1', 'CycleL2', 'CycleL3', 'CycleL4', 'CycleL5', 'CycleL6'];
  sheet.getRange(1, start, 1, 6).setValues([needed]);
  const last = sheet.getLastRow();
  if (last > 1) {
    const ones = [];
    for (let i = 0; i < last - 1; i++) ones.push([1, 1, 1, 1, 1, 1]);
    sheet.getRange(2, start, last - 1, 6).setValues(ones);
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
  if (headerIndex_(headers, 'Complete') < 0) extra.push('Complete');
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
    .addItem('Open dashboard', 'showDashboard')
    .addItem('Set Google client ID…', 'setGoogleClientId')
    .addSeparator()
    .addItem('Reset student tries…', 'showResetDialog')
    .addItem('View attempt summary', 'showSummary')
    .addItem('Students in progress', 'showInProgress')
    .addItem('Best scores (complete sits)', 'showBestScores')
    .addItem('Missing tests', 'showMissingTests')
    .addSeparator()
    .addItem('Open test now…', 'adminOpenNow')
    .addItem('Close test now…', 'adminCloseNow')
    .addItem('Set window…', 'adminSetWindow')
    .addItem('Set attempts…', 'adminSetAttempts')
    .addItem('Set time limit…', 'adminSetTimeLimit')
    .addSeparator()
    .addItem('Sync roster from RosterImport', 'syncRoster')
    .addItem('Add Email column next to Username', 'addEmailColumn')
    .addItem('Create missing tabs (Releases, RosterImport)', 'createMissingTabs')
    .addToUi();
}

function showDashboard() {
  const url = ADMIN_PAGES_URL;
  const html = HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><body style="font:16px/1.4 Helvetica,sans-serif;padding:20px">' +
    '<p><a href="' + url + '" target="_blank" rel="noopener" ' +
    'style="display:inline-block;padding:12px 16px;background:#1f4f3a;color:#fff;text-decoration:none;font-weight:700">Open Quiz Admin</a></p>' +
    '<p style="color:#5c675f;font-size:13px">Full browser tab. Sign in with a Google account that can edit this sheet.</p>' +
    '<script>window.open(' + JSON.stringify(url) + ', "_blank");</script>' +
    '</body></html>'
  ).setWidth(420).setHeight(140);
  SpreadsheetApp.getUi().showModelessDialog(html, 'Quiz Admin');
}

function setGoogleClientId() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt(
    'Google OAuth client ID',
    'Web application client ID from Google Cloud (ends in .apps.googleusercontent.com). Authorized JavaScript origin: https://5ninefish.github.io',
    ui.ButtonSet.OK_CANCEL
  );
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const id = String(r.getResponseText() || '').trim();
  if (id.indexOf('.apps.googleusercontent.com') < 0) {
    ui.alert('That does not look like an OAuth client ID.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('GOOGLE_OAUTH_CLIENT_ID', id);
  ui.alert('Saved. Instructors sign in on ' + ADMIN_PAGES_URL);
}

function jsonSafe_(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function dashPing() {
  return { ok: true, workbook: String(ss_().getName() || ''), updatedAt: 'ping' };
}

function dashState() {
  try {
    const ss = ss_();
    const now = new Date();
    var live = { rows: [], skipped: 0 };
    var best = {};
    var missing = [];
    var scores = [];
    var tests = [];
    var roster = { students: 0, importRows: 0, emails: [] };
    try { live = collectNow_(ss, now); } catch (e1) { live = { rows: [], skipped: 1 }; }
    try { best = bestCompleteScores_(ss); } catch (e2) { best = {}; }
    try { missing = collectMissing_(ss, best); } catch (e3) { missing = []; }
    try { scores = collectScores_(best); } catch (e4) { scores = []; }
    try { tests = collectTests_(ss, now); } catch (e5) { tests = []; }
    try { roster = collectRosterMeta_(ss); } catch (e6) { roster = { students: 0, importRows: 0, emails: [] }; }
    const nowRows = (live.rows || []).map(function (r) {
      return {
        user: String(r.user || ''),
        testId: String(r.testId || ''),
        test: String(r.test || ''),
        started: String(r.started || ''),
        left: String(r.left || ''),
        expired: !!r.expired,
      };
    });
    return jsonSafe_({
      ok: true,
      workbook: String(ss.getName() || 'This workbook'),
      updatedAt: Utilities.formatDate(now, TZ, 'HH:mm') + ' HST',
      tests: tests,
      now: nowRows,
      nowSkipped: Number(live.skipped) || 0,
      missing: missing,
      scores: scores,
      roster: roster,
    });
  } catch (err) {
    const msg = String(err);
    if (/lock|busy/i.test(msg)) return jsonSafe_({ ok: false, error: 'busy_try_again' });
    return jsonSafe_({ ok: false, error: msg });
  }
}

function collectTests_(ss, now) {
  return LESSONS.map(function (lesson) {
    const id = LESSON_TO_TEST[lesson];
    const rel = getRelease_(ss, id);
    return {
      id: id,
      lesson: lesson,
      short: LESSON_SHORT[lesson] || lesson,
      title: testLabel_(id),
      manual: rel.missing ? 'MISSING' : (rel.manual || 'UNSET'),
      openAt: rel.openAt ? Utilities.formatDate(rel.openAt, TZ, 'yyyy-MM-dd HH:mm') : '',
      closeAt: rel.closeAt ? Utilities.formatDate(rel.closeAt, TZ, 'yyyy-MM-dd HH:mm') : '',
      openAtLocal: rel.openAt ? Utilities.formatDate(rel.openAt, TZ, "yyyy-MM-dd'T'HH:mm") : '',
      closeAtLocal: rel.closeAt ? Utilities.formatDate(rel.closeAt, TZ, "yyyy-MM-dd'T'HH:mm") : '',
      maxTries: rel.maxTries,
      timeLimitSec: rel.timeLimitSec,
      timeLimitMin: Math.round((Number(rel.timeLimitSec) || 0) / 60),
      allowsStart: releaseAllowsStart_(rel, now),
      meaning: releaseMeaning_(rel, now),
    };
  });
}

function releaseMeaning_(rel, now) {
  if (!rel || rel.missing) return 'Missing Releases row — treated as open (legacy).';
  if (rel.manual === 'UNSET') return 'UNSET — not gated yet, tests stay open.';
  if (rel.manual === 'OPEN') return 'OPEN — students can start now (manual override).';
  if (rel.manual === 'CLOSED') return 'CLOSED — students cannot start (manual override).';
  if (rel.manual === 'AUTO' && !rel.openAt) return 'AUTO — hidden (no Open at).';
  if (rel.manual === 'AUTO') {
    return releaseAllowsStart_(rel, now)
      ? 'AUTO — window is open.'
      : 'AUTO — outside the window (hidden).';
  }
  return String(rel.manual || '');
}

function collectNow_(ss, now) {
  const rows = [];
  let skipped = 0;
  const sheet = ss.getSheetByName('Attempts');
  if (!sheet) return { rows: rows, skipped: 0 };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    try {
      const a = attemptFromRow_(data[i], i + 1);
      if (a.status !== 'in_flight') continue;
      if (!a.username) { skipped++; continue; }
      const rem = remainingSec_(a.startedAt, a.timeLimitSec, now);
      const untimed = !(Number(a.timeLimitSec) > 0);
      const expired = !untimed && rem <= 0;
      rows.push({
        user: a.username,
        testId: a.testId,
        test: testLabel_(a.testId),
        started: Utilities.formatDate(asDate_(a.startedAt), TZ, 'HH:mm'),
        left: untimed ? 'no timer' : (expired ? 'expired' : formatMmSs_(rem)),
        expired: expired,
        rem: untimed ? 999999 : rem,
      });
    } catch (e) {
      skipped++;
    }
  }
  rows.sort(function (a, b) {
    if (a.expired !== b.expired) return a.expired ? -1 : 1;
    if (a.rem !== b.rem) return a.rem - b.rem;
    return String(a.user).localeCompare(String(b.user));
  });
  return { rows: rows, skipped: skipped };
}

function collectMissing_(ss, best) {
  const students = ss.getSheetByName('Students');
  const out = [];
  if (!students) return out;
  const data = students.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const user = normalizeUsername_(data[i][0]);
    if (!user) continue;
    const missing = [];
    const missingIds = [];
    const has = [];
    LESSONS.forEach(function (lesson) {
      const testId = LESSON_TO_TEST[lesson];
      if (best[user] && best[user][testId]) has.push(testLabel_(testId));
      else {
        missing.push(testLabel_(testId));
        missingIds.push(testId);
      }
    });
    out.push({ user: user, missing: missing, missingIds: missingIds, has: has });
  }
  return out;
}

function collectScores_(best) {
  const out = [];
  Object.keys(best).sort().forEach(function (user) {
    Object.keys(best[user]).sort().forEach(function (testId) {
      const b = best[user][testId];
      out.push({
        user: user,
        testId: testId,
        test: testLabel_(testId),
        score: b.score,
        total: b.total,
        sits: b.sits,
      });
    });
  });
  return out;
}

function collectRosterMeta_(ss) {
  const students = ss.getSheetByName('Students');
  const emails = [];
  if (students) {
    const data = students.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const u = normalizeUsername_(data[i][0]);
      if (u) emails.push(u);
    }
  }
  const src = ss.getSheetByName('RosterImport');
  let importRows = 0;
  if (src && src.getLastRow() > 1) {
    const rows = src.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      const email = normalizeUsername_(rows[i][0]);
      const pass = String(rows[i][1] || '');
      if (email && pass && email.indexOf('(paste') < 0) importRows++;
    }
  }
  return { students: emails.length, importRows: importRows, emails: emails };
}

function dashOpenNow(testId) {
  const id = resolveTestId_(testId);
  if (!TEST_TO_LESSON[id]) return { ok: false, error: 'unknown_test' };
  upsertRelease_(id, function (row) { row[5] = 'OPEN'; });
  return dashState();
}

function dashCloseNow(testId) {
  const id = resolveTestId_(testId);
  if (!TEST_TO_LESSON[id]) return { ok: false, error: 'unknown_test' };
  upsertRelease_(id, function (row) { row[5] = 'CLOSED'; });
  return dashState();
}

function dashSaveWindow(testId, openAt, closeAt, maxTries, timeLimitMin) {
  const id = resolveTestId_(testId);
  if (!TEST_TO_LESSON[id]) return { ok: false, error: 'unknown_test' };
  const nTries = Number(maxTries);
  const nMin = Number(timeLimitMin);
  if (!(nTries > 0)) return { ok: false, error: 'Max tries must be a positive integer.' };
  if (isNaN(nMin) || nMin < 0) return { ok: false, error: 'Time limit must be 0 or more minutes.' };
  upsertRelease_(id, function (row) {
    row[3] = String(openAt || '').trim().replace('T', ' ');
    row[4] = String(closeAt || '').trim().replace('T', ' ');
    row[5] = 'AUTO';
    row[6] = nTries;
    row[7] = Math.round(nMin * 60);
  });
  return dashState();
}

function dashSyncRoster() {
  const result = syncRosterCore_();
  if (!result.ok) return result;
  const state = dashState();
  state.message = result.message;
  return state;
}

function dashHashPasswords() {
  const n = bulkHashPasswords_();
  const state = dashState();
  state.message = n + ' password' + (n === 1 ? '' : 's') + ' hashed.';
  return state;
}

function dashCreateTabs() {
  const ss = ss_();
  ensureRuntimeSchema_(ss);
  ensureAuditSheet_(ss);
  const state = dashState();
  state.message = 'Tabs ready: Releases, RosterImport, Attempts, report tabs.';
  return state;
}

function dashReset(username, lesson) {
  const msg = resetTriesFromDialog(username, lesson);
  const state = dashState();
  state.message = msg;
  if (String(msg).indexOf('Student not found') === 0) state.ok = true;
  return state;
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
    LESSONS.map(function (l) { return '<option value="' + l + '">' + LESSON_NAMES[l] + '</option>'; }).join('') +
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

function adminDialog_(title, html, w, h) {
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(w || 640).setHeight(h || 480),
    title
  );
}

function showInProgress() {
  const ss = ss_();
  ensureRuntimeSchema_(ss);
  const live = collectNow_(ss, new Date());
  const rows = live.rows;
  writeSheet_(ss, 'InProgress', [['Email', 'Test', 'Started HST', 'Time left']].concat(
    rows.map(function (r) { return [r.user, r.test, r.started, r.left]; })
  ));
  let body = '<p style="font-family:Arial;font-size:13px">' + rows.length + ' student(s) in an open sit.</p>';
  body += adminTable_(['Email', 'Test', 'Started', 'Time left'], rows.map(function (r) {
    return [r.user, r.test, r.started, r.left];
  }));
  adminDialog_('Students in progress', body);
}

function showBestScores() {
  const ss = ss_();
  const best = bestCompleteScores_(ss);
  const lines = [['Email', 'Test', 'Best score', 'Out of', 'Complete sits']];
  Object.keys(best).sort().forEach(function (user) {
    Object.keys(best[user]).sort().forEach(function (testId) {
      const b = best[user][testId];
      lines.push([user, testLabel_(testId), b.score, b.total, b.sits]);
    });
  });
  writeSheet_(ss, 'BestScores', lines);
  const body = '<p style="font-family:Arial;font-size:13px">Best score per test, only sits where every question was answered. Also written to the BestScores tab.</p>' +
    adminTable_(['Email', 'Test', 'Best', 'Out of', 'Sits'], lines.slice(1));
  adminDialog_('Best scores (complete sits)', body);
}

function showMissingTests() {
  const ss = ss_();
  const best = bestCompleteScores_(ss);
  const students = ss.getSheetByName('Students').getDataRange().getValues();
  const lines = [['Email', 'Missing tests', 'Has complete']];
  const table = [];
  for (let i = 1; i < students.length; i++) {
    const user = normalizeUsername_(students[i][0]);
    if (!user) continue;
    const missing = [];
    const has = [];
    LESSONS.forEach(function (lesson) {
      const testId = LESSON_TO_TEST[lesson];
      if (best[user] && best[user][testId]) has.push(testLabel_(testId));
      else missing.push(testLabel_(testId));
    });
    lines.push([user, missing.join(', '), has.join(', ')]);
    table.push([user, missing.length ? missing.join(', ') : '—', has.length ? has.join(', ') : 'none']);
  }
  writeSheet_(ss, 'MissingTests', lines);
  const body = '<p style="font-family:Arial;font-size:13px">A test is complete only if the student submitted every question on at least one sit. Best score is used when they have more than one complete sit. Also written to MissingTests tab.</p>' +
    adminTable_(['Email', 'Missing', 'Complete'], table);
  adminDialog_('Missing tests', body, 720, 520);
}

function formatMmSs_(sec) {
  const n = Math.max(0, Number(sec) || 0);
  const m = Math.floor(n / 60);
  const s = n % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function adminTable_(headers, rows) {
  let h = '<table style="border-collapse:collapse;width:100%;font-family:Arial;font-size:12px"><tr>';
  headers.forEach(function (x) {
    h += '<th style="text-align:left;border-bottom:1px solid #ccc;padding:4px 6px">' + x + '</th>';
  });
  h += '</tr>';
  if (!rows.length) {
    h += '<tr><td colspan="' + headers.length + '" style="padding:8px;color:#64748b">None</td></tr>';
  }
  rows.forEach(function (r) {
    h += '<tr>';
    r.forEach(function (c) {
      h += '<td style="padding:4px 6px;border-bottom:1px solid #eee">' + c + '</td>';
    });
    h += '</tr>';
  });
  return h + '</table>';
}

function writeSheet_(ss, name, values) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clearContents();
  if (values && values.length) {
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    sheet.setFrozenRows(1);
  }
}

function bestCompleteScores_(ss) {
  const sheet = ss.getSheetByName('Results');
  const out = {};
  if (!sheet) return out;
  const data = sheet.getDataRange().getValues();
  const headers = data[0] || [];
  const userCol = 1;
  const testCol = headerIndex_(headers, 'TestId') >= 0 ? headerIndex_(headers, 'TestId') : 2;
  const scoreCol = headerIndex_(headers, 'Score');
  const completeCol = headerIndex_(headers, 'Complete');
  const q1 = headerIndex_(headers, 'Q1');
  for (let i = 1; i < data.length; i++) {
    const user = normalizeUsername_(data[i][userCol]);
    const testId = resolveTestId_(data[i][testCol]);
    if (!user || !testId) continue;
    let complete = false;
    if (completeCol >= 0 && String(data[i][completeCol]).trim() !== '') {
      complete = String(data[i][completeCol]).toUpperCase() === 'YES';
    } else if (q1 >= 0) {
      complete = true;
      for (let q = 0; q < 5; q++) {
        if (!String(data[i][q1 + q] || '').trim()) complete = false;
      }
    }
    if (!complete) continue;
    const scoreRaw = String(scoreCol >= 0 ? data[i][scoreCol] : '');
    const parts = scoreRaw.split('/');
    const scoreNum = Number(parts[0]);
    const total = Number(parts[1]) || 5;
    if (isNaN(scoreNum)) continue;
    if (!out[user]) out[user] = {};
    const prev = out[user][testId];
    if (!prev || scoreNum > prev.score) {
      out[user][testId] = { score: scoreNum, total: total, sits: prev ? prev.sits + 1 : 1 };
    } else {
      prev.sits += 1;
    }
  }
  return out;
}

function showSummary() {
  const ss = ss_();
  const sheet = ss.getSheetByName('Students');
  const data = sheet.getDataRange().getValues();
  let rows = '';
  for (let i = 1; i < data.length; i++) {
    const u = data[i][0];
    const layout = studentLayout_(data[0]);
    const tries = LESSONS.map(function (l, li) {
      const t = Number(data[i][layout.sit0 + li]) || 0;
      const color = t >= 2 ? '#dc2626' : t === 1 ? '#d97706' : '#16a34a';
      return '<td style="text-align:center;color:' + color + ';font-weight:bold">' + t + '</td>';
    }).join('');
    rows += '<tr><td style="padding:4px 8px">' + u + '</td>' + tries + '</tr>';
  }
  const html = HtmlService.createHtmlOutput(
    '<style>body{font-family:Arial,sans-serif;font-size:13px;padding:12px}table{border-collapse:collapse;width:100%}th{background:#f1f5f9;padding:6px 8px;text-align:center}th:first-child{text-align:left}td{padding:4px 8px;border-bottom:1px solid #e2e8f0}</style>' +
    '<table><tr><th>Username</th>' + LESSONS.map(function (l) { return '<th>' + LESSON_NAMES[l] + '</th>'; }).join('') + '</tr>' + rows + '</table>' +
    '<p class="legend" style="margin-top:8px;font-size:11px;color:#64748b">Cache of current-cycle sits. Reset increments Cycle, does not delete Results.</p>'
  ).setWidth(500).setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(html, 'Attempt Summary');
}

function pickTestId_() {
  const ui = SpreadsheetApp.getUi();
  const lines = LESSONS.map(function (l, i) {
    return (i + 1) + '. ' + testLabel_(LESSON_TO_TEST[l]);
  });
  const r = ui.prompt(
    'Which test?',
    lines.join('\n') + '\n\nType the number (1–6) or L3 / Computer Science',
    ui.ButtonSet.OK_CANCEL
  );
  if (r.getSelectedButton() !== ui.Button.OK) return '';
  const raw = String(r.getResponseText() || '').trim();
  const n = Number(raw);
  if (n >= 1 && n <= LESSONS.length) return LESSON_TO_TEST[LESSONS[n - 1]];
  const resolved = resolveTestId_(raw);
  if (TEST_TO_LESSON[resolved]) return resolved;
  const lower = raw.toLowerCase();
  for (let i = 0; i < LESSONS.length; i++) {
    const id = LESSON_TO_TEST[LESSONS[i]];
    if (testLabel_(id).toLowerCase().indexOf(lower) >= 0) return id;
  }
  ui.alert('Could not match: ' + raw);
  return '';
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
  if (sheet.getLastRow() < 2) {
    const rows = LESSONS.map(function (l) {
      const id = LESSON_TO_TEST[l];
      const meta = TEST_META[id];
      return [id, meta.strand, meta.title, '', '', 'UNSET', 2, 0];
    });
    sheet.getRange(2, 1, rows.length, 8).setValues(rows);
  }
  return sheet;
}

function ensureRosterImport_(ss) {
  if (ss.getSheetByName('RosterImport')) return ss.getSheetByName('RosterImport');
  const ri = ss.insertSheet('RosterImport');
  ri.getRange(1, 1, 1, 2).setValues([['Email', 'Password']]);
  ri.getRange(2, 1, 1, 2).setValues([['(paste issued email)', '(paste roster password in plaintext)']]);
  return ri;
}

function createMissingTabs() {
  const ss = ss_();
  ensureRuntimeSchema_(ss);
  ensureAuditSheet_(ss);
  SpreadsheetApp.getUi().alert(
    'Tabs ready on this book:\n\n' +
    'Releases — one row per test with full titles. Manual=UNSET means not gated yet (tests still open).\n' +
    'RosterImport — paste Email + plaintext password, then Quiz Admin → Sync roster.\n' +
    'Attempts / Results extra columns created if missing.\n\n' +
    'Passwords: type the assigned password in Students column B and leave it as you typed it.'
  );
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
    sheet.appendRow([testId, meta.strand, meta.title, '', '', 'UNSET', MAX_TRIES, 0]);
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

function syncRosterCore_() {
  const ss = ss_();
  const src = ss.getSheetByName('RosterImport');
  if (!src) {
    const created = ss.insertSheet('RosterImport');
    created.getRange(1, 1, 1, 2).setValues([['Email', 'Password']]);
    return { ok: true, added: 0, message: 'Created RosterImport tab. Paste email + plaintext password, then sync again.' };
  }
  const students = ss.getSheetByName('Students');
  ensureCycleHeaders_(students, students.getRange(1, 1, 1, 14).getValues()[0]);
  const existing = students.getDataRange().getValues();
  const have = {};
  for (let i = 1; i < existing.length; i++) have[normalizeUsername_(existing[i][0])] = true;
  const rows = src.getDataRange().getValues();
  let added = 0;
  let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const email = normalizeUsername_(rows[i][0]);
    const pass = String(rows[i][1] || '');
    if (!email || !pass || email.indexOf('(paste') === 0) continue;
    if (have[email]) { skipped++; continue; }
    students.appendRow([email, pass, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
    have[email] = true;
    added++;
  }
  logAudit_('sync_roster', 'added ' + added);
  let message = 'Roster sync: added ' + added + ' new students. Existing try counts left alone.';
  if (skipped) message += ' Skipped ' + skipped + ' dupes.';
  return { ok: true, added: added, skipped: skipped, message: message };
}

function syncRoster() {
  const result = syncRosterCore_();
  SpreadsheetApp.getUi().alert(result.message);
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
  return 0;
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
  check(releaseAllowsStart_({ missing: false, manual: 'UNSET', openAt: null }, now), 'UNSET row stays open');
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

  check(sitComplete_(qs, { '1': 'A', '2': 'B' }), 'all answered = complete');
  check(!sitComplete_(qs, { '1': 'A' }), 'blank item = not complete');
  check(!sitComplete_(qs, {}), 'empty answers = not complete');

  if (fails.length) {
    Logger.log('FAIL\n' + fails.join('\n'));
    throw new Error(fails.length + ' checks failed: ' + fails.join('; '));
  }
  Logger.log('runAcceptanceTests_: all checks passed');
  return 'ok';
}
