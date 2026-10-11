/* モンスト スクショ読取ツール（試作）— Apps Script サーバー側
   1キャラ分のキャラクター詳細スクリーンショット2枚を1回の Gemini リクエストにまとめて渡し、読み取った文字を1キャラ分の JSON で返す。
   （互換のため、従来の1枚形式 { base64Data, mimeType } も受け付ける）
   ・画像は保存しない（Drive・Spreadsheet・Script Properties・キャッシュのどこにも書かない）
   ・APIキーは Script Property「GEMINI_API_KEY」から読むだけ。画面・ログ・返り値に出さない
   ・モデル名は Script Property「GEMINI_MODEL」で上書きできる。未設定なら MSR_DEFAULT_MODEL
   ・読み取り結果は確定値ではない。必ず人が確認する前提で、怪しい点は needsReview にする
   ・既存のモンストキャラ管理アプリ（GitHub Pages）とは連携しない。JSON は画面からコピーするだけ */

var MSR_FORMAT = 'monst-screenshot-reading-v1';
var MSR_API_KEY_PROPERTY = 'GEMINI_API_KEY';
var MSR_MODEL_PROPERTY = 'GEMINI_MODEL';
// 画像入力・構造化出力に対応した安定版の軽量モデル（2026-10 時点）。変わったら GEMINI_MODEL で上書きする
var MSR_DEFAULT_MODEL = 'gemini-3.5-flash-lite';
var MSR_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

// 再試行は 429 / 503 だけ。最大2回（計3回）、待ちは 1秒→2秒。
// 開始から MSR_RETRY_BUDGET_MS を過ぎていたら再試行しない（Apps Script の6分上限を圧迫しないため）
var MSR_RETRY_STATUS = [429, 503];
var MSR_RETRY_WAIT_MS = [1000, 2000];
var MSR_RETRY_BUDGET_MS = 60 * 1000;

var MSR_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
var MSR_MAX_BASE64_CHARS = 7 * 1024 * 1024; // 約5MB（画面側で縮小してから送る）

var MSR_PAIR_SIZE = 2; // 1キャラ＝スクショ2枚

var MSR_TEXT_FIELDS = ['characterName', 'formName', 'monsterNo', 'race', 'battleType', 'shotType', 'fruit1', 'fruit2', 'fruit3', 'fruit4'];
var MSR_CONFIDENCE = ['HIGH', 'MEDIUM', 'LOW'];
// 2枚読み取り時だけ、同一キャラ判定のために各画像のキャラ名・図鑑No.も答えさせる（返す JSON には含めない）
var MSR_SAME_CHARACTER = ['YES', 'NO', 'UNKNOWN'];
var MSR_IDENTITY_FIELDS = ['image1CharacterName', 'image1MonsterNo', 'image2CharacterName', 'image2MonsterNo'];
var MSR_FIELD_LABELS = {
  characterName: 'キャラ名', formName: '進化形態', monsterNo: '図鑑No.', race: '種族', battleType: '戦型', shotType: '撃種',
  fruit1: 'わくわくの実1', fruit2: 'わくわくの実2', fruit3: 'わくわくの実3', fruit4: 'わくわくの実4'
};
// 値の訂正はしない。一覧に無い表記は「要確認」の理由として知らせるだけ（モンストキャラ管理アプリ trial と同じ一覧）
var MSR_KNOWN_BATTLE_TYPES = ['バランス型', 'パワー型', 'スピード型', '砲撃型', '超バランス型', '超パワー型', '超スピード型', '超砲撃型'];
var MSR_KNOWN_SHOT_TYPES = ['反射', '貫通'];
var MSR_MAX_TEXT = 120;
var MSR_MAX_NOTES = 20;

