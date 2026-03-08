// ============================================================
// 浄化プログラム 7days - API Backend (Google Apps Script)
//
// シート構成:
//   シート1 = 登録データ（エルメフォームから入力される）
//   day1〜day7 = 各日の回答データ（自動作成）
//
// 各dayシートのレイアウト:
//   A列 = タイムスタンプ（その日の最後のサブ質問に回答した時刻）
//   B列 = お名前
//   C列〜 = 質問①, 質問②, ... （サブ質問ごとに1列）
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
  NAME_COL: 7,   // お名前の列（G列=7）
  PIN_COL: 8,    // 暗証番号の列（H列=8）
};

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
// Dayシートの列定義
// ============================================================

const DCOL = {
  TIMESTAMP: 1,  // A: タイムスタンプ
  NAME: 2,       // B: お名前
  FIRST_Q: 3,    // C: 質問① (questions start here)
};

function dayQuestionCol(subIdx) {
  return DCOL.FIRST_Q + subIdx;
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
// 7日間の質問（2D配列: 各日に複数のサブ質問）
// ============================================================

const DAILY_QUESTIONS = [
  // --- Day 1 (7 questions) - 過去の浄化 ---
  [
    'あなたが今も引きずっている「過去」は何ですか?\n人間関係(元カレ、元カノ、友人、家族、職場の人)?\nお金(借金、浪費、投資の失敗)?\n仕事(転職、退職、失業)?\n健康(病気、妊娠、流産)?\nそれとも、他の何か?\n思いつく限り、全て書いてください。',
    'その「過去」を思い出すと、どんな感情が湧いてきますか?\n寂しい? 悲しい? 悔しい? 腹が立つ? 不安? 恐怖?\n全ての感情を、正直に書いてください。',
    '「あの時、こうしていれば...」\nそう後悔していることを、全て書き出してください。\n人間関係、お金、仕事、健康、何でも構いません。\n思いつく限り、全て書いてください。',
    '過去の失敗や選択で、今も自分を責めていることはありますか?\n「あの時の私が馬鹿だった」\n「なんであんな選択したんだろう」\n「私のせいで...」\nその時の気持ちを、全て書き出してください。',
    'もし過去に戻れるなら、あなたは何をしますか?\n人間関係をやり直す? お金の使い方を変える?\n違う仕事を選ぶ? 健康にもっと気を使う?\n具体的に書いてください。',
    'その「過去」のせいで、あなたは何を失ったと感じていますか?\n人? お金? 時間? 健康? チャンス? 幸せ?\n正直に書いてください。',
    'でも、現実には過去には戻れません。\nそれを理解した上で、今のあなたは何を感じますか?\n諦め? 悲しみ? それとも、もう前を向きたい?\n正直な気持ちを書いてください。',
  ],

  // --- Day 2 (7 questions) - 過去の振り返り・手放し ---
  [
    '昨日過去を書き出した後、何か変化はありましたか?\n夜、よく眠れましたか?\n朝、目覚めた時、何か違いを感じましたか?\n小さなことでもいいので、気づいたことを書いてください。',
    '昨日書き出した「過去」のことを、今どう思いますか?\nまだ引きずってる? 少し楽になった? まだモヤモヤしてる?\n正直な気持ちを書いてください。',
    'その「過去」から、あなたは何を得ましたか?\n「何も得ていない」と思うかもしれません。\nでも、本当に何もないですか?\n学び? 経験? 強さ?\nそれとも、何もない?\n正直に書いてください。',
    'もし、過去のあなた(5年前のあなた)が、今のあなたの目の前に現れたら、あなたは何と声をかけますか?\n「その選択は間違ってるよ」?\n「そのままでいいよ」?\n「もっとこうしたほうがいいよ」?\n過去の自分に、メッセージを送ってください。',
    'あなたは、いつまで過去に囚われていたいですか?\n正直に答えてください。\nまだしばらく引きずっていたい?\nそれとも、今すぐ手放したい?',
    '「過去を手放す」と決めた時、何が怖いですか?\n思い出がなくなること?\nあの人を完全に忘れてしまうこと?\n新しい一歩を踏み出すこと?\nまた同じ失敗をすること?\n正直な気持ちを書いてください。',
    'もし、今日で過去を完全に手放せるとしたら、あなたは手放しますか?\nそれとも、まだ持っていたいですか?\n正直に答えてください。',
  ],

  // --- Day 3 (8 questions) - 怒り・許せないこと ---
  [
    'あなたが今も許せない人・出来事は何ですか?\n人(家族、恋人、友人、上司、同僚)?\n会社(ブラック企業、不当な扱い)?\n社会(不公平、理不尽)?\n自分の身体(病気、妊娠できない、太っている)?\nお金(貧乏、借金、詐欺)?\n思いつく限り、全て書いてください。',
    'その人・出来事に、何をされましたか?\nまたは、何が起きましたか?\n具体的に書いてください。\n思い出すだけで腹が立つかもしれません。\nでも、全て書き出してください。',
    'それを思い出すと、どんな感情が湧いてきますか?\n怒り? 憎しみ? 悲しみ? 悔しさ? 無力感?\n全ての感情を、正直に書いてください。',
    'もし、その人が今あなたの目の前にいたら、あなたは何と言いたいですか?\n遠慮なく、思いつく限り、全て書いてください。\n汚い言葉でも構いません。\n誰も見ていません。',
    '「あの人のせいで、私の人生は...」\n「あの出来事のせいで、私は...」\nそう思ってしまうことはありますか?\nある場合、具体的に何を失ったと感じていますか?',
    '「なんで私ばっかり...」\nそう思ったことはありますか?\nある場合、その時の気持ちを全て書いてください。',
    '復讐したいと思ったことはありますか?\n正直に答えてください。\nある場合、どんな復讐を考えましたか?',
    'でも、復讐しても、あなたの心は満たされないかもしれません。\nそれでも、あなたは復讐したいですか?\nそれとも、もう手放したいですか?\n正直な気持ちを書いてください。',
  ],

  // --- Day 4 (7 questions) - 怒りの振り返り・手放し ---
  [
    '昨日、怒りを書き出した後、何か変化はありましたか?\n少し楽になった? まだモヤモヤしてる?\n正直な気持ちを書いてください。',
    '昨日書き出した人・出来事のことを、今どう思いますか?\nまだ許せない? 少し許せるようになった? どうでもよくなった?\n正直に書いてください。',
    '「なんで私ばっかり...」\nそう思ったことはありますか?\nある場合、その時の気持ちを全て書き出してください。',
    'あなたが怒りを感じる時、本当はどうしてほしかったんですか?\n謝ってほしかった? 認めてほしかった?\n助けてほしかった? 理解してほしかった?\n本当の気持ちを書いてください。',
    'もし、あなたが許せない人が、今あなたの目の前に現れて、「本当にごめん」と謝ってきたら、あなたはどうしますか?\n許せる? 許せない?\n正直な気持ちを書いてください。',
    'その人を許すことで、あなたは何を失いますか?\n怒る理由? 被害者でいられること?\nそれとも、何も失わない?\n正直に書いてください。',
    'もし、今日でその怒りを完全に手放せるとしたら、あなたは手放しますか?\nそれとも、まだ持っていたいですか?\n正直に答えてください。',
  ],

  // --- Day 5 (7 questions) - 自己否定 ---
  [
    '「私なんて...」\n普段、そう思ってしまうことはありますか?\nどんな時に、そう思いますか?\n全て書き出してください。',
    '自分のどこが嫌いですか?\n自分のどこが許せないですか?\n容姿、性格、過去の行動...\n全て、書き出してください。',
    '「どうせ私には無理」\n「私には価値がない」\nそう思ってしまう瞬間はありますか?\nその時の気持ちを、全て書いてください。',
    '他人と自分を比べて、落ち込むことはありますか?\n「あの人はできるのに、私は...」\n「みんなは幸せなのに、私は...」\nその時の気持ちを、全て書いてください。',
    '自分を責める時、あなたは自分に何と言っていますか?\n「馬鹿」「ダメ人間」「クズ」\n思いつく限り、全て書いてください。',
    'もし、あなたの大切な友人が、今あなたが書いたような自己否定をしていたら、あなたは何と声をかけますか?',
    'もし、今日でその自己否定を完全に手放せるとしたら、あなたは手放しますか?\nそれとも、まだ持っていたいですか?\n正直に答えてください。',
  ],

  // --- Day 6 (7 questions) - 未来・前向き ---
  [
    '5日間、ネガティブな感情を吐き出してきました。\n今、どんな気持ちですか?\n心は軽くなりましたか?\n正直な気持ちを書いてください。',
    '今、あなたの心の中に、どんな感情がありますか?\nスッキリ? ワクワク? それとも、まだモヤモヤ?\n正直に書いてください。',
    'あなたは、本当はどんな気持ちで毎日を過ごしたいですか?\n幸せ? 安心? ワクワク? 穏やか?\n素直な気持ちを書いてください。',
    'あなたは、本当はどんな自分になりたいですか?\n自信がある自分? 優しい自分? 強い自分? 自由な自分?\n素直に書いてください。',
    'もし、1年後、あなたの願いが全て叶っているとしたら、どんな生活をしていますか?\n朝起きて、何をしていますか?\n誰といますか? どんな気持ちですか?\n具体的に想像して、書いてください。',
    'その未来を想像した時、どんな感情が湧いてきましたか?\nワクワクした? 嬉しい?\nそれとも、「無理かも...」と思った?\n正直に書いてください。',
    'その未来を手に入れるために、今日から何を始めますか?\n小さなことでもいいです。\n一つだけ、書いてください。',
  ],

  // --- Day 7 (6 questions) - 7日間の振り返り ---
  [
    '7日間を振り返って、どうでしたか?\n心は軽くなりましたか?\n何か気づいたことはありましたか?\n感想を自由に書いてください。',
    '7日前のあなたと、今のあなたを比べてみてください。\n何が変わりましたか?\n心? 気持ち? 考え方?\n気づいたことを、全て書いてください。',
    'これから、あなたは何をしたいですか?\n挑戦したいこと、始めたいこと、やめたいこと。\n全て書いてください。',
    '2026年、あなたはどんな年にしたいですか?\nどんな自分になっていたいですか?\n何を手に入れていたいですか?\n自由に書いてください。',
    '1年後の自分に、メッセージを送ってください。\n「1年後の私へ」\nどんな言葉を贈りますか?',
    '今のあなたに、一言メッセージを送るとしたら、何と言いますか?\n自分を褒めてください。\n自分を励ましてください。',
  ],
];


// ============================================================
// 質問数ヘルパー
// ============================================================

function getQuestionCount(dayNum) {
  return DAILY_QUESTIONS[dayNum - 1].length;
}


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
    case 'update':
      return handleUpdate(body);
    case 'admin':
      return handleAdmin(body);
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
  if (firstCellVal === '' || /名前|name|お名前|入力/i.test(firstCellVal)) {
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
        // 認証成功 → dayシートから進捗を構築
        var progress = buildProgressObject(name);

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
// submit - 回答送信（シート1でPIN照合→dayシートに保存）
// サブ質問対応版: body.sub (0-indexed) で個別サブ質問に回答
// ============================================================

function handleSubmit(body) {
  var name = (body.name || '').trim();
  var pin = body.pin || '';
  var day = parseInt(body.day, 10);
  var sub = parseInt(body.sub, 10);
  var answer = body.answer;

  // --- バリデーション ---
  if (!name) {
    return createErrorResponse('名前が必要です。', 'MISSING_NAME');
  }
  if (!pin) {
    return createErrorResponse('暗証番号が必要です。', 'MISSING_PIN');
  }
  if (!day || day < 1 || day > 7) {
    return createErrorResponse('day は 1〜7 の数値で指定してください。', 'INVALID_DAY');
  }
  if (isNaN(sub) || sub < 0 || sub >= getQuestionCount(day)) {
    return createErrorResponse('sub は 0〜' + (getQuestionCount(day) - 1) + ' の数値で指定してください。', 'INVALID_SUB');
  }
  if (!answer || answer.trim() === '') {
    return createErrorResponse('回答が空です。あなたの心の声を聞かせてください。', 'EMPTY_ANSWER');
  }

  // --- シート1でPIN照合 ---
  var regSheet = getRegSheet();
  if (!verifyPin(regSheet, name, pin)) {
    return createErrorResponse('認証に失敗しました。', 'AUTH_FAILED');
  }

  // --- dayシートで進捗管理 ---
  var sheet = getDaySheet(day);
  var row = findDayRowByName(sheet, name);

  if (!row) {
    // まだこのdayシートにエントリなし → 作成
    createDayEntry(sheet, name, day);
    row = findDayRowByName(sheet, name);
  }

  // --- 全プログラム完了済みチェック ---
  var day7Sheet = getDaySheet(7);
  var day7Row = findDayRowByName(day7Sheet, name);
  if (day7Row && isDayComplete(day7Sheet, day7Row, 7)) {
    return createErrorResponse('すでに7日間のプログラムを完了しています。', 'ALREADY_COMPLETED');
  }

  // --- Day順序チェック: 前のDayが全て完了しているか ---
  if (day > 1) {
    var prevSheet = getDaySheet(day - 1);
    var prevRow = findDayRowByName(prevSheet, name);
    if (!prevRow || !isDayComplete(prevSheet, prevRow, day - 1)) {
      return createErrorResponse('Day ' + (day - 1) + ' がまだ完了していません。順番に進めてください。', 'DAY_LOCKED');
    }

    // 21:00リセットチェック（前日が完了している場合のみ）
    var prevTimestamp = prevSheet.getRange(prevRow, DCOL.TIMESTAMP).getValue();
    if (prevTimestamp) {
      var now = new Date();
      var unlockAt = getNextUnlockTime(prevTimestamp);
      if (now.getTime() < unlockAt.getTime()) {
        var unlockAtStr = Utilities.formatDate(unlockAt, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
        return createErrorResponse('Day ' + day + ' は ' + unlockAtStr + ' に解放されます。', 'TIME_LOCKED');
      }
    }
  }

  // --- このサブ質問が回答済みかチェック ---
  var existingAnswer = sheet.getRange(row, dayQuestionCol(sub)).getValue();
  if (existingAnswer && String(existingAnswer).trim() !== '') {
    return createErrorResponse('Day ' + day + ' の質問 ' + (sub + 1) + ' はすでに回答済みです。', 'ALREADY_ANSWERED');
  }

  // --- サブ質問の順序チェック: 前のサブ質問が回答済みか ---
  if (sub > 0) {
    for (var s = 0; s < sub; s++) {
      var prevSubAnswer = sheet.getRange(row, dayQuestionCol(s)).getValue();
      if (!prevSubAnswer || String(prevSubAnswer).trim() === '') {
        return createErrorResponse('質問 ' + (s + 1) + ' がまだ回答されていません。順番に進めてください。', 'SUB_LOCKED');
      }
    }
  }

  // --- 回答を書き込み ---
  sheet.getRange(row, dayQuestionCol(sub)).setValue(answer.trim());

  // --- タイムスタンプ ---
  var now = new Date();
  var nowStr = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');

  // --- Day完了チェック（全サブ質問が回答済みか） ---
  var dayComplete = isDayCompleteAfterWrite(sheet, row, day, sub);

  if (dayComplete) {
    // 全サブ質問回答済み → タイムスタンプをA列にセット
    sheet.getRange(row, DCOL.TIMESTAMP).setValue(nowStr);
  }

  if (dayComplete && day === 7) {
    // 全プログラム完了
    if (CONFIG.LINE_NOTIFY_ENABLED) {
      sendLineNotification(name);
    }

    Logger.log('7日間完了: ' + name);

    return createSuccessResponse({
      message: '7日間の浄化プログラム、おめでとうございます。',
      day: day,
      sub: sub,
      is_day_complete: true,
      is_complete: true,
      completed_at: nowStr,
    });
  }

  if (dayComplete) {
    // このDayの全サブ質問完了 → 次のDayへ
    Logger.log('Day ' + day + ' 完了: ' + name);

    return createSuccessResponse({
      message: 'Day ' + day + ' の全ての質問に回答しました。',
      day: day,
      sub: sub,
      is_day_complete: true,
      is_complete: false,
      saved_at: nowStr,
      next_day: day + 1,
      next_day_questions: DAILY_QUESTIONS[day],  // 次のDayの質問配列
    });
  }

  // このDayのサブ質問がまだ残っている
  var nextSub = sub + 1;
  return createSuccessResponse({
    message: 'Day ' + day + ' の質問 ' + (sub + 1) + ' の回答を受け取りました。',
    day: day,
    sub: sub,
    is_day_complete: false,
    is_complete: false,
    saved_at: nowStr,
    next_sub: nextSub,
    next_question: DAILY_QUESTIONS[day - 1][nextSub],
    sub_completed: sub + 1,
    total_sub_questions: getQuestionCount(day),
  });
}


// ============================================================
// update - 回答修正（既存の回答を上書き）
// サブ質問対応版: body.sub (0-indexed) で個別サブ質問を修正
// ============================================================

function handleUpdate(body) {
  var name = (body.name || '').trim();
  var pin = body.pin || '';
  var day = parseInt(body.day, 10);
  var sub = parseInt(body.sub, 10);
  var answer = body.answer;

  if (!name) return createErrorResponse('名前が必要です。', 'MISSING_NAME');
  if (!pin) return createErrorResponse('暗証番号が必要です。', 'MISSING_PIN');
  if (!day || day < 1 || day > 7) return createErrorResponse('day は 1〜7 の数値で指定してください。', 'INVALID_DAY');
  if (isNaN(sub) || sub < 0 || sub >= getQuestionCount(day)) {
    return createErrorResponse('sub は 0〜' + (getQuestionCount(day) - 1) + ' の数値で指定してください。', 'INVALID_SUB');
  }
  if (!answer || answer.trim() === '') return createErrorResponse('回答が空です。', 'EMPTY_ANSWER');

  // シート1でPIN照合
  var regSheet = getRegSheet();
  if (!verifyPin(regSheet, name, pin)) {
    return createErrorResponse('認証に失敗しました。', 'AUTH_FAILED');
  }

  // dayシートで該当行を取得
  var sheet = getDaySheet(day);
  var row = findDayRowByName(sheet, name);
  if (!row) return createErrorResponse('進捗データがありません。', 'NO_PROGRESS');

  // 該当サブ質問が回答済みかチェック（未回答のサブ質問は修正できない）
  var existingAnswer = sheet.getRange(row, dayQuestionCol(sub)).getValue();
  if (!existingAnswer || String(existingAnswer).trim() === '') {
    return createErrorResponse('Day ' + day + ' の質問 ' + (sub + 1) + ' はまだ回答していません。', 'NOT_ANSWERED');
  }

  // 回答上書き
  sheet.getRange(row, dayQuestionCol(sub)).setValue(answer.trim());

  // タイムスタンプ更新
  var now = new Date();
  var nowStr = Utilities.formatDate(now, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  sheet.getRange(row, DCOL.TIMESTAMP).setValue(nowStr + ' (修正)');

  Logger.log('回答修正: ' + name + ' Day' + day + ' Q' + (sub + 1));

  return createSuccessResponse({
    message: 'Day ' + day + ' の質問 ' + (sub + 1) + ' の回答を修正しました。',
    day: day,
    sub: sub,
    saved_at: nowStr,
  });
}


// ============================================================
// stats - 統計（全dayシートベース）
// ============================================================

function handleGetStats() {
  var dayBreakdown = {};
  var allNames = {};
  var completedNames = {};
  var todaySubs = 0;
  var today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');

  for (var d = 1; d <= 7; d++) {
    dayBreakdown['day' + d] = 0;
    var sheet = getDaySheet(d);
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) continue;

    var totalQ = getQuestionCount(d);
    var totalCols = DCOL.FIRST_Q + totalQ - 1;  // 最後の質問列
    var data = sheet.getRange(2, 1, lastRow - 1, totalCols).getValues();

    for (var r = 0; r < data.length; r++) {
      var rowName = String(data[r][DCOL.NAME - 1]).trim();
      if (!rowName) continue;
      allNames[rowName] = true;

      // この日が完了しているかチェック
      var allAnswered = true;
      for (var q = 0; q < totalQ; q++) {
        var val = data[r][DCOL.FIRST_Q - 1 + q];
        if (!val || String(val).trim() === '') {
          allAnswered = false;
          break;
        }
      }

      if (allAnswered) {
        dayBreakdown['day' + d]++;

        // 今日の提出かチェック
        var ts = data[r][DCOL.TIMESTAMP - 1];
        if (ts) {
          var tsStr = String(ts).replace(' (修正)', '');
          try {
            var subDate = Utilities.formatDate(new Date(tsStr), CONFIG.TIMEZONE, 'yyyy-MM-dd');
            if (subDate === today) todaySubs++;
          } catch (e) {
            // タイムスタンプパースエラーは無視
          }
        }

        // Day7完了 = プログラム完了
        if (d === 7) {
          completedNames[rowName] = true;
        }
      }
    }
  }

  var total = Object.keys(allNames).length;
  var completed = Object.keys(completedNames).length;

  return createSuccessResponse({
    total_participants: total,
    completed_count: completed,
    completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
    day_breakdown: dayBreakdown,
    today_submissions: todaySubs,
  });
}


// ============================================================
// admin - 管理画面用データ取得
// ============================================================

function handleAdmin(body) {
  var adminKey = body.admin_key || '';

  if (adminKey !== 'jouka7admin') {
    return createErrorResponse('管理キーが違います。', 'INVALID_ADMIN_KEY');
  }

  // --- ユーザー一覧（シート1から取得）---
  var regSheet = getRegSheet();
  var lastRow = regSheet.getLastRow();
  var users = [];

  if (lastRow >= 1) {
    var startRow = 1;
    var firstCellVal = String(regSheet.getRange(1, REG.NAME_COL).getValue()).trim();
    if (firstCellVal === '' || /名前|name|お名前|入力/i.test(firstCellVal)) {
      startRow = 2;
    }

    if (lastRow >= startRow) {
      var dataRows = lastRow - startRow + 1;
      var names = regSheet.getRange(startRow, REG.NAME_COL, dataRows, 1).getValues();
      var pins = regSheet.getRange(startRow, REG.PIN_COL, dataRows, 1).getValues();

      for (var i = 0; i < dataRows; i++) {
        var rowName = String(names[i][0]).trim();
        if (rowName) {
          users.push({
            name: rowName,
            pin: String(pins[i][0]).trim(),
            row: startRow + i,
          });
        }
      }
    }
  }

  // --- 各Dayのデータ取得 ---
  var dayDataObj = {};

  for (var d = 1; d <= 7; d++) {
    var sheet = getDaySheet(d);
    var sheetLastRow = sheet.getLastRow();
    var dayEntries = [];

    if (sheetLastRow > 1) {
      var totalQ = getQuestionCount(d);
      var totalCols = DCOL.FIRST_Q + totalQ - 1;
      var data = sheet.getRange(2, 1, sheetLastRow - 1, totalCols).getValues();

      for (var r = 0; r < data.length; r++) {
        var entryName = String(data[r][DCOL.NAME - 1]).trim();
        if (!entryName) continue;

        var ts = data[r][DCOL.TIMESTAMP - 1];
        var tsStr = '';
        if (ts) {
          if (ts instanceof Date) {
            tsStr = Utilities.formatDate(ts, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
          } else {
            tsStr = String(ts);
          }
        }

        var answers = [];
        for (var q = 0; q < totalQ; q++) {
          var val = data[r][DCOL.FIRST_Q - 1 + q];
          answers.push(val ? String(val) : '');
        }

        dayEntries.push({
          name: entryName,
          timestamp: tsStr,
          answers: answers,
        });
      }
    }

    dayDataObj['day' + d] = dayEntries;
  }

  return createSuccessResponse({
    users: users,
    day_data: dayDataObj,
  });
}


// ============================================================
// プログレス構築
// ============================================================

function buildProgressObject(name) {
  var days = {};
  var daysCompleted = 0;
  var currentDay = 1;
  var now = new Date();

  for (var d = 1; d <= 7; d++) {
    var sheet = getDaySheet(d);
    var row = findDayRowByName(sheet, name);
    var totalSubQuestions = getQuestionCount(d);
    var answers = [];
    var subCompleted = 0;
    var timestampVal = null;

    if (row) {
      // ユーザー行が存在 → 各質問列を読み取る
      var lastQCol = dayQuestionCol(totalSubQuestions - 1);
      var rowData = sheet.getRange(row, 1, 1, lastQCol).getValues()[0];
      timestampVal = rowData[DCOL.TIMESTAMP - 1];

      for (var s = 0; s < totalSubQuestions; s++) {
        var val = rowData[dayQuestionCol(s) - 1];
        if (val && String(val).trim() !== '') {
          answers.push(String(val));
          subCompleted++;
        } else {
          answers.push(null);
        }
      }
    } else {
      // ユーザー行なし → 全て未回答
      for (var s = 0; s < totalSubQuestions; s++) {
        answers.push(null);
      }
    }

    var dayFullyComplete = (subCompleted === totalSubQuestions && totalSubQuestions > 0);

    var isUnlocked = false;
    var unlockAt = null;
    var isTimeLocked = false;

    if (d === 1) {
      isUnlocked = true;
    } else {
      // 前日のシートをチェック
      var prevSheet = getDaySheet(d - 1);
      var prevRow = findDayRowByName(prevSheet, name);
      var prevDayComplete = false;
      var prevTimestamp = null;

      if (prevRow) {
        prevDayComplete = isDayComplete(prevSheet, prevRow, d - 1);
        prevTimestamp = prevSheet.getRange(prevRow, DCOL.TIMESTAMP).getValue();
      }

      if (prevDayComplete && prevTimestamp) {
        var tsStr = String(prevTimestamp).replace(' (修正)', '');
        var unlockTime = getNextUnlockTime(tsStr);
        if (now.getTime() >= unlockTime.getTime()) {
          isUnlocked = true;
        } else {
          isTimeLocked = true;
          unlockAt = Utilities.formatDate(unlockTime, CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
        }
      }
    }

    // 既に回答があればアンロック扱い
    if (subCompleted > 0) isUnlocked = true;

    days['day' + d] = {
      questions: DAILY_QUESTIONS[d - 1],
      answers: answers,
      answered_at: (subCompleted > 0) ? formatDate(timestampVal) : null,
      sub_completed: subCompleted,
      total_sub_questions: totalSubQuestions,
      is_completed: dayFullyComplete,
      is_unlocked: isUnlocked,
      is_time_locked: isTimeLocked,
      unlock_at: unlockAt,
    };

    if (dayFullyComplete) {
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
    var totalSubQuestions = getQuestionCount(d);
    var emptyAnswers = [];
    for (var s = 0; s < totalSubQuestions; s++) {
      emptyAnswers.push(null);
    }

    days['day' + d] = {
      questions: DAILY_QUESTIONS[d - 1],
      answers: emptyAnswers,
      answered_at: null,
      sub_completed: 0,
      total_sub_questions: totalSubQuestions,
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
// Dayシート操作ユーティリティ
// ============================================================

/** シート1（登録データ）を取得 */
function getRegSheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

/** dayシート（day1〜day7）を取得・自動作成 */
function getDaySheet(dayNum) {
  var sheetName = 'day' + dayNum;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    writeDayHeaders(sheet, dayNum);
    Logger.log('シート「' + sheetName + '」を作成しました。');
  }
  return sheet;
}

/** dayシートのヘッダーを書き込み */
function writeDayHeaders(sheet, dayNum) {
  var questions = DAILY_QUESTIONS[dayNum - 1];
  var headers = ['タイムスタンプ', 'お名前'];

  for (var i = 0; i < questions.length; i++) {
    // 質問テキストの最初の行だけをヘッダーに使用
    var firstLine = questions[i].split('\n')[0];
    // 長すぎる場合は40文字で切る
    if (firstLine.length > 40) {
      firstLine = firstLine.substring(0, 40) + '...';
    }
    headers.push('質問' + numToCircled(i + 1) + ' ' + firstLine);
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4a90d9');
  headerRange.setFontColor('#ffffff');

  // 列幅設定
  sheet.setColumnWidth(DCOL.TIMESTAMP, 160);
  sheet.setColumnWidth(DCOL.NAME, 140);
  for (var i = 0; i < questions.length; i++) {
    sheet.setColumnWidth(dayQuestionCol(i), 300);
  }
  sheet.setFrozenRows(1);
}

/** 数字を丸数字に変換（1〜20対応） */
function numToCircled(n) {
  var circled = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩',
                 '⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳'];
  if (n >= 1 && n <= 20) return circled[n - 1];
  return '(' + n + ')';
}

/** dayシートで名前から行番号を検索（B列） */
function findDayRowByName(sheet, name) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;

  var nameCol = sheet.getRange(2, DCOL.NAME, lastRow - 1, 1).getValues();
  for (var i = 0; i < nameCol.length; i++) {
    if (String(nameCol[i][0]).trim() === name.trim()) {
      return i + 2;
    }
  }
  return null;
}

/** dayシートに新規エントリ作成（名前をB列に、他は空） */
function createDayEntry(sheet, name, dayNum) {
  var totalQ = getQuestionCount(dayNum);
  var newRow = ['', name];  // A: タイムスタンプ(空), B: 名前
  for (var i = 0; i < totalQ; i++) {
    newRow.push('');  // 各質問列は空
  }
  sheet.appendRow(newRow);
}

/** dayシートの指定行が全サブ質問回答済みかチェック */
function isDayComplete(sheet, row, dayNum) {
  var totalQ = getQuestionCount(dayNum);
  for (var q = 0; q < totalQ; q++) {
    var val = sheet.getRange(row, dayQuestionCol(q)).getValue();
    if (!val || String(val).trim() === '') return false;
  }
  return true;
}

/**
 * 回答書き込み直後に全サブ質問回答済みかチェック（最適化版）
 * 今書いた sub は回答済みとして扱い、他のセルだけ確認する
 */
function isDayCompleteAfterWrite(sheet, row, dayNum, justWrittenSub) {
  var totalQ = getQuestionCount(dayNum);
  for (var q = 0; q < totalQ; q++) {
    if (q === justWrittenSub) continue;  // 今書いたばかりなのでスキップ
    var val = sheet.getRange(row, dayQuestionCol(q)).getValue();
    if (!val || String(val).trim() === '') return false;
  }
  return true;
}

/** シート1でPIN照合 */
function verifyPin(regSheet, name, pin) {
  var lastRow = regSheet.getLastRow();
  if (lastRow < 1) return false;

  var startRow = 1;
  var firstCellVal = String(regSheet.getRange(1, REG.NAME_COL).getValue()).trim();
  if (firstCellVal === '' || /名前|name|お名前|入力/i.test(firstCellVal)) {
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

function setupDaySheets() {
  for (var d = 1; d <= 7; d++) {
    getDaySheet(d);
  }
  SpreadsheetApp.getUi().alert('セットアップ完了', 'day1〜day7 シートを準備しました。', SpreadsheetApp.getUi().ButtonSet.OK);
}
