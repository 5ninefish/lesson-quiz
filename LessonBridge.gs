// Teaching lessons on the existing portal.
// Lesson progress never reads or writes Attempts, ProgramStudentState, or sit counts.
// Official PRE and POST stay on auth_and_load / submit.
// sci-sust@2026-10 is not linked to SCI-CORAL. That bank is 3D printing and coral.

const TEACHING_PACKAGES = [
  package_('sci-cs@2026-10', 'Computer Science', 'PUBLISHED', 'SCI-CS', 'SCI-CS', 'sci-cs', [
    ['start', 'Start'], ['algorithms', 'Algorithms'], ['blocks', 'Building blocks'], ['weave', 'Weave'],
    ['parts', 'Parts'], ['draw', 'Draw'], ['app', 'App'], ['wrap', 'Wrap'],
  ]),
  package_('sci-health@2026-10', 'Health', 'PUBLISHED', 'SCI-HEALTH', 'SCI-HEALTH', 'sci-health', [
    ['start', 'Start'], ['heart', 'Heart'], ['method', 'Method'], ['rest', 'Rest'],
    ['move', 'Move'], ['data', 'Data'], ['community', 'Community'], ['wrap', 'Wrap'],
  ]),
  package_('sci-astro@2026-10', 'Astronomy', 'PUBLISHED', 'SCI-ASTRO', 'SCI-ASTRO', 'sci-astro', [
    ['start', 'Start'], ['sky', 'Sky'], ['place', 'Place'], ['lines', 'Star lines'],
    ['time', 'Time'], ['light', 'Light'], ['scope', 'Spectroscope'], ['wrap', 'Wrap'],
  ]),
  package_('sci-soil@2026-10', 'Soil', 'PUBLISHED', 'SCI-SOIL', 'SCI-SOIL', 'sci-soil', [
    ['start', 'Start'], ['texture', 'Texture'], ['ribbon', 'Ribbon'], ['water', 'Water'],
    ['slope', 'Slope'], ['life', 'Life'], ['land', 'Land'], ['wrap', 'Wrap'],
  ]),
  package_('sci-sust@2026-10', 'Sustainability', 'UNLINKED', '', '', 'sci-sust', [
    ['start', 'Start'], ['coral', 'Coral'], ['species', 'Species'], ['harm', 'Harm'],
    ['record', 'Record'], ['shape', 'Shape'], ['change', 'Change'], ['wrap', 'Wrap'],
  ]),
];

function package_(lessonId, title, status, preTestId, postTestId, slug, topics) {
  return {
    lessonId: lessonId,
    title: title,
    version: '2026-10',
    url: 'https://5ninefish.github.io/lesson-quiz/lessons/' + slug + '/',
    status: status,
    preTestId: preTestId,
    postTestId: postTestId,
    topics: topics.map(function (pair) { return { id: pair[0], title: pair[1] }; }),
  };
}

function teachingPackage_(lessonId) {
  const want = String(lessonId || '').trim();
  for (let i = 0; i < TEACHING_PACKAGES.length; i++) {
    if (TEACHING_PACKAGES[i].lessonId === want) return TEACHING_PACKAGES[i];
  }
  return null;
}

function lessonHeaders_() {
  return ['LessonId', 'Title', 'Version', 'URL', 'Status'];
}

function programLessonHeaders_() {
  return ['ProgramId', 'LessonId', 'Enabled', 'SortOrder', 'LessonVersion', 'OpenAt', 'CloseAt', 'UpdatedAtHST', 'UpdatedBy', 'RequirePre'];
}

function progressHeaders_() {
  return ['ProgramId', 'Username', 'LessonId', 'LessonVersion', 'TopicId', 'Status', 'Artifact', 'SupportFlag', 'UpdatedAt'];
}

function ensureNamedSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    SpreadsheetApp.flush();
    return sheet;
  }
  const first = String(sheet.getRange(1, 1).getValue() || '').trim();
  if (!first) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    SpreadsheetApp.flush();
  }
  return sheet;
}

function commandRegisterLessons_(ss, auth) {
  ensureNamedSheet_(ss, 'LessonCatalog', lessonHeaders_());
  ensureNamedSheet_(ss, 'ProgramLessons', programLessonHeaders_());
  ensureNamedSheet_(ss, 'LessonProgress', progressHeaders_());
  const sheet = ss.getSheetByName('LessonCatalog');
  const data = sheet.getDataRange().getValues();
  const have = {};
  for (let i = 1; i < data.length; i++) have[String(data[i][0] || '')] = true;
  const ops = [];
  const added = [];
  TEACHING_PACKAGES.forEach(function (pack) {
    if (have[pack.lessonId]) return;
    added.push(pack.lessonId);
    ops.push({
      kind: 'append',
      sheet: 'LessonCatalog',
      values: [pack.lessonId, pack.title, pack.version, pack.url, pack.status],
    });
  });
  return {
    ok: true,
    ops: ops,
    programId: '',
    targetKey: 'lesson-catalog',
    detail: 'register ' + added.join(','),
    result: { added: added, actor: auth.email },
  };
}