var MSR_PROMPT = [
  'あなたは、スマートフォンゲーム「モンスターストライク」のキャラクター詳細画面のスクリーンショットから、表示されている文字を書き写す係です。',
  '次のルールを必ず守ってください。',
  '1. 画像に表示されている文字だけを、表示どおりに書き写す。ゲームの知識・記憶から推測して補ったり、書き換えたりしない。',
  '2. キャラ名・進化形態名は、正式名称や有名な表記を知っていても、画像の表記を優先してそのまま書き写す（誤字に見えても直さない）。',
  '3. 図鑑No.から、キャラ名・種族・戦型・撃種などを推測しない。図鑑No.は数字だけを書き写す。',
  '4. 画像に写っていない項目、隠れている項目、小さすぎて読めない項目は null にする。',
  '5. わくわくの実は、画像に表示されている実だけを、上から順に fruit1〜fruit4 へ、名前と等級を表示どおりに1つの文字列で書き写す。実が見えない枠は null にする。',
  '6. 少しでも読み取りに自信が無い項目は uncertainFields にその項目名を入れ、needsReview を true にする。',
  '7. null にした理由や曖昧な理由は、reviewNotes に短い日本語で書く（例：「撃種の表示が画像の外で見えない」）。',
  '8. 画像がモンストのキャラクター詳細画面でない場合は、すべての項目を null、confidence を LOW、needsReview を true にし、その旨を reviewNotes に書く。',
  '9. confidence は読み取り全体の確信度で、HIGH（すべてはっきり読めた）/ MEDIUM / LOW のいずれか。',
  '10. 指定された JSON だけを出力し、説明文やコードブロックを付けない。'
].join('\n');

// 2枚用の指示文。画像は【画像1】【画像2】の見出しの直後に置く
var MSR_PROMPT_PAIR = [
  'あなたは、スマートフォンゲーム「モンスターストライク」のキャラクター詳細画面のスクリーンショットから、表示されている文字を書き写す係です。',
  '今回は画像が2枚（【画像1】【画像2】）あります。この2枚は、同じ1体のキャラクターの情報を補い合うためのスクリーンショットです。2枚を合わせて読み、1体分の結果を1つだけ返してください。',
  '次のルールを必ず守ってください。',
  '1. 画像に表示されている文字だけを、表示どおりに書き写す。ゲームの知識・記憶から推測して補ったり、書き換えたりしない。',
  '2. キャラ名・進化形態名は、正式名称や有名な表記を知っていても、画像の表記を優先してそのまま書き写す（誤字に見えても直さない）。',
  '3. 図鑑No.から、キャラ名・種族・戦型・撃種などを推測しない。図鑑No.は数字だけを書き写す。',
  '4. 同じ項目が2枚の両方に写っていて内容が同じなら、1つにまとめて書く。片方にしか写っていない項目は、写っている方の画像から書き写す。',
  '5. 同じ項目が2枚で食い違う場合は、推測でどちらかに決めない。よりはっきり読める方を書き写したうえで、uncertainFields にその項目名を入れ、needsReview を true にし、reviewNotes に食い違いを短く書く。',
  '6. どちらの画像にも写っていない項目、隠れている項目、小さすぎて読めない項目は null にする。',
  '7. わくわくの実は、画像に表示されている実だけを、上から順に fruit1〜fruit4 へ、名前と等級を表示どおりに1つの文字列で書き写す。実が見えない枠は null にする。',
  '8. 少しでも読み取りに自信が無い項目は uncertainFields にその項目名を入れ、needsReview を true にする。null にした理由や曖昧な理由は、reviewNotes に短い日本語で書く。',
  '9. image1CharacterName と image1MonsterNo には【画像1】に写っているキャラ名と図鑑No.を、image2CharacterName と image2MonsterNo には【画像2】に写っているものを、それぞれ表示どおりに書き写す。写っていなければ null にする。',
  '10. sameCharacter は、2枚が同じキャラクターかどうか。キャラ名や図鑑No.がはっきり一致すれば YES、はっきり違えば NO、どちらかの画像から判断できなければ UNKNOWN。見た目の印象だけで NO にしない。',
  '11. 画像がモンストのキャラクター詳細画面でない場合は、すべての項目を null、confidence を LOW、needsReview を true にし、その旨を reviewNotes に書く。',
  '12. confidence は読み取り全体の確信度で、HIGH（すべてはっきり読めた）/ MEDIUM / LOW のいずれか。',
  '13. 指定された JSON だけを出力し、説明文やコードブロックを付けない。'
].join('\n');

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('モンスト スクショ読取（試作）')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// msrGetModel_: GEMINI_MODEL が設定されていればそれを、無ければ既定値を返す
function msrGetModel_() {
  var v = PropertiesService.getScriptProperties().getProperty(MSR_MODEL_PROPERTY);
  v = v ? String(v).trim() : '';
  return v || MSR_DEFAULT_MODEL;
}

