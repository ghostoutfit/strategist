// ============================================================
//  AI Reflection — Google Apps Script Backend
//  Paste this entire file into your Apps Script editor.
//  Set OPENAI_API_KEY in Project Settings → Script Properties.
// ============================================================

const SPREADSHEET_ID = '14k6Px_-G9_Sao8B9ggRQReW7vfRog0PNostD_EeIWZs';

function doPost(e) {
  try {
    // Open spreadsheet once per request — all actions share it.
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const data = JSON.parse(e.postData.contents);
    let result;

    switch (data.action) {
      // Returns student + history in one shot (replaces two separate calls)
      case 'init':
        result = actionInit(ss, data.studentId);
        break;

      // Create student row, then return the new student object
      case 'createStudent':
        result = actionCreateStudent(ss, data);
        break;

      // Save raw background info (first-time users, no summarise)
      case 'saveBackground':
        result = actionSaveBackground(ss, data);
        break;

      // Warmup complete: optionally summarise with GPT, save, return new backgroundInfo
      case 'saveWarmup':
        result = actionSaveWarmup(ss, data);
        break;

      // Submit reflection: add history row + regenerate background summary
      case 'saveReflection':
        result = actionSaveReflection(ss, data);
        break;

      // Set goal (+ optionally log first history entry for new students)
      case 'setGoal':
        result = actionSetGoal(ss, data);
        break;

      // Proxy an OpenAI chat call
      case 'chat':
        result = callOpenAI(data.messages, data.maxTokens || 200);
        break;

      default:
        result = { error: 'Unknown action: ' + data.action };
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, data: result }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Action: init ─────────────────────────────────────────────
// Returns { student, history } in a single Sheets read pass.
function actionInit(ss, studentId) {
  const studentsRows = ss.getSheetByName('Students').getDataRange().getValues();
  const historyRows  = ss.getSheetByName('GoalHistory').getDataRange().getValues();
  return {
    student: findStudent(studentsRows, studentId),
    history: findHistory(historyRows, studentId)
  };
}

// ── Action: createStudent ────────────────────────────────────
// Appends a new row, then returns the created student object.
function actionCreateStudent(ss, data) {
  const sheet   = ss.getSheetByName('Students');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {
    StudentID: data.studentId || '', Nickname: data.nickname || '',
    PronounCode: data.pronounCode || '', ChosenTone: data.tone || 'Reflective',
    CurrentGoal: '', CurrentSuccessMeasures: '', CurrentGoalSetDate: '',
    GoalRange: '', BackgroundInfo: ''
  };
  sheet.appendRow(headers.map(h => map[h] !== undefined ? map[h] : ''));
  // Re-read to return the canonical object
  const rows = sheet.getDataRange().getValues();
  return { student: findStudent(rows, data.studentId) };
}

// ── Action: saveBackground ───────────────────────────────────
// Just saves backgroundInfo — no summarise, no re-read.
function actionSaveBackground(ss, data) {
  updateStudentField(ss, data.studentId, 'BackgroundInfo', data.backgroundInfo);
  return { ok: true };
}

// ── Action: saveWarmup ───────────────────────────────────────
// If pastTexts are provided, summarises them (+ new input) via GPT before saving.
// Returns { backgroundInfo } so the frontend can update its local copy.
function actionSaveWarmup(ss, data) {
  let backgroundInfo = data.backgroundInfo; // the new warmup text

  if (data.pastTexts && data.pastTexts.length > 0) {
    // Combine past + new and summarise
    const combined = [...data.pastTexts, data.backgroundInfo].join(' | ');
    try {
      backgroundInfo = callOpenAI([{
        role: 'user',
        content: 'Summarise the student\'s interests, feelings, and experiences based on these reflections:\n\n'
          + combined + '\n\nSummary (1–2 sentences):'
      }], 80);
    } catch (_) { /* keep original on error */ }
  }

  updateStudentField(ss, data.studentId, 'BackgroundInfo', backgroundInfo);
  return { backgroundInfo };
}

// ── Action: saveReflection ───────────────────────────────────
// Appends history row, then regenerates background summary from pastTexts + new reflection.
function actionSaveReflection(ss, data) {
  // 1. Append history row
  const histSheet  = ss.getSheetByName('GoalHistory');
  const headers    = histSheet.getRange(1, 1, 1, histSheet.getLastColumn()).getValues()[0];
  histSheet.appendRow(headers.map(h => data.entry[h] !== undefined ? data.entry[h] : ''));

  // 2. Regenerate background summary if we have enough text
  if (data.pastTexts && data.pastTexts.length > 0) {
    try {
      const newSummary = callOpenAI([{
        role: 'user',
        content: 'Summarise the student\'s interests, feelings, and experiences from these reflections:\n\n'
          + data.pastTexts.slice(-10).join('\n') + '\n\nSummary (1–2 sentences):'
      }], 80);
      updateStudentField(ss, data.studentId, 'BackgroundInfo', newSummary);
    } catch (_) { /* ignore summarise errors */ }
  }

  return { ok: true };
}

// ── Action: setGoal ──────────────────────────────────────────
// Updates goal fields; optionally appends a first history row.
function actionSetGoal(ss, data) {
  const sheet   = ss.getSheetByName('Students');
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];
  const colIdx  = {};
  headers.forEach((h, i) => colIdx[h] = i + 1);

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(data.studentId).trim()) {
      const r = i + 1;
      sheet.getRange(r, colIdx['CurrentGoal']).setValue(data.goal);
      sheet.getRange(r, colIdx['CurrentSuccessMeasures']).setValue(data.successMeasures);
      sheet.getRange(r, colIdx['CurrentGoalSetDate']).setValue(data.setDate);
      break;
    }
  }

  // Log first history entry for brand-new students
  if (data.firstEntry) {
    const histSheet = ss.getSheetByName('GoalHistory');
    const hHeaders  = histSheet.getRange(1, 1, 1, histSheet.getLastColumn()).getValues()[0];
    histSheet.appendRow(hHeaders.map(h => data.firstEntry[h] !== undefined ? data.firstEntry[h] : ''));
  }

  return { ok: true };
}

// ── Shared helpers ───────────────────────────────────────────
function findStudent(rows, studentId) {
  const headers = rows[0];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(studentId).trim()) {
      const obj = {};
      headers.forEach((h, j) => obj[h] = rows[i][j]);
      return obj;
    }
  }
  return null;
}

function findHistory(rows, studentId) {
  const headers = rows[0];
  const result  = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(studentId).trim()) {
      const obj = {};
      headers.forEach((h, j) => obj[h] = rows[i][j]);
      result.push(obj);
    }
  }
  return result;
}

function updateStudentField(ss, studentId, field, value) {
  const sheet   = ss.getSheetByName('Students');
  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];
  const col     = headers.indexOf(field) + 1;
  if (col < 1) return;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === String(studentId).trim()) {
      sheet.getRange(i + 1, col).setValue(value);
      return;
    }
  }
}

// ── OpenAI ───────────────────────────────────────────────────
function callOpenAI(messages, maxTokens) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY not set in Script Properties.');

  const response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify({ model: 'gpt-4', messages, temperature: 0.7, max_tokens: maxTokens }),
    muteHttpExceptions: true
  });

  const result = JSON.parse(response.getContentText());
  if (result.error) throw new Error(result.error.message);
  return result.choices[0].message.content.trim();
}