function commandSaveProgramLessons_(ss, auth, body) {
  const programId = normalizeProgramId_(body.programId);
  const programs = ss.getSheetByName('Programs');
  if (!programs || !programId) return { ok: false, error: 'invalid_program' };
  const pdata = programs.getDataRange().getValues();
  let known = false;
  for (let i = 1; i < pdata.length; i++) {
    if (normalizeProgramId_(pdata[i][0]) === programId) known = true;
  }
  if (!known) return { ok: false, error: 'not_found' };
  ensureNamedSheet_(ss, 'LessonCatalog', lessonHeaders_());
  const links = ensureNamedSheet_(ss, 'ProgramLessons', programLessonHeaders_());
  const header = links.getRange(1, 1, 1, 10).getValues()[0];
  if (String(header[9] || '').trim() !== 'RequirePre') {
    links.getRange(1, 10).setValue('RequirePre');
    SpreadsheetApp.flush();
  }
  const incoming = body.lessons || [];
  const seen = {};
  for (let i = 0; i < incoming.length; i++) {
    const pack = teachingPackage_(incoming[i] && incoming[i].lessonId);
    if (!pack) return { ok: false, error: 'unknown_lesson' };
    if (seen[pack.lessonId]) return { ok: false, error: 'duplicate' };
    seen[pack.lessonId] = true;
    if (windowInvalid_(incoming[i].openAt, incoming[i].closeAt)) return { ok: false, error: 'invalid_window' };
  }
  const catalog = ss.getSheetByName('LessonCatalog').getDataRange().getValues();
  const haveLesson = {};
  for (let i = 1; i < catalog.length; i++) haveLesson[String(catalog[i][0] || '')] = true;
  const ops = [];
  TEACHING_PACKAGES.forEach(function (pack) {
    if (haveLesson[pack.lessonId]) return;
    ops.push({ kind: 'append', sheet: 'LessonCatalog', values: [pack.lessonId, pack.title, pack.version, pack.url, pack.status] });
  });
  const data = links.getDataRange().getValues();
  const rowOf = {};
  for (let i = 1; i < data.length; i++) {
    if (normalizeProgramId_(data[i][0]) !== programId) continue;
    rowOf[String(data[i][1] || '')] = i + 1;
  }
  const now = new Date().toISOString();
  const saved = [];
  Object.keys(rowOf).forEach(function (lessonId) {
    if (seen[lessonId]) return;
    ops.push({ kind: 'set', sheet: 'ProgramLessons', row: rowOf[lessonId], col: 3, value: 'FALSE' });
  });
  incoming.forEach(function (item, index) {
    const pack = teachingPackage_(item.lessonId);
    const enabled = item.enabled === false || String(item.enabled).toUpperCase() === 'FALSE' ? 'FALSE' : 'TRUE';
    const requirePre = item.requirePre === true || String(item.requirePre).toUpperCase() === 'YES' || String(item.requirePre).toUpperCase() === 'TRUE' ? 'YES' : 'NO';
    const sort = Number(item.sortOrder) || (index + 1);
    const values = [programId, pack.lessonId, enabled, sort, pack.version, String(item.openAt || ''), String(item.closeAt || ''), now, auth.email, requirePre];
    const rowNumber = rowOf[pack.lessonId];
    if (!rowNumber) {
      ops.push({ kind: 'append', sheet: 'ProgramLessons', values: values });
    } else {
      for (let c = 0; c < values.length; c++) {
        ops.push({ kind: 'set', sheet: 'ProgramLessons', row: rowNumber, col: c + 1, value: values[c] });
      }
    }
    saved.push(pack.lessonId);
  });
  return {
    ok: true,
    ops: ops,
    programId: programId,
    targetKey: 'program-lessons',
    detail: 'lessons ' + saved.join(','),
    result: { programId: programId, lessons: saved },
  };
}

function readProgramLessonRows_(ss, programId) {
  const sheet = ss.getSheetByName('ProgramLessons');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (!data.length) return [];
  const headers = (data[0] || []).map(function (cell) { return String(cell || '').trim(); });
  const col = function (name, fallback) {
    const found = headerIndex_(headers, name);
    return found >= 0 ? found : fallback;
  };
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (normalizeProgramId_(data[i][col('ProgramId', 0)]) !== programId) continue;
    const lessonId = String(data[i][col('LessonId', 1)] || '');
    const pack = teachingPackage_(lessonId);
    if (!pack) continue;
    const enabledRaw = String(data[i][col('Enabled', 2)] || '').toUpperCase();
    const requireRaw = String(data[i][col('RequirePre', 9)] || '').toUpperCase();
    out.push({
      pack: pack,
      enabled: !(enabledRaw === 'FALSE' || enabledRaw === '0' || enabledRaw === 'NO'),
      sort: Number(data[i][col('SortOrder', 3)]) || 0,
      openAt: String(data[i][col('OpenAt', 5)] || ''),
      closeAt: String(data[i][col('CloseAt', 6)] || ''),
      requirePre: requireRaw === 'YES' || requireRaw === 'TRUE' || requireRaw === '1',
    });
  }
  out.sort(function (a, b) { return a.sort - b.sort; });
  return out;
}

function readLessonProgress_(ss, programId, username) {
  const sheet = ss.getSheetByName('LessonProgress');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const want = normalizeUsername_(username);
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (normalizeProgramId_(data[i][0]) !== programId) continue;
    if (normalizeUsername_(data[i][1]) !== want) continue;
    out.push({
      lessonId: String(data[i][2] || ''),
      version: String(data[i][3] || ''),
      topicId: String(data[i][4] || ''),
      status: String(data[i][5] || ''),
      artifact: String(data[i][6] || ''),
      support: String(data[i][7] || '').toUpperCase() === 'YES',
      updatedAt: String(data[i][8] || ''),
    });
  }
  return out;
}

function lessonWindowState_(openAt, closeAt, now) {
  const openMs = Date.parse(openAt || '');
  const closeMs = Date.parse(closeAt || '');
  if (!isNaN(openMs) && now.getTime() < openMs) return 'upcoming';
  if (!isNaN(closeMs) && now.getTime() > closeMs) return 'locked';
  return 'open';
}

function phaseCard_(tests, testId, phase) {
  if (!testId) return { linked: false, testId: '', phase: '', state: 'unlinked', tries: 0, maxTries: 0 };
  const want = resolveTestId_(testId);
  const hit = (tests || []).filter(function (test) {
    return resolveTestId_(test.testId) === want && normalizePhase_(test.phase) === phase;
  })[0];
  if (!hit) return { linked: true, testId: want, phase: phase, state: 'not_assigned', tries: 0, maxTries: 0 };
  return { linked: true, testId: hit.testId, phase: hit.phase, state: hit.state, tries: hit.tries, maxTries: hit.maxTries };
}

function buildTeachingLessonsPayload_(ss, student, programId, tests) {
  if (!programId) return [];
  const rows = readProgramLessonRows_(ss, programId).filter(function (row) { return row.enabled; });
  if (!rows.length) return [];
  const progress = readLessonProgress_(ss, programId, usernameFromStudent_(student));
  const now = new Date();
  return rows.map(function (row) {
    const topics = row.pack.topics.map(function (topic) {
      const hits = progress.filter(function (item) { return item.lessonId === row.pack.lessonId && item.topicId === topic.id; });
      const latest = bestProgress_(hits);
      return {
        id: topic.id,
        title: topic.title,
        status: latest ? latest.status : '',
        support: latest ? latest.support : false,
        updatedAt: latest ? latest.updatedAt : '',
      };
    });
    const done = topics.filter(function (topic) { return topic.status === 'met' || topic.status === 'support'; }).length;
    let resume = '';
    let resumeAt = '';
    topics.forEach(function (topic) {
      if (!topic.updatedAt) return;
      if (!resumeAt || topic.updatedAt > resumeAt) {
        resumeAt = topic.updatedAt;
        resume = topic.id;
      }
    });
    if (!resume) resume = topics[0] ? topics[0].id : '';
    return {
      lessonId: row.pack.lessonId,
      title: row.pack.title,
      version: row.pack.version,
      url: row.pack.url,
      status: row.pack.status,
      sort: row.sort,
      availability: lessonWindowState_(row.openAt, row.closeAt, now),
      requirePre: row.requirePre,
      pre: phaseCard_(tests, row.pack.preTestId, 'PRE'),
      post: phaseCard_(tests, row.pack.postTestId, 'POST'),
      progress: { done: done, total: topics.length, resumeTopic: resume },
      topics: topics,
    };
  });
}