// msrResponseSchema_: Gemini 側で出力形式を固定するためのスキーマ（OpenAPI 形式のサブセット）
// pair が true なら、同一キャラ判定用の項目（sameCharacter と各画像のキャラ名・図鑑No.）を加える
function msrResponseSchema_(pair) {
  var props = {};
  MSR_TEXT_FIELDS.forEach(function (k) { props[k] = { type: 'STRING', nullable: true, description: MSR_FIELD_LABELS[k] + '（画像に無ければ null）' }; });
  props.confidence = { type: 'STRING', enum: MSR_CONFIDENCE };
  props.needsReview = { type: 'BOOLEAN' };
  props.reviewNotes = { type: 'ARRAY', items: { type: 'STRING' } };
  props.uncertainFields = { type: 'ARRAY', items: { type: 'STRING', enum: MSR_TEXT_FIELDS } };
  var order = MSR_TEXT_FIELDS.concat(['confidence', 'needsReview', 'reviewNotes', 'uncertainFields']);
  if (pair) {
    props.sameCharacter = { type: 'STRING', enum: MSR_SAME_CHARACTER };
    MSR_IDENTITY_FIELDS.forEach(function (k) { props[k] = { type: 'STRING', nullable: true }; });
    order = order.concat(['sameCharacter']).concat(MSR_IDENTITY_FIELDS);
  }
  return { type: 'OBJECT', properties: props, required: order, propertyOrdering: order };
}

// msrBuildRequest_: Gemini へ送る本文。画像を先に、指示文を後に置く。
// images は検証済みの画像の配列。2枚なら【画像1】【画像2】の見出しを付け、1回のリクエストにまとめる
function msrBuildRequest_(images) {
  var pair = images.length === MSR_PAIR_SIZE, parts = [];
  images.forEach(function (img, i) {
    if (pair) parts.push({ text: '【画像' + (i + 1) + '】' });
    parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64Data } });
  });
  parts.push({ text: pair ? MSR_PROMPT_PAIR : MSR_PROMPT });
  return {
    contents: [{ role: 'user', parts: parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: msrResponseSchema_(pair)
    }
  };
}

// msrValidateImage_: 画像の有無・形式・大きさだけを確認する（中身は見ない）
function msrValidateImage_(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, code: 'NO_IMAGE', error: '画像が選択されていません' };
  var data = typeof payload.base64Data === 'string' ? payload.base64Data : '';
  if (!data) return { ok: false, code: 'NO_IMAGE', error: '画像が選択されていません' };
  var mimeType = String(payload.mimeType || '');
  if (MSR_ALLOWED_MIME_TYPES.indexOf(mimeType) === -1) {
    return { ok: false, code: 'UNSUPPORTED_IMAGE_TYPE', error: 'この画像形式には対応していません（JPEG・PNG・WebP）' };
  }
  if (data.length > MSR_MAX_BASE64_CHARS) return { ok: false, code: 'IMAGE_TOO_LARGE', error: '画像が大きすぎます' };
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+\/]+={0,2}$/.test(data)) {
    return { ok: false, code: 'INVALID_IMAGE_DATA', error: '画像データが壊れています' };
  }
  return { ok: true, base64Data: data, mimeType: mimeType };
}

// msrValidateImages_: payload.images があれば2枚1セットとして、無ければ従来の1枚として検証する
function msrValidateImages_(payload) {
  if (!payload || typeof payload !== 'object' || !Object.prototype.hasOwnProperty.call(payload, 'images')) {
    var one = msrValidateImage_(payload);
    return one.ok ? { ok: true, images: [one] } : one;
  }
  var list = payload.images;
  if (!Array.isArray(list) || list.length !== MSR_PAIR_SIZE) {
    return { ok: false, code: 'IMAGE_COUNT', error: '画像は同じキャラのスクショを2枚まとめて選んでください' };
  }
  var images = [];
  for (var i = 0; i < list.length; i++) {
    var img = msrValidateImage_(list[i]);
    if (!img.ok) return { ok: false, code: img.code, error: '画像' + (i + 1) + '：' + img.error };
    images.push(img);
  }
  return { ok: true, images: images };
}

