// ============================================================
// 浄化プログラム 7days - API Backend (Google Apps Script)
//
// 2シート構成:
//   シート1 = 登録データ（エルメフォームから入力される）
//   シート2 = プログラム進捗（回答データ・自動作成）
//
// エルメフォームの設定:
//   フォーム項目に「お名前」「暗証番号（4桁）」を追加
//   → 送信されるとシート1に自動記録される
//   → 下の REG.NAME_COL / REG.PIN_COL を合わせる
//
// デプロイ手順:
//   1. エルメ連携済みのスプレッドシートでGASエディタを開く
//   2. このコードを貼り付け
//   3. REG.NAME_COL / REG.PIN_COL をシート1の列に合わせる
//   4. デプロイ → ウェブアプリ → 全員アクセス可
// ============================================================


// ============================================================
// 設定
// ============================================================

// --- シート1（エルメ登録データ）の列設定 ---
// エルメフォームの項目順に合わせて変更してください
// A=1, B=2, C=3, D=4 ...
const REG = {
  NAME_COL: 1,   // お名前の列（A列=1）
  PIN_COL: 2,    // 暗証番号の列（B列=2）
};

// --- シート2（プログラム進捗）は自動作成 ---
const PROG_SHEET_NAME = 'プログラム進捗';

const CONFIG = {
  LINE_NOTIFY_ENABLED: false,
  get LINE_CHANNEL_TOKEN() {
    return PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_TOKEN') || '';
  },
  get LINE_USER_ID() {
    return PropertiesService.getScriptProperties().getProperty('LINE_USER_ID') || '';
  },
  TIMEZONE: 'Asia/Tokyo',
};


// ============================================================
// シート2（プログラム進捗）の列定義
// ============================================================

const PCOL = {
  NAME: 1,           // A: 参加者名（シート1と紐づけ）
  // Day 1-7: 各2列（回答 + 日時）
  // Day1: B(2), C(3)
  // Day2: D(4), E(5)
  // Day3: F(6), G(7)
  // Day4: H(8), I(9)
  // Day5: J(10), K(11)
  // Day6: L(12), M(13)
  // Day7: N(14), O(15)
  COMPLETED: 16,     // P: 完了フラグ
  COMPLETED_AT: 17,  // Q: 完了日時
};

function dayAnswerCol(dayNum) {
  return 2 + (dayNum - 1) * 2;
}
function dayTimestampCol(dayNum) {
  return 3 + (dayNum - 1) * 2;
}


// ============================================================
// 21:00リセット計算
// ============================================================

