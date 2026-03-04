// ============================================================
// 浄化プログラム 7days - API Backend (Google Apps Script)
//
// このファイル1つをGASにコピペすればOK
//
// 機能:
//   - 参加者登録（エルメ UID連携）
//   - 7日間の回答保存・進捗管理
//   - ステータス取得API
//   - 管理ダッシュボード用API（一覧・統計）
//   - LINE通知（7日間完了時）
//
// デプロイ手順:
//   1. 新規Googleスプレッドシートを作成
//   2. GASエディタを開く（拡張機能 → Apps Script）
//   3. 既存コードを全て削除し、このファイルの内容を貼り付け
//   4. setupSheet() を一度実行してヘッダーを作成
//   5. 必要に応じてスクリプトプロパティを設定:
//      - LINE_CHANNEL_TOKEN = xxxxx（LINE通知を使う場合）
//      - LINE_USER_ID = xxxxx（通知先のLINEユーザーID）
//   6. デプロイ → 新しいデプロイ → ウェブアプリ
//      - 実行するユーザー: 自分
//      - アクセスできるユーザー: 全員（匿名含む）
//   7. デプロイURLをLP側のAPI_URLに設定
// ============================================================


// ============================================================
// 設定
// ============================================================

const CONFIG = {
  SHEET_NAME: '参加者データ',
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
// 列定義（1-indexed）
// ============================================================

const COL = {
  UID: 1,            // A: エルメ system_id
  NAME: 2,           // B: 参加者名
  REGISTERED_AT: 3,  // C: 登録日時
  // Day 1-7: 各2列（回答 + 日時）
  // Day1: D(4), E(5)
  // Day2: F(6), G(7)
  // Day3: H(8), I(9)
  // Day4: J(10), K(11)
  // Day5: L(12), M(13)
  // Day6: N(14), O(15)
  // Day7: P(16), Q(17)
  COMPLETED: 18,     // R: 完了フラグ
  COMPLETED_AT: 19,  // S: 完了日時
};

// Day N の回答列 = 4 + (N-1)*2, 日時列 = 5 + (N-1)*2
function dayAnswerCol(dayNum) {
  return 4 + (dayNum - 1) * 2;
}
function dayTimestampCol(dayNum) {
  return 5 + (dayNum - 1) * 2;
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

/**
 * CORS対応のJSONレスポンスを生成
 */
function createResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * エラーレスポンス生成
 */
function createErrorResponse(message, code) {
  return createResponse({
    success: false,
    error: message,
    code: code || 'ERROR',
  });
}

/**
 * 成功レスポンス生成
 */
function createSuccessResponse(data) {
  return createResponse({
    success: true,
    ...data,
  });
}


// ============================================================
// doGet - データ取得エンドポイント
// ============================================================

function doGet(e) {
  try {
    const params = e.parameter || {};
    const action = params.action || '';

    switch (action) {
      case 'status':
        return handleGetStatus(params);
      case 'list':
        return handleGetList();
      case 'stats':
        return handleGetStats();
      default:
        return createErrorResponse('不明なアクションです。action パラメータを確認してください。', 'INVALID_ACTION');
    }
  } catch (err) {
    Logger.log('doGet エラー: ' + err.message);
    return createErrorResponse('サーバーエラーが発生しました: ' + err.message, 'SERVER_ERROR');
  }
}


// ============================================================
// doPost - データ保存エンドポイント
// ============================================================

function doPost(e) {
  try {
    // CORS preflight 対応
    if (e.parameter && e.parameter.preflight === 'true') {
      return createSuccessResponse({ message: 'CORS OK' });
    }

    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return createErrorResponse('リクエストのJSON形式が正しくありません。', 'INVALID_JSON');
    }

    const action = body.action || '';

    switch (action) {
      case 'register':
        return handleRegister(body);
      case 'submit':
        return handleSubmit(body);
      default:
        return createErrorResponse('不明なアクションです。action フィールドを確認してください。', 'INVALID_ACTION');
    }
  } catch (err) {
    Logger.log('doPost エラー: ' + err.message);
    return createErrorResponse('サーバーエラーが発生しました: ' + err.message, 'SERVER_ERROR');
  }
}


// ============================================================
// ハンドラー: status - 参加者の進捗取得
// ============================================================

function handleGetStatus(params) {
  const uid = params.uid;
  if (!uid) {
    return createErrorResponse('uid パラメータが必要です。', 'MISSING_UID');
  }

  const sheet = getSheet();
  const row = findRowByUid(sheet, uid);

  if (!row) {
    // 未登録ユーザー
    return createSuccessResponse({
      registered: false,
      uid: uid,
      message: 'このUIDは未登録です。',
      questions: DAILY_QUESTIONS,
    });
  }

  const data = sheet.getRange(row, 1, 1, COL.COMPLETED_AT).getValues()[0];
  const progress = buildProgressObject(data);

  return createSuccessResponse({
    registered: true,
    uid: uid,
    name: data[COL.NAME - 1] || '',
    registered_at: formatDate(data[COL.REGISTERED_AT - 1]),
    progress: progress,
    current_day: progress.current_day,
    completed: data[COL.COMPLETED - 1] === true || data[COL.COMPLETED - 1] === 'TRUE',
    completed_at: formatDate(data[COL.COMPLETED_AT - 1]),
    questions: DAILY_QUESTIONS,
  });
}


// ============================================================
// ハンドラー: list - 全参加者一覧（管理用）
// ============================================================

function handleGetList() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return createSuccessResponse({ participants: [], total: 0 });
  }

  const data = sheet.getRange(2, 1, lastRow - 1, COL.COMPLETED_AT).getValues();
  const participants = data.map(function(row) {
    const progress = buildProgressObject(row);
    return {
      uid: row[COL.UID - 1],
      name: row[COL.NAME - 1] || '',
      registered_at: formatDate(row[COL.REGISTERED_AT - 1]),
      days_completed: progress.days_completed,
      current_day: progress.current_day,
      completed: row[COL.COMPLETED - 1] === true || row[COL.COMPLETED - 1] === 'TRUE',
      completed_at: formatDate(row[COL.COMPLETED_AT - 1]),
    };
  });

  return createSuccessResponse({
    participants: participants,
    total: participants.length,
  });
}