function preSubmitted_(ss, programId, username, testId) {
  if (!testId) return true;
  const sheet = ss.getSheetByName('Results');
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  const layout = resultsLayout_(data);
  if (layout.username < 0 || layout.testId < 0) return false;
  const start = layout.mode === 'header' ? 1 : 0;
  const wantUser = normalizeUsername_(username);
  const wantTest = resolveTestId_(testId);
  for (let i = start; i < data.length; i++) {
    if (normalizeUsername_(data[i][layout.username]) !== wantUser) continue;
    if (resolveTestId_(data[i][layout.testId]) !== wantTest) continue;
    if (layout.phase >= 0 && normalizePhase_(data[i][layout.phase]) !== 'PRE') continue;
    if (layout.phase < 0) continue;
    if (layout.programId >= 0) {
      const prog = normalizeProgramId_(data[i][layout.programId]);
      if (prog && prog !== programId) continue;
    }
    return true;
  }
  return false;
}

function redactArtifact_(value) {
  let text = String(value || '').slice(0, 400);
  ['password', 'passwordhash', 'correct', 'correctsnapshot', 'access_token', 'accesstoken', 'hash'].forEach(function (key) {
    text = text.split('"' + key + '"').join('"note"');
  });
  return text;
}

function bestProgress_(hits) {
  if (!hits || !hits.length) return null;
  const rank = { met: 4, support: 4, needs_rubric: 2, place: 1 };
  let best = hits[0];
  for (let i = 1; i < hits.length; i++) {
    const item = hits[i];
    const itemRank = rank[item.status] || 0;
    const bestRank = rank[best.status] || 0;
    if (itemRank > bestRank || (itemRank === bestRank && String(item.updatedAt) > String(best.updatedAt))) best = item;
  }
  return best;
}

function upsertLessonProgress_(ss, row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = ensureNamedSheet_(ss, 'LessonProgress', progressHeaders_());
    const data = sheet.getDataRange().getValues();
    const matches = [];
    for (let i = 1; i < data.length; i++) {
      if (normalizeProgramId_(data[i][0]) !== row.programId) continue;
      if (normalizeUsername_(data[i][1]) !== row.username) continue;
      if (String(data[i][2] || '') !== row.lessonId) continue;
      if (String(data[i][4] || '') !== row.topicId) continue;
      matches.push(i + 1);
    }
    let status = row.status;
    let support = row.support;
    let artifact = row.artifact;
    let updatedAt = row.updatedAt;
    for (let i = 0; i < matches.length; i++) {
      const previous = String(data[matches[i] - 1][5] || '');
      if ((previous === 'met' || previous === 'support') && status === 'place') {
        status = previous;
        support = String(data[matches[i] - 1][7] || '');
        artifact = String(data[matches[i] - 1][6] || '');
        updatedAt = String(data[matches[i] - 1][8] || updatedAt);
      }
    }
    const values = [row.programId, row.username, row.lessonId, row.version, row.topicId, status, artifact, support, updatedAt];
    if (!matches.length) {
      sheet.appendRow(values);
      return;
    }
    sheet.getRange(matches[0], 1, 1, values.length).setValues([values]);
    for (let i = matches.length - 1; i >= 1; i--) sheet.deleteRow(matches[i]);
  } finally {
    lock.releaseLock();
  }
}

function lessonProgressPost_(body) {
  const username = normalizeUsername_(body && body.username);
  const password = body && body.password;
  const programId = normalizeProgramId_(body && body.programId);
  const ss = ss_();
  const studentsData = ss.getSheetByName('Students').getDataRange().getValues();
  const student = findStudent(studentsData, username, password);
  if (!student) return respond({ error: 'invalid_credentials' });
  const ctx = resolveProgramContext_(ss, username, programId);
  if (ctx.error) return respond({ error: ctx.error, programs: ctx.memberships });
  const tests = buildTestsPayload_(ss, student, ctx.programId);
  if (String(body.action || '') === 'lesson_state') {
    return respond({
      ok: true,
      programId: ctx.programId,
      lessons: buildTeachingLessonsPayload_(ss, student, ctx.programId, tests),
    });
  }
  const pack = teachingPackage_(body.lessonId);
  if (!pack) return respond({ error: 'unknown_lesson' });
  const assignment = readProgramLessonRows_(ss, ctx.programId).filter(function (row) {
    return row.enabled && row.pack.lessonId === pack.lessonId;
  })[0];
  if (!assignment) return respond({ error: 'lesson_not_assigned' });
  const availability = lessonWindowState_(assignment.openAt, assignment.closeAt, new Date());
  if (availability !== 'open') return respond({ error: 'not_released' });
  const topicId = String(body.topicId || '').trim();
  const topic = pack.topics.filter(function (item) { return item.id === topicId; })[0];
  if (!topic) return respond({ error: 'unknown_topic' });
  const mode = String(body.mode || 'attempt');
  if (assignment.requirePre && pack.preTestId && !preSubmitted_(ss, ctx.programId, username, pack.preTestId)) {
    return respond({ error: 'pre_required' });
  }
  let status = 'place';
  let support = 'NO';
  let reason = '';
  if (mode === 'support') {
    status = 'support';
    support = 'YES';
  } else if (mode === 'place') {
    status = 'place';
  } else {
    const judged = judgeTeaching_(pack.lessonId, topicId, body.evidence || {});
    status = judged.status;
    reason = judged.reason || '';
    if (status === 'invalid') return respond({ ok: false, error: 'invalid', reason: reason, status: 'invalid' });
  }
  const attemptsBefore = ss.getSheetByName('Attempts') ? ss.getSheetByName('Attempts').getLastRow() : 0;
  upsertLessonProgress_(ss, {
    programId: ctx.programId,
    username: username,
    lessonId: pack.lessonId,
    version: pack.version,
    topicId: topicId,
    status: status,
    artifact: redactArtifact_(JSON.stringify(cleanEvidence_(body.evidence || {}))),
    support: support,
    updatedAt: new Date().toISOString(),
  });
  const attemptsAfter = ss.getSheetByName('Attempts') ? ss.getSheetByName('Attempts').getLastRow() : 0;
  if (attemptsAfter !== attemptsBefore) return respond({ error: 'progress_touched_attempts' });
  const fresh = reloadStudent_(ss, username, password);
  return respond({
    ok: true,
    status: status,
    reason: reason,
    support: support === 'YES',
    lesson: buildTeachingLessonsPayload_(ss, fresh || student, ctx.programId, tests).filter(function (item) {
      return item.lessonId === pack.lessonId;
    })[0] || null,
  });
}