function getNextUnlockTime(completedTimestamp) {
  var completed = new Date(completedTimestamp);
  var dateStr = Utilities.formatDate(completed, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  var unlock = new Date(dateStr + 'T21:00:00+09:00');
  if (completed.getTime() >= unlock.getTime()) {
    unlock = new Date(unlock.getTime() + 24 * 60 * 60 * 1000);
  }
  return unlock;
}


// ============================================================
// 7日間の質問
// ============================================================

const DAILY_QUESTIONS = [
  '今、あなたの心の中で一番重たいものは何ですか？ 誰にも見せなくていい場所です。ここに、そのまま置いてください。',
  'あなたが "本当はこうしたかった" と思っていることは何ですか？ 誰かのためではなく、あなた自身の声を聞かせてください。',
  'もし過去の自分に一つだけ伝えられるとしたら、何と言いますか？',
  'あなたが無意識に蓋をしている感情はありますか？ 怒り、悲しみ、寂しさ... どんなものでも構いません。',
  'あなたが手放したいのに、まだ握りしめているものは何ですか？',
  '今のあなたが、一番欲しい言葉は何ですか？ 自分自身にかけてあげたい言葉を書いてください。',
  '7日間を終えた今、あなたの心の器には何が見えますか？ 空っぽになった器に、これから何を入れていきたいですか？',
];


// ============================================================
// レスポンスヘルパー
// ============================================================

function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function createErrorResponse(message, code) {
  return createResponse({ success: false, error: message, code: code || 'ERROR' });
}

function createSuccessResponse(data) {
  return createResponse({ success: true, ...data });
}


// ============================================================
// doGet / doPost
// ============================================================

function doGet(e) {
  try {
    const params = e.parameter || {};
    const action = params.action || '';

    if (params.payload) {
      try {
        return handlePostAction(JSON.parse(params.payload));
      } catch (parseErr) {
        return createErrorResponse('payload のJSON形式が正しくありません。', 'INVALID_JSON');
      }
    }

    switch (action) {
      case 'stats':
        return handleGetStats();
      default:
        return createErrorResponse('不明なアクションです。', 'INVALID_ACTION');
    }
  } catch (err) {
    Logger.log('doGet エラー: ' + err.message);
    return createErrorResponse('サーバーエラー: ' + err.message, 'SERVER_ERROR');
  }
}

function doPost(e) {
  try {
    if (e.parameter && e.parameter.preflight === 'true') {
      return createSuccessResponse({ message: 'CORS OK' });
    }
    var body = JSON.parse(e.postData.contents);
    return handlePostAction(body);
  } catch (err) {
    Logger.log('doPost エラー: ' + err.message);
    return createErrorResponse('サーバーエラー: ' + err.message, 'SERVER_ERROR');
  }
}

function handlePostAction(body) {
  var action = body.action || '';
  switch (action) {
    case 'auth':
      return handleAuth(body);
    case 'submit':
      return handleSubmit(body);
    case 'register':
      return handleRegister(body);
    case 'stats':
      return handleGetStats();
    default:
      return createErrorResponse('不明なアクションです。', 'INVALID_ACTION');
  }
}


// ============================================================
// auth - 名前+PINでログイン（シート1で照合）
// ============================================================

function handleAuth(body) {
  var name = (body.name || '').trim();
  var pin = body.pin || '';

  if (!name) {
    return createErrorResponse('お名前を入力してください。', 'MISSING_NAME');
  }
  if (!pin || !/^\d{4}$/.test(pin)) {
    return createErrorResponse('4桁の暗証番号を入力してください。', 'INVALID_PIN');
  }

  // シート1（登録データ）で照合
  var regSheet = getRegSheet();
  var lastRow = regSheet.getLastRow();

  if (lastRow < 1) {
    return createErrorResponse('登録データがありません。', 'NOT_REGISTERED');
  }

  // ヘッダー行があるかチェック（1行目がヘッダーならデータは2行目から）
  var startRow = 1;
  var firstCellVal = String(regSheet.getRange(1, REG.NAME_COL).getValue()).trim();
  // ヘッダーっぽい文字列なら2行目から検索
  if (firstCellVal === '' || firstCellVal === '名前' || firstCellVal === 'お名前' || firstCellVal === 'name' || firstCellVal === 'Name') {
    startRow = 2;
  }

  if (lastRow < startRow) {
    return createErrorResponse('登録データがありません。', 'NOT_REGISTERED');
  }

  var dataRows = lastRow - startRow + 1;
  var names = regSheet.getRange(startRow, REG.NAME_COL, dataRows, 1).getValues();
  var pins = regSheet.getRange(startRow, REG.PIN_COL, dataRows, 1).getValues();

  var nameFound = false;

  for (var i = 0; i < dataRows; i++) {
    var rowName = String(names[i][0]).trim();
    if (rowName === name) {
      nameFound = true;
      var rowPin = String(pins[i][0]).trim();
      if (rowPin === pin) {
        // 認証成功 → シート2から進捗を取得
        var progSheet = getProgSheet();
        var progRow = findProgRowByName(progSheet, name);
        var progress;

        if (progRow) {
          var progData = progSheet.getRange(progRow, 1, 1, PCOL.COMPLETED_AT).getValues()[0];
          progress = buildProgressObject(progData);
        } else {
          // シート2にまだエントリなし → 初回ログイン、エントリ作成
          createProgEntry(progSheet, name);
          progress = buildEmptyProgress();
        }

        return createSuccessResponse({
          registered: true,
          pin_verified: true,
          name: name,
          progress: progress,
          current_day: progress.current_day,
          completed: progress.days_completed === 7,
          questions: DAILY_QUESTIONS,
        });
      }
    }
  }

  if (nameFound) {
    return createErrorResponse('暗証番号が違います。', 'WRONG_PIN');
  }

  return createErrorResponse('この名前は登録されていません。先にLINEの登録フォームからご登録ください。', 'NOT_REGISTERED');
}


// ============================================================
// register - 登録フォームからの新規登録（シート1に書き込み）
// ============================================================

function handleRegister(body) {
  var name = (body.name || '').trim();
  var pin = body.pin || '';

  if (!name) {
    return createErrorResponse('お名前を入力してください。', 'MISSING_NAME');
  }
  if (!pin || !/^\d{4}$/.test(pin)) {
    return createErrorResponse('4桁の暗証番号を設定してください。', 'INVALID_PIN');
  }

  var regSheet = getRegSheet();
  var lastRow = regSheet.getLastRow();

  // 同名チェック
  if (lastRow >= 1) {
    var startRow = 1;
    var firstCellVal = String(regSheet.getRange(1, REG.NAME_COL).getValue()).trim();
    if (firstCellVal === '' || firstCellVal === '名前' || firstCellVal === 'お名前' || firstCellVal === 'name' || firstCellVal === 'Name') {
      startRow = 2;
    }
    if (lastRow >= startRow) {
      var names = regSheet.getRange(startRow, REG.NAME_COL, lastRow - startRow + 1, 1).getValues();
      for (var i = 0; i < names.length; i++) {
        if (String(names[i][0]).trim() === name) {
          return createErrorResponse('このお名前はすでに登録されています。', 'ALREADY_REGISTERED');
        }
      }
    }
  }

  // シート1に追記（名前とPINの列に書き込み）
  var newRow = lastRow + 1;
  regSheet.getRange(newRow, REG.NAME_COL).setValue(name);
  regSheet.getRange(newRow, REG.PIN_COL).setValue(pin);

  Logger.log('新規登録: ' + name);

  return createSuccessResponse({
    message: '登録が完了しました。プログラムページからログインしてください。',
    is_new: true,
    name: name,
  });
}


// ============================================================
// submit - 回答送信（シート1でPIN照合→シート2に保存）
// ============================================================

function handleSubmit(body) {
  var name = (body.name || '').trim();
  var pin = body.pin || '';
  var day = parseInt(body.day, 10);
  var answer = body.answer;

  if (!name) {
    return createErrorResponse('名前が必要です。', 'MISSING_NAME');
  }
  if (!pin) {
    return createErrorResponse('暗証番号が必要です。', 'MISSING_PIN');
  }
  if (!day || day < 1 || day > 7) {
    return createErrorResponse('day は 1〜7 の数値で指定してください。', 'INVALID_DAY');
  }
  if (!answer || answer.trim() === '') {
    return createErrorResponse('回答が空です。あなたの心の声を聞かせてください。', 'EMPTY_ANSWER');
  }

  // シート1でPIN照合
  var regSheet = getRegSheet();
  if (!verifyPin(regSheet, name, pin)) {
    return createErrorResponse('認証に失敗しました。', 'AUTH_FAILED');
  }

  // シート2で進捗管理
  var progSheet = getProgSheet();
  var row = findProgRowByName(progSheet, name);

  if (!row) {
    // まだ進捗エントリなし → 作成
    createProgEntry(progSheet, name);
    row = findProgRowByName(progSheet, name);
  }

  // 完了済みチェック
  var completedVal = progSheet.getRange(row, PCOL.COMPLETED).getValue();
  if (completedVal === true || completedVal === 'TRUE') {
    return createErrorResponse('すでに7日間のプログラムを完了しています。', 'ALREADY_COMPLETED');
  }

  // Day順序チェック
  if (day > 1) {
    var prevAnswer = progSheet.getRange(row, dayAnswerCol(day - 1)).getValue();
    if (!prevAnswer || prevAnswer === '') {
      return createErrorResponse('Day ' + (day - 1) + ' がまだ完了していません。順番に進めてください。', 'DAY_LOCKED');
    }

    // 21:00リセットチェック
    var prevTimestamp = progSheet.getRange(row, dayTimestampCol(day - 1)).getValue();
    if (prevTimestamp) {
      var now = new Date();
      var unlockAt = getNextUnlockTime(prevTimestamp);
      if (now.getTime() < unlockAt.getTime()) {
        var unlockAtStr = Utilities.formatDate(unlockAt, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
        return createErrorResponse('Day ' + day + ' は ' + unlockAtStr + ' に解放されます。', 'TIME_LOCKED');
      }
    }
  }

  // 回答済みチェック
  var existing = progSheet.getRange(row, dayAnswerCol(day)).getValue();
  if (existing && existing !== '') {
    return createErrorResponse('Day ' + day + ' はすでに回答済みです。', 'ALREADY_ANSWERED');
  }

  // 回答保存
  var now = new Date();
  var nowStr = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  progSheet.getRange(row, dayAnswerCol(day)).setValue(answer.trim());
  progSheet.getRange(row, dayTimestampCol(day)).setValue(nowStr);

  // Day7完了
  if (day === 7) {
    progSheet.getRange(row, PCOL.COMPLETED).setValue(true);
    progSheet.getRange(row, PCOL.COMPLETED_AT).setValue(nowStr);

    if (CONFIG.LINE_NOTIFY_ENABLED) {
      sendLineNotification(name);
    }

    Logger.log('7日間完了: ' + name);

    return createSuccessResponse({
      message: '7日間の浄化プログラム、おめでとうございます。',
      day: day,
      is_complete: true,
      completed_at: nowStr,
    });
  }

  return createSuccessResponse({
    message: 'Day ' + day + ' の回答を受け取りました。',
    day: day,
    saved_at: nowStr,
    is_complete: false,
    next_day: day + 1,
    next_question: DAILY_QUESTIONS[day],
  });
}


// ============================================================
// stats - 統計（シート2ベース）
// ============================================================

function handleGetStats() {
  var progSheet = getProgSheet();
  var lastRow = progSheet.getLastRow();

  if (lastRow <= 1) {
    return createSuccessResponse({
      total_participants: 0,
      completed_count: 0,
      completion_rate: 0,
      day_breakdown: {},
      today_submissions: 0,
    });
  }

  var data = progSheet.getRange(2, 1, lastRow - 1, PCOL.COMPLETED_AT).getValues();
  var total = data.length;
  var completed = 0;
  var dayBreakdown = {};
  var todaySubs = 0;
  var today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');

  for (var d = 1; d <= 7; d++) { dayBreakdown['day' + d] = 0; }

  data.forEach(function(row) {
    if (row[PCOL.COMPLETED - 1] === true || row[PCOL.COMPLETED - 1] === 'TRUE') completed++;
    for (var d = 1; d <= 7; d++) {
      var ans = row[dayAnswerCol(d) - 1];
      var ts = row[dayTimestampCol(d) - 1];
      if (ans && ans !== '') {
        dayBreakdown['day' + d]++;
        if (ts) {
          var subDate = Utilities.formatDate(new Date(ts), CONFIG.TIMEZONE, 'yyyy-MM-dd');
          if (subDate === today) todaySubs++;
        }
      }
    }
  });

  return createSuccessResponse({
    total_participants: total,
    completed_count: completed,
    completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
    day_breakdown: dayBreakdown,
    today_submissions: todaySubs,
  });
}


// ============================================================
// プログレス構築
// ============================================================

function buildProgressObject(rowData) {
  var days = {};
  var daysCompleted = 0;
  var currentDay = 1;
  var now = new Date();

  for (var d = 1; d <= 7; d++) {
    var answerVal = rowData[dayAnswerCol(d) - 1];
    var timestampVal = rowData[dayTimestampCol(d) - 1];
    var hasAnswer = answerVal && answerVal !== '';

    var isUnlocked = false;
    var unlockAt = null;
    var isTimeLocked = false;

    if (d === 1) {
      isUnlocked = true;
    } else {
      var prevAnswer = rowData[dayAnswerCol(d - 1) - 1];
      var prevTimestamp = rowData[dayTimestampCol(d - 1) - 1];
      if (prevAnswer && prevAnswer !== '' && prevTimestamp) {
        var unlockTime = getNextUnlockTime(prevTimestamp);
        if (now.getTime() >= unlockTime.getTime()) {
          isUnlocked = true;
        } else {
          isTimeLocked = true;
          unlockAt = Utilities.formatDate(unlockTime, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
        }
      }
    }

    if (hasAnswer) isUnlocked = true;

    days['day' + d] = {
      question: DAILY_QUESTIONS[d - 1],
      answer: hasAnswer ? answerVal : null,
      answered_at: hasAnswer ? formatDate(timestampVal) : null,
      is_completed: hasAnswer,
      is_unlocked: isUnlocked,
      is_time_locked: isTimeLocked,
      unlock_at: unlockAt,
    };

    if (hasAnswer) {
      daysCompleted++;
      currentDay = d < 7 ? d + 1 : 7;
    }
  }

  if (daysCompleted === 0) currentDay = 1;

  return {
    days: days,
    days_completed: daysCompleted,
    current_day: currentDay,
    total_days: 7,
    progress_percent: Math.round((daysCompleted / 7) * 100),
  };
}

function buildEmptyProgress() {
  var days = {};
  for (var d = 1; d <= 7; d++) {
    days['day' + d] = {
      question: DAILY_QUESTIONS[d - 1],
      answer: null,
      answered_at: null,
      is_completed: false,
      is_unlocked: d === 1,
      is_time_locked: false,
      unlock_at: null,
    };
  }
  return {
    days: days,
    days_completed: 0,
    current_day: 1,
    total_days: 7,
    progress_percent: 0,
  };
}


// ============================================================
// シート操作ユーティリティ
// ============================================================

/** シート1（登録データ）を取得 */
function getRegSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

/** シート2（プログラム進捗）を取得・作成 */
function getProgSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PROG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PROG_SHEET_NAME);
    writeProgHeaders(sheet);
    Logger.log('シート「' + PROG_SHEET_NAME + '」を作成しました。');
  }
  return sheet;
}