// ============================================================
// ハンドラー: stats - 統計情報（管理用）
// ============================================================

function handleGetStats() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return createSuccessResponse({
      total_participants: 0,
      completed_count: 0,
      completion_rate: 0,
      day_breakdown: {},
      today_submissions: 0,
    });
  }

  const data = sheet.getRange(2, 1, lastRow - 1, COL.COMPLETED_AT).getValues();
  const totalParticipants = data.length;
  let completedCount = 0;
  const dayBreakdown = { day1: 0, day2: 0, day3: 0, day4: 0, day5: 0, day6: 0, day7: 0 };
  let todaySubmissions = 0;

  const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');

  data.forEach(function(row) {
    // 完了カウント
    if (row[COL.COMPLETED - 1] === true || row[COL.COMPLETED - 1] === 'TRUE') {
      completedCount++;
    }

    // 各日の回答カウント + 今日の提出カウント
    for (var d = 1; d <= 7; d++) {
      var answerVal = row[dayAnswerCol(d) - 1];
      var timestampVal = row[dayTimestampCol(d) - 1];
      if (answerVal && answerVal !== '') {
        dayBreakdown['day' + d]++;
        // 今日の提出かチェック
        if (timestampVal) {
          var submissionDate = Utilities.formatDate(new Date(timestampVal), CONFIG.TIMEZONE, 'yyyy-MM-dd');
          if (submissionDate === today) {
            todaySubmissions++;
          }
        }
      }
    }
  });

  // ドロップオフ分析: 各Dayまで到達した人の割合
  const dropoff = {};
  for (var d = 1; d <= 7; d++) {
    dropoff['day' + d] = totalParticipants > 0
      ? Math.round((dayBreakdown['day' + d] / totalParticipants) * 100)
      : 0;
  }

  return createSuccessResponse({
    total_participants: totalParticipants,
    completed_count: completedCount,
    completion_rate: totalParticipants > 0
      ? Math.round((completedCount / totalParticipants) * 100)
      : 0,
    day_breakdown: dayBreakdown,
    dropoff_percent: dropoff,
    today_submissions: todaySubmissions,
  });
}


// ============================================================
// ハンドラー: register - 新規参加者登録
// ============================================================