function cleanEvidence_(evidence) {
  const raw = evidence && typeof evidence === 'object' ? evidence : {};
  const out = {};
  Object.keys(raw).forEach(function (key) {
    const folded = String(key || '').toLowerCase();
    if (folded === 'password' || folded === 'correct' || folded === 'key' || folded === 'outcome' || folded === 'score' || folded === 'hash') return;
    out[key] = raw[key];
  });
  return out;
}

function judgeTeaching_(lessonId, topicId, evidence) {
  const pack = teachingPackage_(lessonId);
  if (!pack) return { status: 'invalid', reason: 'unknown_lesson' };
  const clean = cleanEvidence_(evidence);
  if (lessonId === 'sci-cs@2026-10') return judgeCs_(topicId, clean);
  if (lessonId === 'sci-health@2026-10') return judgeHealth_(topicId, clean);
  if (lessonId === 'sci-astro@2026-10') return judgeAstro_(topicId, clean);
  if (lessonId === 'sci-soil@2026-10') return judgeSoil_(topicId, clean);
  if (lessonId === 'sci-sust@2026-10') return judgeSust_(topicId, clean);
  return { status: 'invalid', reason: 'unknown_lesson' };
}

function readyOnly_(evidence) {
  return evidence && evidence.ready === true ? { status: 'met', reason: '' } : { status: 'invalid', reason: 'ready' };
}

function sentence_(value) {
  const text = String(value || '').trim();
  const folded = text.toLowerCase().replace(/\s+/g, ' ');
  if (!text || folded.length < 12) return '';
  if (['idk', 'n/a', 'na', 'asdf', 'yes', 'no', 'ok', 'hello', 'test'].indexOf(folded) >= 0) return '';
  return text;
}

function hasAny_(text, words) {
  const folded = String(text || '').toLowerCase();
  for (let i = 0; i < words.length; i++) if (folded.indexOf(words[i]) >= 0) return true;
  return false;
}

function sameMap_(got, want) {
  if (!got || typeof got !== 'object') return false;
  const keys = Object.keys(want);
  for (let i = 0; i < keys.length; i++) {
    if (String(got[keys[i]] == null ? '' : got[keys[i]]) !== String(want[keys[i]])) return false;
  }
  return keys.length > 0;
}

function sameList_(got, want) {
  if (!got || got.length !== want.length) return false;
  for (let i = 0; i < want.length; i++) if (String(got[i]) !== String(want[i])) return false;
  return true;
}

function judgeCs_(topicId, evidence) {
  if (topicId === 'start') return readyOnly_(evidence);
  if (topicId === 'algorithms') return judgeAlgorithms_(evidence);
  if (topicId === 'blocks') return judgeBlocks_(evidence);
  if (topicId === 'weave') return judgeWeave_(evidence);
  if (topicId === 'parts') return judgeParts_(evidence);
  if (topicId === 'draw') return judgeDraw_(evidence);
  if (topicId === 'app') return judgeApp_(evidence);
  if (topicId === 'wrap') {
    const text = String(evidence.response || '');
    if (!sentence_(text)) return { status: 'invalid', reason: 'empty_or_unrelated' };
    const folded = text.toLowerCase();
    const ok = hasAny_(folded, ['algorithm', 'steps', 'instructions']) && hasAny_(folded, ['computer', 'program', 'ran', 'executed', 'machine']) && hasAny_(folded, ['output', 'drawing', 'screen', 'path', 'app']);
    return ok ? { status: 'met', reason: '' } : { status: 'needs_rubric', reason: 'wrap' };
  }
  return { status: 'invalid', reason: 'unknown_topic' };
}

function judgeAlgorithms_(evidence) {
  const steps = evidence.steps;
  if (!steps || steps.length < 3 || steps.length > 5) return { status: 'invalid', reason: 'steps' };
  for (let i = 0; i < steps.length; i++) if (String(steps[i] || '').trim().length < 3) return { status: 'invalid', reason: 'steps' };
  if (!sentence_(evidence.revision)) return { status: 'invalid', reason: 'revision' };
  if (!sameMap_(evidence.placed, { cards: 'person', blocks: 'program', wrong_order: 'person' })) return { status: 'invalid', reason: 'sort' };
  if (!sentence_(evidence.reason)) return { status: 'invalid', reason: 'reason' };
  return { status: 'met', reason: '' };
}

function judgeBlocks_(evidence) {
  if (!sameMap_(evidence.tags, { brush: 'sequence', stir: 'loop', rain: 'conditional', recipe: 'program' })) return { status: 'invalid', reason: 'tags' };
  if (evidence.repeated !== 'rinse' || evidence.decision !== 'hot') return { status: 'invalid', reason: 'combined' };
  const text = String(evidence.conditional || '');
  if (!sentence_(text) || text.toLowerCase().indexOf('if') < 0) return { status: 'invalid', reason: 'conditional' };
  return { status: 'met', reason: '' };
}

function judgeWeave_(evidence) {
  const cards = ['moon', 'pentagon', 'sun', 'triangle', 'slash', 'cloud', 'heart', 'lightning', 'cube', 'cylinder'];
  const order = evidence.rose_order || [];
  if (order.length !== 10) return { status: 'invalid', reason: 'order' };
  const seen = {};
  for (let i = 0; i < order.length; i++) seen[String(order[i])] = true;
  for (let i = 0; i < cards.length; i++) if (!seen[cards[i]]) return { status: 'invalid', reason: 'order' };
  if (!sentence_(evidence.dependency)) return { status: 'invalid', reason: 'dependency' };
  const transfer = evidence.transfer_order || [];
  if (transfer.length !== 4) return { status: 'invalid', reason: 'transfer' };
  const bag = {};
  transfer.forEach(function (item) { bag[item] = true; });
  if (!bag.boil || !bag.bag || !bag.pour || !bag.drink) return { status: 'invalid', reason: 'transfer' };
  if (!(transfer.indexOf('boil') < transfer.indexOf('pour') && transfer.indexOf('bag') < transfer.indexOf('pour') && transfer.indexOf('pour') < transfer.indexOf('drink'))) {
    return { status: 'invalid', reason: 'transfer' };
  }
  const text = String(evidence.dependency || '').toLowerCase();
  const verified = evidence.first_card === 'lightning' && evidence.second_card === 'moon' && hasAny_(text, ['start', 'fold', 'first', 'begin']) && hasAny_(text, ['finish', 'tuck', 'pau', 'end', 'last']);
  return verified ? { status: 'met', reason: '' } : { status: 'needs_rubric', reason: 'weave' };
}