// msrShouldRetry_: 一時的なエラー（429 / 503）だけ再試行する。400 などは再試行しない
function msrShouldRetry_(code) {
  return MSR_RETRY_STATUS.indexOf(code) !== -1;
}

// msrCallGemini_: Gemini を呼び出す。キーは URL に入れず x-goog-api-key ヘッダーで渡す
function msrCallGemini_(key, model, request) {
  var url = MSR_API_BASE + encodeURIComponent(model) + ':generateContent';
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify(request),
    muteHttpExceptions: true
  };
  var started = Date.now();
  var code, body, attempts = 0;
  for (var i = 0; ; i++) {
    var res = UrlFetchApp.fetch(url, options);
    attempts++;
    code = res.getResponseCode();
    body = res.getContentText();
    if (!msrShouldRetry_(code) || i >= MSR_RETRY_WAIT_MS.length) break;
    if (Date.now() - started + MSR_RETRY_WAIT_MS[i] > MSR_RETRY_BUDGET_MS) break;
    Utilities.sleep(MSR_RETRY_WAIT_MS[i]);
  }
  return { code: code, body: body, attempts: attempts };
}

// msrSafeText_: 画面へ返す文字列からキーを取り除き、長さを制限する
function msrSafeText_(s, key) {
  var t = String(s == null ? '' : s);
  if (key) t = t.split(key).join('[hidden]');
  return t.length > 300 ? t.slice(0, 300) + '…' : t;
}

// msrApiErrorMessage_: Gemini のエラー応答から、利用者に見せてよい短い説明だけを取り出す
function msrApiErrorMessage_(code, body, key) {
  var msg = '';
  try { var j = JSON.parse(body); msg = j && j.error && j.error.message ? j.error.message : ''; } catch (e) { msg = ''; }
  var head = code === 429 ? '利用回数の上限に達しました。しばらく待ってから試してください'
    : code === 503 ? 'Gemini が混雑しています。しばらく待ってから試してください'
    : (code === 401 || code === 403) ? 'APIキーまたは権限を確認してください'
    : code === 404 ? 'モデル名を確認してください（GEMINI_MODEL）'
    : 'Gemini がエラーを返しました';
  return head + '（HTTP ' + code + '）' + (msg ? '：' + msrSafeText_(msg, key) : '');
}

// msrExtractText_: Gemini の応答本文から回答テキストを取り出す
function msrExtractText_(body) {
  var json;
  try { json = JSON.parse(body); } catch (e) { return { ok: false, code: 'INVALID_RESPONSE', error: 'Gemini の応答を読み取れませんでした' }; }
  if (json && json.promptFeedback && json.promptFeedback.blockReason) {
    return { ok: false, code: 'BLOCKED', error: 'Gemini が画像の処理を断りました（' + String(json.promptFeedback.blockReason) + '）' };
  }
  var cand = json && json.candidates && json.candidates[0];
  var parts = (cand && cand.content && cand.content.parts) || [];
  var text = parts.map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; }).join('');
  if (!text) return { ok: false, code: 'EMPTY_RESPONSE', error: 'Gemini の回答が空でした' + (cand && cand.finishReason ? '（' + cand.finishReason + '）' : '') };
  return { ok: true, text: text, finishReason: cand && cand.finishReason ? String(cand.finishReason) : '' };
}