/** シート2のヘッダーを書き込み */
function writeProgHeaders(sheet) {
  var headers = [
    'name',
    'day1_answer', 'day1_at',
    'day2_answer', 'day2_at',
    'day3_answer', 'day3_at',
    'day4_answer', 'day4_at',
    'day5_answer', 'day5_at',
    'day6_answer', 'day6_at',
    'day7_answer', 'day7_at',
    'completed', 'completed_at',
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4a90d9');
  headerRange.setFontColor('#ffffff');

  sheet.setColumnWidth(1, 140);
  for (var d = 1; d <= 7; d++) {
    sheet.setColumnWidth(dayAnswerCol(d), 300);
    sheet.setColumnWidth(dayTimestampCol(d), 160);
  }
  sheet.setColumnWidth(PCOL.COMPLETED, 80);
  sheet.setColumnWidth(PCOL.COMPLETED_AT, 160);
  sheet.setFrozenRows(1);
}

/** シート2で名前から行番号を検索 */
function findProgRowByName(sheet, name) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;

  var nameCol = sheet.getRange(2, PCOL.NAME, lastRow - 1, 1).getValues();
  for (var i = 0; i < nameCol.length; i++) {
    if (String(nameCol[i][0]).trim() === name.trim()) {
      return i + 2;
    }
  }
  return null;
}