function judgeParts_(evidence) {
  if (!buildOk_(evidence.program)) return { status: 'invalid', reason: 'structure' };
  const changes = String(evidence.changes || '');
  const stays = String(evidence.stays || '');
  if (!sentence_(changes) || !sentence_(stays)) return { status: 'invalid', reason: 'explanation' };
  const namesChange = hasAny_(changes, ['change', 'changes', 'longer', 'more', 'times', 'repeat']);
  const namesStay = hasAny_(stays, ['same', 'stays', 'check', 'still', 'threshold', 'inches']);
  return namesChange && namesStay ? { status: 'met', reason: '' } : { status: 'needs_rubric', reason: 'explanation' };
}

function buildOk_(program) {
  if (!program || typeof program !== 'object') return false;
  const loop = program.loop;
  const cond = program.conditional;
  if (!loop || !cond) return false;
  const body = loop.body;
  const then = cond.then;
  const until = String(loop.until || '');
  const iff = String(cond['if'] || '');
  return body && body.indexOf('fold') >= 0 && body.indexOf('roll') >= 0 && until.indexOf('4') >= 0 && iff.indexOf('4') >= 0 && then && then.indexOf('insert') >= 0;
}

function judgeDraw_(evidence) {
  const puzzle = evidence.puzzle;
  const program = evidence.program;
  if (puzzle === 'square') {
    if (evidence.prediction !== 'starts-at-dot') return { status: 'invalid', reason: 'prediction' };
    return squareBlocks_(program) ? { status: 'met', reason: '' } : { status: 'invalid', reason: 'path' };
  }
  if (puzzle === 'hexagon') return hexagonBlocks_(program) ? { status: 'met', reason: '' } : { status: 'invalid', reason: 'path' };
  if (puzzle === 'pattern') {
    if (!hasRepeat_(program) || !traceBlocks_(program)) return { status: 'invalid', reason: 'repeat' };
    const text = String(evidence.explanation || '');
    if (!sentence_(text)) return { status: 'invalid', reason: 'explanation' };
    const numbers = programNumbers_(program);
    const mentions = hasAny_(text, ['repeat', 'loop', 'turn', 'move']);
    let named = false;
    for (let i = 0; i < numbers.length; i++) if (text.indexOf(numbers[i]) >= 0) named = true;
    return mentions && named ? { status: 'met', reason: '' } : { status: 'needs_rubric', reason: 'explanation' };
  }
  return { status: 'invalid', reason: 'puzzle' };
}

function hasRepeat_(program) {
  if (!program || !program.length) return false;
  for (let i = 0; i < program.length; i++) {
    const command = program[i];
    if (!command) continue;
    if (command.op === 'repeat') return true;
    if (hasRepeat_(command.body)) return true;
  }
  return false;
}

function programNumbers_(program) {
  const found = [];
  function walk(list) {
    if (!list || !list.length) return;
    for (let i = 0; i < list.length; i++) {
      const command = list[i];
      if (!command) continue;
      ['n', 'times'].forEach(function (key) {
        if (typeof command[key] === 'number') found.push(String(command[key]));
      });
      walk(command.body);
    }
  }
  walk(program);
  return found;
}

function onlyRepeat_(program, times) {
  if (!program || program.length !== 1 || !program[0]) return null;
  if (program[0].op !== 'repeat' || program[0].times !== times) return null;
  return program[0];
}

function moveTurn_(body) {
  if (!body || !body.length) return false;
  let moves = 0;
  let turns = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] && body[i].op === 'move') moves++;
    if (body[i] && body[i].op === 'turn') turns++;
  }
  return moves === 1 && turns === 1 && body.length === 2;
}

function squareBlocks_(program) {
  const command = onlyRepeat_(program, 4);
  if (!command || !moveTurn_(command.body)) return false;
  let turn = null;
  for (let i = 0; i < command.body.length; i++) if (command.body[i].op === 'turn') turn = command.body[i];
  if (!turn || turn.n !== 90) return false;
  const points = traceBlocks_(program);
  return points && points.length === 5 && closes_(points);
}

function hexagonBlocks_(program) {
  const command = onlyRepeat_(program, 6);
  if (!command || !moveTurn_(command.body)) return false;
  let turn = null;
  for (let i = 0; i < command.body.length; i++) if (command.body[i].op === 'turn') turn = command.body[i];
  if (!turn || turn.n !== 60) return false;
  const points = traceBlocks_(program);
  return points && points.length === 7 && closes_(points);
}

function traceBlocks_(program) {
  const state = { x: 0, y: 0, heading: 0, points: [[0, 0]] };
  function run(commands, depth) {
    if (!commands || depth > 3 || commands.length > 40) return false;
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      if (!cmd) return false;
      if (cmd.op === 'move') {
        if (typeof cmd.n !== 'number' || cmd.n < 1 || cmd.n > 400) return false;
        state.x += Math.cos(state.heading) * cmd.n;
        state.y += Math.sin(state.heading) * cmd.n;
        state.points.push([state.x, state.y]);
      } else if (cmd.op === 'turn') {
        if (typeof cmd.n !== 'number' || cmd.n < 1 || cmd.n > 180) return false;
        state.heading += cmd.n * Math.PI / 180;
      } else if (cmd.op === 'repeat') {
        if (typeof cmd.times !== 'number' || cmd.times < 1 || cmd.times > 12) return false;
        for (let n = 0; n < cmd.times; n++) if (!run(cmd.body, depth + 1)) return false;
      } else return false;
    }
    return true;
  }
  if (!run(program, 0)) return null;
  return state.points;
}

function closes_(points) {
  const last = points[points.length - 1];
  return Math.abs(points[0][0] - last[0]) <= 1 && Math.abs(points[0][1] - last[1]) <= 1;
}