// msrNormalizeReading_: 回答 JSON を検証し、決まった形に整える。
// 値は書き換えない（前後の空白を除くだけ）。形が違う・怪しい点は null や needsReview と reviewNotes で知らせる。
// 回答が JSON オブジェクトでなければ拒否する。
function msrNormalizeReading_(text) {
  var raw;
  try { raw = JSON.parse(text); } catch (e) { return { ok: false, code: 'INVALID_JSON', error: 'Gemini の回答が JSON ではありませんでした' }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, code: 'INVALID_JSON', error: 'Gemini の回答が JSON オブジェクトではありませんでした' };

  var notes = [], forced = false, out = { format: MSR_FORMAT };
  var flag = function (note) { forced = true; notes.push('［自動確認］' + note); };

  MSR_TEXT_FIELDS.forEach(function (k) {
    var label = MSR_FIELD_LABELS[k];
    // fruit4 は任意（実が3つ以下のキャラ・以前の回答には無い）。無くても要確認にしない。他の欄は従来どおり
    if (!Object.prototype.hasOwnProperty.call(raw, k)) { out[k] = null; if (k !== 'fruit4') flag(label + 'が回答にありません'); return; }
    var v = raw[k];
    if (v === null) { out[k] = null; return; }
    if (k === 'monsterNo' && typeof v === 'number' && isFinite(v)) v = String(v);
    if (typeof v !== 'string') { out[k] = null; flag(label + 'の形式が正しくありません'); return; }
    v = v.trim();
    if (!v || v.toLowerCase() === 'null') { out[k] = null; return; }
    if (v.length > MSR_MAX_TEXT) { v = v.slice(0, MSR_MAX_TEXT); flag(label + 'が長すぎるため途中までにしました'); }
    out[k] = v;
  });
  if (out.monsterNo !== null && !/^\d{1,5}$/.test(out.monsterNo)) flag('図鑑No.が数字だけではありません（そのまま表示）');
  if (out.battleType !== null && MSR_KNOWN_BATTLE_TYPES.indexOf(out.battleType) === -1) flag('戦型「' + out.battleType + '」は登録済みの一覧にありません');
  if (out.shotType !== null && MSR_KNOWN_SHOT_TYPES.indexOf(out.shotType) === -1) flag('撃種「' + out.shotType + '」は登録済みの一覧にありません');
  if (out.characterName === null) flag('キャラ名が読み取れていません');
  if (out.formName === null) flag('進化形態が読み取れていません');

  if (MSR_CONFIDENCE.indexOf(raw.confidence) !== -1) out.confidence = raw.confidence;
  else { out.confidence = 'LOW'; flag('確信度が回答にないため LOW として扱います'); }
  if (out.confidence !== 'HIGH') forced = true;

  var geminiReview = raw.needsReview === true;
  if (typeof raw.needsReview !== 'boolean') flag('要確認（needsReview）が回答にありません');

  var geminiNotes = Array.isArray(raw.reviewNotes) ? raw.reviewNotes : (typeof raw.reviewNotes === 'string' ? [raw.reviewNotes] : []);
  geminiNotes = geminiNotes.filter(function (n) { return typeof n === 'string' && n.trim(); }).map(function (n) { return n.trim().slice(0, 200); });

  var uncertain = Array.isArray(raw.uncertainFields) ? raw.uncertainFields : [];
  out.uncertainFields = MSR_TEXT_FIELDS.filter(function (k) { return uncertain.indexOf(k) !== -1; });
  if (out.uncertainFields.length) forced = true;

  out.needsReview = geminiReview || forced;
  out.reviewNotes = geminiNotes.concat(notes).slice(0, MSR_MAX_NOTES);
  return { ok: true, reading: out, raw: raw };
}

// msrIdentityText_: 同一キャラ判定用に Gemini が返した各画像のキャラ名・図鑑No.を、表示用に安全な形へ
function msrIdentityText_(v) {
  if (typeof v === 'number' && isFinite(v)) v = String(v);
  if (typeof v !== 'string') return null;
  v = v.trim();
  return v && v.toLowerCase() !== 'null' ? v.slice(0, MSR_MAX_TEXT) : null;
}