/** シート2に新規エントリ作成 */
function createProgEntry(sheet, name) {
  var newRow = [name];
  for (var i = 0; i < 14; i++) newRow.push('');  // day1-7 x 2列
  newRow.push(false);  // completed
  newRow.push('');     // completed_at
  sheet.appendRow(newRow);
}

/** シート1でPIN照合 */
function verifyPin(regSheet, name, pin) {
  var lastRow = regSheet.getLastRow();
  if (lastRow < 1) return false;

  var startRow = 1;
  var firstCellVal = String(regSheet.getRange(1, REG.NAME_COL).getValue()).trim();
  if (firstCellVal === '' || firstCellVal === '名前' || firstCellVal === 'お名前' || firstCellVal === 'name' || firstCellVal === 'Name') {
    startRow = 2;
  }
  if (lastRow < startRow) return false;

  var dataRows = lastRow - startRow + 1;
  var names = regSheet.getRange(startRow, REG.NAME_COL, dataRows, 1).getValues();
  var pins = regSheet.getRange(startRow, REG.PIN_COL, dataRows, 1).getValues();

  for (var i = 0; i < dataRows; i++) {
    if (String(names[i][0]).trim() === name && String(pins[i][0]).trim() === pin) {
      return true;
    }
  }
  return false;
}