function judgeApp_(evidence) {
  const screens = evidence.screens;
  if (!screens || screens.length !== 3) return { status: 'invalid', reason: 'screens' };
  const buttons = [];
  for (let i = 0; i < screens.length; i++) {
    const screen = screens[i] || {};
    if (String(screen.title || '').trim().length < 2 || !sentence_(screen.body) || String(screen.a_label || '').trim().length < 2) return { status: 'invalid', reason: 'screens' };
    const dest = screen.a_to;
    if (dest !== 1 && dest !== 2 && dest !== 3) return { status: 'invalid', reason: 'screens' };
    const map = { a: dest };
    if (screen.b_label || (screen.b_to && screen.b_to !== 0)) {
      if (String(screen.b_label || '').trim().length < 2) return { status: 'invalid', reason: 'screens' };
      if (screen.b_to !== 1 && screen.b_to !== 2 && screen.b_to !== 3) return { status: 'invalid', reason: 'screens' };
      map.b = screen.b_to;
    }
    buttons.push(map);
  }
  const walk = evidence.walk;
  if (!walk || walk.length < 3) return { status: 'invalid', reason: 'walk' };
  let current = 1;
  const seen = { 1: true };
  for (let i = 0; i < walk.length; i++) {
    const step = walk[i] || {};
    if (step.screen !== current) return { status: 'invalid', reason: 'mismatch' };
    const landed = buttons[current - 1][step.button];
    if (landed !== step.landed) return { status: 'invalid', reason: 'mismatch' };
    current = step.landed;
    seen[current] = true;
  }
  if (!seen[1] || !seen[2] || !seen[3]) return { status: 'invalid', reason: 'unreachable' };
  if (current !== 1) return { status: 'invalid', reason: 'no_return' };
  if (!sentence_(evidence.explanation)) return { status: 'invalid', reason: 'explanation' };
  return { status: 'met', reason: '' };
}