function handleRegister(body) {
  const uid = body.uid;
  const name = body.name || '';

  if (!uid) {
    return createErrorResponse('uid フィールドが必要です。', 'MISSING_UID');
  }

  const sheet = getSheet();
  const existingRow = findRowByUid(sheet, uid);

  if (existingRow) {
    // 既に登録済み: エラーではなく既存データを返す
    const data = sheet.getRange(existingRow, 1, 1, COL.COMPLETED_AT).getValues()[0];
    const progress = buildProgressObject(data);

    return createSuccessResponse({
      message: 'すでに登録済みです。',
      is_new: false,
      uid: uid,
      name: data[COL.NAME - 1] || '',
      registered_at: formatDate(data[COL.REGISTERED_AT - 1]),
      current_day: progress.current_day,
      progress: progress,
    });
  }

  // 新規登録
  const now = new Date();
  const nowStr = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  const newRow = [uid, name, nowStr];

  // Day1〜Day7の回答・日時列 + 完了フラグ + 完了日時 を空白で埋める
  for (var i = 0; i < 14; i++) { // 7 days x 2 columns
    newRow.push('');
  }
  newRow.push(false); // R: completed = FALSE
  newRow.push('');    // S: completed_at

  sheet.appendRow(newRow);

  Logger.log('新規参加者登録: ' + uid + ' (' + name + ')');

  return createSuccessResponse({
    message: '登録が完了しました。浄化の7日間が始まります。',
    is_new: true,
    uid: uid,
    name: name,
    registered_at: nowStr,
    current_day: 1,
    question: DAILY_QUESTIONS[0],
  });
}


// ============================================================
// ハンドラー: submit - 日次回答の送信
// ============================================================

function handleSubmit(body) {
  const uid = body.uid;
  const day = parseInt(body.day, 10);
  const answer = body.answer;

  // バリデーション
  if (!uid) {
    return createErrorResponse('uid フィールドが必要です。', 'MISSING_UID');
  }
  if (!day || day < 1 || day > 7) {
    return createErrorResponse('day は 1〜7 の数値で指定してください。', 'INVALID_DAY');
  }
  if (!answer || answer.trim() === '') {
    return createErrorResponse('回答が空です。あなたの心の声を聞かせてください。', 'EMPTY_ANSWER');
  }

  const sheet = getSheet();
  const row = findRowByUid(sheet, uid);

  if (!row) {
    return createErrorResponse('このUIDは未登録です。先に登録を行ってください。', 'NOT_REGISTERED');
  }

  // 既に完了済みチェック
  const completedVal = sheet.getRange(row, COL.COMPLETED).getValue();
  if (completedVal === true || completedVal === 'TRUE') {
    return createErrorResponse('すでに7日間のプログラムを完了しています。', 'ALREADY_COMPLETED');
  }

  // Day unlock ロジック: Day N は Day N-1 が完了済み + 24時間経過の場合のみ
  if (day > 1) {
    const prevDayAnswer = sheet.getRange(row, dayAnswerCol(day - 1)).getValue();
    if (!prevDayAnswer || prevDayAnswer === '') {
      return createErrorResponse(
        'Day ' + (day - 1) + ' がまだ完了していません。順番に進めてください。',
        'DAY_LOCKED'
      );
    }

    // 24時間ロックチェック
    const prevDayTimestamp = sheet.getRange(row, dayTimestampCol(day - 1)).getValue();
    if (prevDayTimestamp) {
      const prevDate = new Date(prevDayTimestamp);
      const now = new Date();
      const hoursPassed = (now.getTime() - prevDate.getTime()) / (1000 * 60 * 60);
      if (hoursPassed < 24) {
        const unlockAt = new Date(prevDate.getTime() + 24 * 60 * 60 * 1000);
        const unlockAtStr = Utilities.formatDate(unlockAt, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
        const remainHours = Math.ceil(24 - hoursPassed);
        return createErrorResponse(
          'Day ' + day + ' は ' + unlockAtStr + ' に解放されます。（残り約' + remainHours + '時間）',
          'TIME_LOCKED',
        );
      }
    }
  }

  // 既にこのDayが回答済みかチェック
  const existingAnswer = sheet.getRange(row, dayAnswerCol(day)).getValue();
  if (existingAnswer && existingAnswer !== '') {
    return createErrorResponse(
      'Day ' + day + ' はすでに回答済みです。',
      'ALREADY_ANSWERED'
    );
  }

  // 回答を保存
  const now = new Date();
  const nowStr = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

  sheet.getRange(row, dayAnswerCol(day)).setValue(answer.trim());
  sheet.getRange(row, dayTimestampCol(day)).setValue(nowStr);

  // Day 7 完了時の処理
  if (day === 7) {
    sheet.getRange(row, COL.COMPLETED).setValue(true);
    sheet.getRange(row, COL.COMPLETED_AT).setValue(nowStr);

    const name = sheet.getRange(row, COL.NAME).getValue() || '（名前なし）';

    // LINE通知
    if (CONFIG.LINE_NOTIFY_ENABLED) {
      sendLineCompletionNotification(uid, name);
    }

    Logger.log('7日間完了: ' + uid + ' (' + name + ')');

    return createSuccessResponse({
      message: '7日間の浄化プログラム、おめでとうございます。あなたの心の器は、きっと軽くなっているはずです。',
      day: day,
      is_complete: true,
      completed_at: nowStr,
    });
  }

  // 次のDayの質問を返す
  const nextDay = day + 1;
  return createSuccessResponse({
    message: 'Day ' + day + ' の回答を受け取りました。',
    day: day,
    saved_at: nowStr,
    is_complete: false,
    next_day: nextDay,
    next_question: DAILY_QUESTIONS[nextDay - 1],
  });
}


// ============================================================
// プログレス構築
// ============================================================

/**
 * スプレッドシートの行データから進捗オブジェクトを構築
 * @param {Array} rowData - 1行分のデータ配列
 * @returns {Object} progress情報
 */
function buildProgressObject(rowData) {
  const days = {};
  let daysCompleted = 0;
  let currentDay = 1;
  const now = new Date();

  for (var d = 1; d <= 7; d++) {
    var answerVal = rowData[dayAnswerCol(d) - 1];
    var timestampVal = rowData[dayTimestampCol(d) - 1];
    var hasAnswer = answerVal && answerVal !== '';

    // unlock判定: Day1は常に解放、Day2以降は前日完了 + 24時間経過
    var isUnlocked = false;
    var unlockAt = null;
    var isTimeLocked = false;

    if (d === 1) {
      isUnlocked = true;
    } else {
      var prevAnswer = rowData[dayAnswerCol(d - 1) - 1];
      var prevTimestamp = rowData[dayTimestampCol(d - 1) - 1];
      if (prevAnswer && prevAnswer !== '' && prevTimestamp) {
        var prevDate = new Date(prevTimestamp);
        var unlockTime = new Date(prevDate.getTime() + 24 * 60 * 60 * 1000);
        if (now.getTime() >= unlockTime.getTime()) {
          isUnlocked = true;
        } else {
          isTimeLocked = true;
          unlockAt = Utilities.formatDate(unlockTime, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
        }
      }
    }

    // 既に回答済みなら解放済み扱い
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
      if (d < 7) {
        currentDay = d + 1;
      } else {
        currentDay = 7; // 全完了
      }
    }
  }

  // 全く未回答の場合、currentDayは1
  if (daysCompleted === 0) {
    currentDay = 1;
  }

  return {
    days: days,
    days_completed: daysCompleted,
    current_day: currentDay,
    total_days: 7,
    progress_percent: Math.round((daysCompleted / 7) * 100),
  };
}


// ============================================================
// スプレッドシート操作ユーティリティ
// ============================================================

/**
 * 対象シートを取得（なければ作成）
 */
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    writeHeaders(sheet);
    Logger.log('シート「' + CONFIG.SHEET_NAME + '」を新規作成しました。');
  }

  return sheet;
}