// ============================================================
// 日時ユーティリティ
// ============================================================

function formatDate(dateValue) {
  if (!dateValue || dateValue === '') return null;
  if (dateValue instanceof Date) {
    return Utilities.formatDate(dateValue, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  }
  return String(dateValue);
}


// ============================================================
// LINE通知
// ============================================================

function sendLineNotification(name) {
  if (!CONFIG.LINE_CHANNEL_TOKEN || !CONFIG.LINE_USER_ID) return;

  var message = '浄化プログラム 7days 完了通知\n\n参加者: ' + name +
    '\n完了日時: ' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss') +
    '\n\n7日間のプログラムを完了しました。';

  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + CONFIG.LINE_CHANNEL_TOKEN },
      payload: JSON.stringify({
        to: CONFIG.LINE_USER_ID,
        messages: [{ type: 'text', text: message }],
      }),
      muteHttpExceptions: true,
    });
  } catch (err) {
    Logger.log('LINE通知エラー: ' + err.message);
  }
}


// ============================================================
// セットアップ（手動実行用）
// ============================================================

function setupProgSheet() {
  var sheet = getProgSheet();
  SpreadsheetApp.getUi().alert('セットアップ完了', 'シート「' + PROG_SHEET_NAME + '」を準備しました。', SpreadsheetApp.getUi().ButtonSet.OK);
}