function judgeHealth_(topicId, evidence) {
  if (topicId === 'start') return readyOnly_(evidence);
  if (topicId === 'heart') {
    if (String(evidence.food || '').trim().length < 3 || String(evidence.practice || '').trim().length < 3) return { status: 'invalid', reason: 'names' };
    if (!sameMap_(evidence.sort, { pulse: 'vital', breathing: 'vital', temperature: 'vital', song: 'not' })) return { status: 'invalid', reason: 'sort' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'method') {
    if (evidence.kind !== 'hypothesis') return { status: 'invalid', reason: 'kind' };
    const hypothesis = String(evidence.hypothesis || '');
    if (hypothesis.toLowerCase().indexOf('if') < 0 || hypothesis.toLowerCase().indexOf('then') < 0) return { status: 'invalid', reason: 'hypothesis' };
    if (!hasAny_(hypothesis, ['stand', 'march', 'walk', 'run', 'lift', 'exercise', 'active', 'sit', 'move'])) return { status: 'invalid', reason: 'hypothesis' };
    if (!hasAny_(hypothesis, ['heart', 'pulse', 'breath', 'respir', 'blood', 'pressure'])) return { status: 'invalid', reason: 'hypothesis' };
    if (!hasAny_(evidence.independent, ['activ', 'march', 'stand', 'lift', 'run', 'exerc', 'move', 'sit'])) return { status: 'invalid', reason: 'independent' };
    if (!hasAny_(evidence.dependent, ['heart', 'pulse', 'breath', 'respir', 'blood', 'pressure'])) return { status: 'invalid', reason: 'dependent' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'rest') {
    const beats = Number(evidence.beats15);
    const breaths = Number(evidence.breaths);
    if (!(beats >= 8 && beats <= 45)) return { status: 'invalid', reason: 'beats' };
    if (!(breaths >= 6 && breaths <= 40)) return { status: 'invalid', reason: 'breaths' };
    if (!hasAny_(evidence.where, ['wrist', 'neck', 'finger', 'chest', 'pulse'])) return { status: 'invalid', reason: 'where' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'move') {
    if (evidence.how !== 'march' && evidence.how !== 'lift') return { status: 'invalid', reason: 'how' };
    if (!(Number(evidence.stand_beats) >= 8 && Number(evidence.stand_beats) <= 55)) return { status: 'invalid', reason: 'stand' };
    if (!(Number(evidence.stand_breaths) >= 6 && Number(evidence.stand_breaths) <= 50)) return { status: 'invalid', reason: 'stand' };
    if (!(Number(evidence.move_beats) >= 8 && Number(evidence.move_beats) <= 60)) return { status: 'invalid', reason: 'move' };
    if (!(Number(evidence.move_breaths) >= 6 && Number(evidence.move_breaths) <= 60)) return { status: 'invalid', reason: 'move' };
    const third = String(evidence.third_beats || '').trim();
    if (third && !(Number(third) >= 8 && Number(third) <= 60)) return { status: 'invalid', reason: 'third' };
    if (!third && String(evidence.stopped || '').trim().split(/\s+/).length < 2) return { status: 'invalid', reason: 'stopped' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'data') {
    if (['rise', 'stay', 'fall'].indexOf(evidence.change) < 0) return { status: 'invalid', reason: 'change' };
    if (['support', 'reject', 'unsure'].indexOf(evidence.claim) < 0) return { status: 'invalid', reason: 'claim' };
    if (String(evidence.error || '').trim().split(/\s+/).length < 3) return { status: 'invalid', reason: 'error' };
    if (evidence.reliable !== 'b' || evidence.valid !== 'c') return { status: 'invalid', reason: 'method' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'community') {
    if (String(evidence.action || '').trim().split(/\s+/).length < 3) return { status: 'invalid', reason: 'action' };
    if (String(evidence.condition || '').trim().split(/\s+/).length < 3) return { status: 'invalid', reason: 'condition' };
    if (String(evidence.note || '').trim().split(/\s+/).length < 3) return { status: 'invalid', reason: 'note' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'wrap') {
    if (String(evidence.question || '').trim().split(/\s+/).length < 3) return { status: 'invalid', reason: 'question' };
    if (!hasAny_(evidence.measured, ['heart', 'pulse', 'breath', 'respir', 'blood', 'pressure'])) return { status: 'invalid', reason: 'measured' };
    const result = String(evidence.result || '').toLowerCase();
    if (!hasAny_(result, ['up', 'down', 'rose', 'fell', 'same', 'stay', 'higher', 'lower', 'support']) && !/\d/.test(result)) return { status: 'invalid', reason: 'result' };
    return { status: 'met', reason: '' };
  }
  return { status: 'invalid', reason: 'unknown_topic' };
}

function judgeAstro_(topicId, evidence) {
  if (topicId === 'start') return readyOnly_(evidence);
  if (topicId === 'sky') {
    if (!sentence_(evidence.use) || !hasAny_(evidence.use, ['navigat', 'farm', 'fish', 'calendar', 'plant', 'voyage', 'harvest', 'sail'])) return { status: 'invalid', reason: 'use' };
    if (!sentence_(evidence.daylight) || !hasAny_(evidence.daylight, ['sun', 'glare', 'daytime', 'daylight', 'bright'])) return { status: 'invalid', reason: 'daylight' };
    if (!sameMap_(evidence.sorted, { twinkle: 'star', steady: 'planet', streak: 'meteor' })) return { status: 'invalid', reason: 'sort' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'place') {
    if (!sameMap_(evidence.coordinates, { hours: 'ra', latitude: 'dec', east: 'ra' })) return { status: 'invalid', reason: 'coordinates' };
    if (evidence.eyepiece !== 'b') return { status: 'invalid', reason: 'eyepiece' };
    if (!sentence_(evidence.reason) || !hasAny_(evidence.reason, ['small', 'shorter'])) return { status: 'invalid', reason: 'reason' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'lines') {
    if (!sameList_(evidence.order, ['bailer', 'backbone', 'fishhook', 'kite'])) return { status: 'invalid', reason: 'order' };
    const note = sentence_(evidence.note);
    if (!note || !hasAny_(note, ['makali', 'bailer', 'keka', 'backbone', 'iwikuamo', 'fishhook', 'fish hook', 'manai', 'kite', 'kawelo', 'lupe']) || !hasAny_(note, ['winter', 'spring', 'summer', 'fall', 'autumn'])) return { status: 'invalid', reason: 'season' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'time') {
    if (!sameMap_(evidence.matched, { makahiki: 'moon', clock: 'hours', awakea: 'sun' })) return { status: 'invalid', reason: 'matches' };
    if (!sentence_(evidence.explain) || !hasAny_(evidence.explain, ['sun', 'solar']) || !hasAny_(evidence.explain, ['clock', 'hour'])) return { status: 'invalid', reason: 'explain' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'light') {
    if (!sameMap_(evidence.tagged, { rainbow: 'visible', bend: 'refraction', radio: 'electromagnetic', lines: 'pair' })) return { status: 'invalid', reason: 'tags' };
    if (!sentence_(evidence.match) || !hasAny_(evidence.match, ['absorb']) || !hasAny_(evidence.match, ['emit'])) return { status: 'invalid', reason: 'match' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'scope') {
    if (!sameList_(evidence.order, ['fold', 'grating', 'tape', 'look'])) return { status: 'invalid', reason: 'order' };
    if (!sameMap_(evidence.predict, { sun: 'continuous', cfl: 'lines' })) return { status: 'invalid', reason: 'predict' };
    if (!sentence_(evidence.safety) || !hasAny_(evidence.safety, ['sun', 'laser', 'bright'])) return { status: 'invalid', reason: 'safety' };
    if (!sentence_(evidence.community) || !hasAny_(evidence.community, ['fire', 'water', 'food', 'gas', 'smoke', 'chemical', 'medicine', 'pharma'])) return { status: 'invalid', reason: 'community' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'wrap') {
    const text = String(evidence.response || '');
    if (!sentence_(text)) return { status: 'invalid', reason: 'empty_or_unrelated' };
    const ok = hasAny_(text, ['star', 'sky', 'constellation', 'telescope', 'navigate']) && hasAny_(text, ['light', 'spectrum', 'spectroscope', 'wavelength']);
    return ok ? { status: 'met', reason: '' } : { status: 'needs_rubric', reason: 'wrap' };
  }
  return { status: 'invalid', reason: 'unknown_topic' };
}

function soilSentence_(value) {
  const folded = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (folded.length < 8 || ['idk', 'n/a', 'na', 'asdf', 'yes', 'no', 'ok', 'hello', 'test'].indexOf(folded) >= 0) return '';
  return folded;
}

function judgeSoil_(topicId, evidence) {
  if (topicId === 'start') return readyOnly_(evidence);
  if (topicId === 'texture') {
    const order = (evidence.order || []).map(function (part) { return String(part || '').trim().toLowerCase(); });
    if (!sameList_(order, ['sand', 'silt', 'clay'])) return { status: 'invalid', reason: 'order' };
    const matches = evidence.matches || {};
    if (String(matches.hair || '').toLowerCase() !== 'sand' || String(matches.web || '').toLowerCase() !== 'silt' || String(matches.starch || '').toLowerCase() !== 'clay') return { status: 'invalid', reason: 'matches' };
    if (!soilSentence_(evidence.reason) || !hasAny_(evidence.reason, ['small', 'tiny', 'space', 'hold', 'retain', 'slow', 'tight'])) return { status: 'invalid', reason: 'reason' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'ribbon') {
    if (['sandy', 'silty loam', 'clay loam', 'clayey'].indexOf(String(evidence.prediction || '').trim().toLowerCase()) < 0) return { status: 'invalid', reason: 'prediction' };
    const samples = evidence.samples || {};
    if (String(samples.A || '').toLowerCase() !== 'clayey' || String(samples.B || '').toLowerCase() !== 'clay loam' || String(samples.C || '').toLowerCase() !== 'silty loam' || String(samples.D || '').toLowerCase() !== 'sandy') return { status: 'invalid', reason: 'samples' };
    const note = soilSentence_(evidence.note);
    if (!note || note.indexOf('clay') < 0 || !hasAny_(note, ['long', 'longer'])) return { status: 'invalid', reason: 'note' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'water') {
    if (String(evidence.prediction || '').trim().toLowerCase() !== 'slow') return { status: 'invalid', reason: 'prediction' };
    const rates = evidence.rates || {};
    if (String(rates.A || '').toLowerCase() !== 'clayey' || String(rates.B || '').toLowerCase() !== 'silty' || String(rates.C || '').toLowerCase() !== 'sandy') return { status: 'invalid', reason: 'rates' };
    const wetland = soilSentence_(evidence.wetland);
    if (!wetland || wetland.indexOf('clay') < 0 || !hasAny_(wetland, ['water', 'hold', 'retain', 'slow', 'sit', 'stay'])) return { status: 'invalid', reason: 'wetland' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'slope') {
    const bands = evidence.bands || {};
    if (String(bands.low || '').toLowerCase() !== 'slight' || String(bands.mid || '').toLowerCase() !== 'moderate' || String(bands.high || '').toLowerCase() !== 'extreme') return { status: 'invalid', reason: 'bands' };
    if (!soilSentence_(evidence.extreme) || !hasAny_(evidence.extreme, ['eros', 'terrace'])) return { status: 'invalid', reason: 'extreme' };
    if (!soilSentence_(evidence.flat) || !hasAny_(evidence.flat, ['irrigat', 'pond', 'drown', 'drain', 'wet', 'crop'])) return { status: 'invalid', reason: 'flat' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'life') {
    const cards = evidence.cards || {};
    if (String(cards.fuzzy || '').toLowerCase() !== 'fungus' || String(cards.legs || '').toLowerCase() !== 'insect' || String(cards.tunnel || '').toLowerCase() !== 'worm') return { status: 'invalid', reason: 'cards' };
    const role = soilSentence_(evidence.role);
    if (!role || !hasAny_(role, ['nutrient', 'decay', 'air', 'aerat', 'tunnel', 'space', 'drain'])) return { status: 'invalid', reason: 'role' };
    if (!hasAny_(role, ['organism', 'worm', 'fungus', 'insect', 'earthworm'])) return { status: 'invalid', reason: 'role' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'land') {
    const texture = String(evidence.texture || '').trim().toLowerCase();
    if (texture !== 'silty' && texture !== 'depends') return { status: 'invalid', reason: 'texture' };
    if (!soilSentence_(evidence.sandy) || !hasAny_(evidence.sandy, ['clay', 'organic'])) return { status: 'invalid', reason: 'sandy' };
    if (!soilSentence_(evidence.clay) || !hasAny_(evidence.clay, ['sand', 'larger', 'organic'])) return { status: 'invalid', reason: 'clay' };
    if (!soilSentence_(evidence.severe) || !hasAny_(evidence.severe, ['terrace', 'alter', 'retain', 'eros'])) return { status: 'invalid', reason: 'severe' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'wrap') {
    const text = String(evidence.response || '');
    if (!soilSentence_(text) || !hasAny_(text, ['texture', 'sand', 'silt', 'clay'])) return { status: 'invalid', reason: 'texture' };
    if (!hasAny_(text, ['slope'])) return { status: 'invalid', reason: 'slope' };
    if (!hasAny_(text, ['organism', 'worm', 'nutrient', 'decay'])) return { status: 'invalid', reason: 'life' };
    return { status: 'met', reason: '' };
  }
  return { status: 'invalid', reason: 'unknown_topic' };
}

function judgeSust_(topicId, evidence) {
  if (topicId === 'start') return readyOnly_(evidence);
  if (topicId === 'coral') {
    if (!sentence_(evidence.kind) || String(evidence.kind).toLowerCase().indexOf('animal') < 0) return { status: 'invalid', reason: 'kind' };
    if (!sentence_(evidence.care) || !hasAny_(evidence.care, ['food', 'shelter', 'home', 'protect', 'fish', 'coast'])) return { status: 'invalid', reason: 'care' };
    if (!sameMap_(evidence.partner, { algae: 'symbiosis', capture: 'animal' })) return { status: 'invalid', reason: 'partner' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'species') {
    if (!sameMap_(evidence.matched, { rose: 'meandrina', rice: 'capitata', finger: 'compressa', disk: 'scutaria' })) return { status: 'invalid', reason: 'species' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'harm') {
    if (!sameMap_(evidence.sorted, { water: 'stays', acid: 'chemical' })) return { status: 'invalid', reason: 'sorted' };
    if (!sentence_(evidence.change) || !hasAny_(evidence.change, ['acid', 'ph']) || !hasAny_(evidence.change, ['undo', 'cannot', "can't", 'chemical', 'irrevers'])) return { status: 'invalid', reason: 'change' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'record') {
    const names = ['role', 'depend', 'conditions', 'where'];
    for (let i = 0; i < names.length; i++) if (!sentence_(evidence[names[i]])) return { status: 'invalid', reason: 'card' };
    if (!hasAny_(evidence.role, ['food', 'shelter', 'home', 'foundation', 'niche', 'protect'])) return { status: 'invalid', reason: 'role' };
    if (!hasAny_(evidence.depend, ['fish', 'crab', 'marine', 'species', 'shrimp', 'life'])) return { status: 'invalid', reason: 'depend' };
    if (!hasAny_(evidence.conditions, ['depth', 'shallow', 'deep', 'wave', 'sun', 'light', 'flow'])) return { status: 'invalid', reason: 'conditions' };
    if (!hasAny_(evidence.where, ['hawai', 'reef', 'bay', 'flat', 'feet', 'island', 'shore', 'cave'])) return { status: 'invalid', reason: 'where' };
    if (!sameMap_(evidence.scan, { precise: 'mesh', scene: 'splat' })) return { status: 'invalid', reason: 'scan' };
    if (!sentence_(evidence.habits) || String(evidence.habits).toLowerCase().indexOf('slow') < 0 || !hasAny_(evidence.habits, ['above', 'beneath', 'under', 'overlap', 'again', 'twice'])) return { status: 'invalid', reason: 'habits' };
    if (!sameMap_(evidence.mapped, { bounce: 'lidar', photos: 'photogrammetry' })) return { status: 'invalid', reason: 'mapped' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'shape') {
    if (!sentence_(evidence.changes) || !hasAny_(evidence.changes, ['shape', 'branch', 'form', 'morph', 'finger', 'massive'])) return { status: 'invalid', reason: 'changes' };
    if (!hasAny_(evidence.changes, ['wave', 'depth', 'sun', 'light', 'flow', 'protect'])) return { status: 'invalid', reason: 'changes' };
    if (!sentence_(evidence.stays) || !hasAny_(evidence.stays, ['species', 'same'])) return { status: 'invalid', reason: 'stays' };
    if (!sameMap_(evidence.placed, { lace: 'shallow', fingerbay: 'protected' })) return { status: 'invalid', reason: 'placed' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'change') {
    if (evidence.why !== 'all') return { status: 'invalid', reason: 'why' };
    if (!sentence_(evidence.advantage) || !hasAny_(evidence.advantage, ['current', 'swim', 'larger', 'time', 'cost', 'once', 'area'])) return { status: 'invalid', reason: 'advantage' };
    if (!sentence_(evidence.difference) || !hasAny_(evidence.difference, ['color', 'fish', 'bleach', 'pale', 'died', 'dead', 'white', 'brown'])) return { status: 'invalid', reason: 'difference' };
    return { status: 'met', reason: '' };
  }
  if (topicId === 'wrap') {
    const text = String(evidence.response || '');
    if (!sentence_(text)) return { status: 'invalid', reason: 'empty_or_unrelated' };
    const ok = hasAny_(text, ['animal', 'symbiosis', 'algae', 'zooxanthellae']) && hasAny_(text, ['depth', 'wave', 'sun', 'flow', 'shape', 'morph']) && hasAny_(text, ['scan', 'map', 'mesh', 'lidar', 'photo']);
    return ok ? { status: 'met', reason: '' } : { status: 'needs_rubric', reason: 'wrap' };
  }
  return { status: 'invalid', reason: 'unknown_topic' };
}