/**
 * ヘッダー行を書き込み
 */
function writeHeaders(sheet) {
  const headers = [
    'uid',           // A
    'name',          // B
    'registered_at', // C
    'day1_answer',   // D
    'day1_at',       // E
    'day2_answer',   // F
    'day2_at',       // G
    'day3_answer',   // H
    'day3_at',       // I
    'day4_answer',   // J
    'day4_at',       // K
    'day5_answer',   // L
    'day5_at',       // M
    'day6_answer',   // N
    'day6_at',       // O
    'day7_answer',   // P
    'day7_at',       // Q
    'completed',     // R
    'completed_at',  // S
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // ヘッダー行の書式設定
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4a90d9');
  headerRange.setFontColor('#ffffff');

  // 列幅調整
  sheet.setColumnWidth(1, 200);  // uid
  sheet.setColumnWidth(2, 120);  // name
  sheet.setColumnWidth(3, 160);  // registered_at
  for (var d = 1; d <= 7; d++) {
    sheet.setColumnWidth(dayAnswerCol(d), 300);     // 回答列は広め
    sheet.setColumnWidth(dayTimestampCol(d), 160);   // 日時列
  }
  sheet.setColumnWidth(COL.COMPLETED, 80);
  sheet.setColumnWidth(COL.COMPLETED_AT, 160);

  // 1行目を固定
  sheet.setFrozenRows(1);
}

/**
 * UIDで参加者の行番号を検索
 * @param {Sheet} sheet
 * @param {string} uid
 * @returns {number|null} 行番号（1-indexed）、見つからない場合はnull
 */
function findRowByUid(sheet, uid) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;

  const uidColumn = sheet.getRange(2, COL.UID, lastRow - 1, 1).getValues();

  for (var i = 0; i < uidColumn.length; i++) {
    if (String(uidColumn[i][0]).trim() === String(uid).trim()) {
      return i + 2; // +2 because: 0-indexed + header row
    }
  }

  return null;
}