// msrCheckSameCharacter_: 2枚が同じキャラかを、図鑑No.・キャラ名・Gemini の判断から決める。
// はっきり違うときだけ mismatch にする。判断できないときは別キャラと断定しない。
// 返り値: { mismatch, reasons, image1, image2, notes: [{ text, force }] }
function msrCheckSameCharacter_(raw) {
  var id = function (n) {
    var name = msrIdentityText_(raw['image' + n + 'CharacterName']), no = msrIdentityText_(raw['image' + n + 'MonsterNo']);
    return { characterName: name, monsterNo: no };
  };
  var nameKey = function (s) { return s === null ? null : s.normalize('NFKC').replace(/\s+/g, ''); };
  var noKey = function (s) { if (s === null) return null; var d = s.normalize('NFKC').replace(/\D+/g, ''); return d ? d.replace(/^0+(?=\d)/, '') : null; };
  var a = id(1), b = id(2);
  var no1 = noKey(a.monsterNo), no2 = noKey(b.monsterNo), n1 = nameKey(a.characterName), n2 = nameKey(b.characterName);
  var gemini = MSR_SAME_CHARACTER.indexOf(raw.sameCharacter) !== -1 ? raw.sameCharacter : 'UNKNOWN';

  var reasons = [], notes = [];
  var noComparable = no1 !== null && no2 !== null, nameComparable = n1 !== null && n2 !== null;
  // 図鑑No.が比べられるならそれを最優先し、比べられないときだけキャラ名で比べる
  var sameEvidence = noComparable ? no1 === no2 : (nameComparable && n1 === n2);
  if (noComparable && no1 !== no2) reasons.push('図鑑No.が違います（画像1：' + a.monsterNo + '／画像2：' + b.monsterNo + '）');
  else if (!noComparable && nameComparable && n1 !== n2) reasons.push('キャラ名が違います（画像1：' + a.characterName + '／画像2：' + b.characterName + '）');
  if (gemini === 'NO') {
    if (sameEvidence) notes.push({ text: '［自動確認］Gemini は別キャラの可能性を示しましたが、' + (noComparable ? '図鑑No.は一致' : 'キャラ名は一致') + 'しています。2枚が同じキャラか確認してください', force: true });
    else if (!reasons.length) reasons.push('Gemini が2枚は別キャラの可能性が高いと判断しました');
  } else if (gemini === 'UNKNOWN' && !sameEvidence && !reasons.length) {
    notes.push({ text: '［自動確認］2枚が同じキャラか画像から確かめられませんでした', force: false });
  }
  return { mismatch: reasons.length > 0, reasons: reasons, image1: a, image2: b, notes: notes };
}

// msrReadScreenshot: 画面から呼ばれる唯一の関数。
// payload: { images: [{ base64Data, mimeType }, { base64Data, mimeType }] }（1キャラ＝2枚）
//          または従来の { base64Data, mimeType }（1枚）
// 返り値: { ok:true, reading, model, attempts, imageCount } または { ok:false, code, error }
//         2枚が別キャラの可能性が高いときは { ok:false, code:'CHARACTER_MISMATCH', error, mismatch }
// 画像データ・APIキーは返り値に含めない。画像はこの関数の実行が終われば残らない。
function msrReadScreenshot(payload) {
  var key = '';
  try {
    var checked = msrValidateImages_(payload);
    if (!checked.ok) return checked;
    var images = checked.images, pair = images.length === MSR_PAIR_SIZE;

    key = PropertiesService.getScriptProperties().getProperty(MSR_API_KEY_PROPERTY) || '';
    if (!key) return { ok: false, code: 'NO_API_KEY', error: 'GEMINI_API_KEY が Script Properties に設定されていません' };

    var model = msrGetModel_();
    var res = msrCallGemini_(key, model, msrBuildRequest_(images));
    if (res.code !== 200) return { ok: false, code: 'API_ERROR', status: res.code, attempts: res.attempts, error: msrApiErrorMessage_(res.code, res.body, key) };

    var ex = msrExtractText_(res.body);
    if (!ex.ok) return ex;
    var norm = msrNormalizeReading_(ex.text);
    if (!norm.ok) return norm;
    var reading = norm.reading;
    if (pair) {
      var same = msrCheckSameCharacter_(norm.raw);
      if (same.mismatch) {
        return {
          ok: false, code: 'CHARACTER_MISMATCH',
          error: '2枚が同じキャラクターではない可能性があります。同じキャラのスクショを2枚選び直してください',
          mismatch: { reasons: same.reasons, image1: same.image1, image2: same.image2 }
        };
      }
      same.notes.forEach(function (n) { if (n.force) reading.needsReview = true; reading.reviewNotes.push(n.text); });
      reading.reviewNotes = reading.reviewNotes.slice(0, MSR_MAX_NOTES);
    }
    return { ok: true, reading: reading, model: model, attempts: res.attempts, imageCount: images.length };
  } catch (err) {
    return { ok: false, code: 'INTERNAL', error: '読み取り中にエラーが発生しました：' + msrSafeText_(err && err.message, key) };
  }
}