// ============================================================
// 日時ユーティリティ
// ============================================================

/**
 * 日時値を文字列にフォーマット
 * @param {*} dateValue
 * @returns {string|null}
 */
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

/**
 * 7日間完了時のLINE通知を送信
 */
function sendLineCompletionNotification(uid, name) {
  if (!CONFIG.LINE_CHANNEL_TOKEN || !CONFIG.LINE_USER_ID) {
    Logger.log('LINE通知: トークンまたはユーザーIDが未設定のためスキップ');
    return;
  }

  const message = [
    '🎊 浄化プログラム 7days 完了通知',
    '',
    '参加者: ' + name,
    'UID: ' + uid,
    '完了日時: ' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
    '',
    '7日間のプログラムを完了しました。',
  ].join('\n');

  try {
    const url = 'https://api.line.me/v2/bot/message/push';
    const payload = {
      to: CONFIG.LINE_USER_ID,
      messages: [{
        type: 'text',
        text: message,
      }],
    };

    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + CONFIG.LINE_CHANNEL_TOKEN,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    Logger.log('LINE通知送信完了: ' + uid);
  } catch (err) {
    Logger.log('LINE通知エラー: ' + err.message);
  }
}


// ============================================================
// セットアップ関数（初回のみ手動実行）
// ============================================================

/**
 * スプレッドシートのヘッダーを作成する初期セットアップ
 * GASエディタで一度だけ手動実行してください
 */
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (sheet) {
    // 既存シートがある場合は確認
    const ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      'シート「' + CONFIG.SHEET_NAME + '」は既に存在します。',
      'ヘッダーを再設定しますか？（既存データは保持されます）',
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) {
      ui.alert('セットアップをキャンセルしました。');
      return;
    }
  } else {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }

  writeHeaders(sheet);

  SpreadsheetApp.getUi().alert(
    'セットアップ完了',
    'シート「' + CONFIG.SHEET_NAME + '」のヘッダーを設定しました。\n\n' +
    '次の手順:\n' +
    '1. デプロイ → 新しいデプロイ → ウェブアプリ\n' +
    '2. 実行するユーザー: 自分\n' +
    '3. アクセスできるユーザー: 全員（匿名含む）\n' +
    '4. デプロイURLをLP側に設定',
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  Logger.log('セットアップ完了: シート「' + CONFIG.SHEET_NAME + '」');
}


// ============================================================
// テスト・デバッグ用関数
// ============================================================

/**
 * テスト: 参加者登録のシミュレーション
 */
function testRegister() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: 'register',
        uid: 'test-uid-001',
        name: 'テスト太郎',
      }),
    },
  };

  const result = doPost(mockEvent);
  Logger.log(result.getContent());
}

/**
 * テスト: 回答送信のシミュレーション
 */
function testSubmit() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        action: 'submit',
        uid: 'test-uid-001',
        day: 1,
        answer: 'テスト回答: 心が重いです。',
      }),
    },
  };

  const result = doPost(mockEvent);
  Logger.log(result.getContent());
}

/**
 * テスト: ステータス取得のシミュレーション
 */
function testGetStatus() {
  const mockEvent = {
    parameter: {
      action: 'status',
      uid: 'test-uid-001',
    },
  };

  const result = doGet(mockEvent);
  Logger.log(result.getContent());
}

/**
 * テスト: 統計情報取得のシミュレーション
 */
function testGetStats() {
  const mockEvent = {
    parameter: {
      action: 'stats',
    },
  };

  const result = doGet(mockEvent);
  Logger.log(result.getContent());
}

/**
 * テスト: 全参加者一覧取得のシミュレーション
 */
function testGetList() {
  const mockEvent = {
    parameter: {
      action: 'list',
    },
  };

  const result = doGet(mockEvent);
  Logger.log(result.getContent());
}

/**
 * テストデータを削除（クリーンアップ用）
 */
function cleanupTestData() {
  const sheet = getSheet();
  const row = findRowByUid(sheet, 'test-uid-001');
  if (row) {
    sheet.deleteRow(row);
    Logger.log('テストデータを削除しました。');
  } else {
    Logger.log('テストデータが見つかりませんでした。');
  }
}
