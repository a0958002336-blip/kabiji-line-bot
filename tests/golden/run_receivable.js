'use strict';
/* Task 4 收款/未收款 模組 回歸測試
 * 偵測建立→#未收款→#已收 結案→#取消收款(軟刪除)；去重(訊息ID/24h窗)；誤觸不建。
 * 跑法：node tests/golden/run_receivable.js
 */
const { createEnv } = require('./harness');
const G = 'G_ADMIN', OWNER = 'U_OWNER';
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function rows(env) { return env.sheets['待收款'] ? env.sheets['待收款'].__rows.slice(1) : []; }
function mkEnv() { const env = createEnv(); env.scriptProps.setProperty('OWNER_USER_ID', OWNER); env.scriptProps.setProperty('ADMIN_GROUP_IDS', G); return env; }
function send(env, text, msgId) { const msg = { type: 'text', text: text }; if (msgId) msg.id = msgId; env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: msg, source: { groupId: G, userId: OWNER } }); const rs = env.urlFetchCalls.map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }); return rs[rs.length - 1] || ''; }
function post(env, text, msgId) { env.fns.doPost({ postData: { contents: JSON.stringify({ events: [{ type: 'message', replyToken: 'RT', message: { type: 'text', text: text, id: msgId }, source: { groupId: G, userId: OWNER } }] }) } }); }

const MSG = '6986\n老人田 高山228 特8件 要收款6800元';

/* ---------- 1. 偵測建立【未收】 ---------- */
(function () {
  const env = mkEnv(); const r = send(env, MSG); const rw = rows(env);
  check('1a 建立 1 筆', rw.length === 1, JSON.stringify(rw));
  check('1b 客戶=6986', rw[0] && String(rw[0][2]) === '6986', JSON.stringify(rw[0]));
  check('1c 供應商=老人田', rw[0] && String(rw[0][3]) === '老人田', JSON.stringify(rw[0]));
  check('1d 金額=6800', rw[0] && Number(rw[0][5]) === 6800, JSON.stringify(rw[0]));
  check('1e 狀態=未收', rw[0] && String(rw[0][7]) === '未收', JSON.stringify(rw[0]));
  check('1f 收款人預設空白', rw[0] && String(rw[0][9]) === '', JSON.stringify(rw[0]));
  check('1g 原文保留', rw[0] && String(rw[0][14]).indexOf('要收款6800') !== -1, JSON.stringify(rw[0]));
})();

/* ---------- 2. 誤觸不建 ---------- */
(function () {
  check('2a 「明天要收300件」不建收款', rows((function () { const e = mkEnv(); send(e, '明天要收300件'); return e; })()).length === 0, '');
  check('2b 「客戶收台子×3」不建收款', rows((function () { const e = mkEnv(); send(e, '客戶收台子×3'); return e; })()).length === 0, '');
  const e3 = mkEnv(); const r3 = send(e3, '記得收款'); // 有關鍵字無金額
  check('2c 「記得收款」無金額→不建、提示', rows(e3).length === 0 && /金額/.test(r3), r3);
  // 需收台回來 含「需收」(RECV_KW)但屬器材回收 → 永不進收款（P0-1）
  check('2d 「需收台回來950元」不建收款', rows((function () { const e = mkEnv(); send(e, '客戶 需收台回來 950元'); return e; })()).length === 0, '');
})();

/* ---------- 3. #未收款 查詢 ---------- */
(function () {
  const env = mkEnv(); send(env, MSG); const r = send(env, '#未收款');
  check('3 未收款清單含客戶與合計', /6986/.test(r) && /6800/.test(r) && /合計未收：6800/.test(r), r);
})();

/* ---------- 4. #已收 結案 ---------- */
(function () {
  const env = mkEnv(); send(env, MSG); const r = send(env, '#已收 6986'); const rw = rows(env);
  check('4a 結案回覆', /已收款結案/.test(r), r);
  check('4b 狀態→已收', rw[0] && String(rw[0][7]) === '已收', JSON.stringify(rw[0]));
  check('4c 收款人=結案者', rw[0] && String(rw[0][9]) !== '', JSON.stringify(rw[0]));
  const r2 = send(env, '#未收款');
  check('4d 已收後不在未收款清單', /沒有未收款/.test(r2), r2);
})();

/* ---------- 5. #取消收款 軟刪除 + Audit Log ---------- */
(function () {
  const env = mkEnv(); send(env, MSG); const before = rows(env).length;
  const r = send(env, '#取消收款 6986 客戶跑單'); const rw = rows(env);
  check('5a 取消回覆(軟刪除)', /取消收款/.test(r), r);
  check('5b 列數不變(不實刪)', rows(env).length === before, before + '→' + rows(env).length);
  check('5c 狀態→取消', rw[0] && String(rw[0][7]) === '取消', JSON.stringify(rw[0]));
  check('5d deleted_at 有值', rw[0] && String(rw[0][15]) !== '', JSON.stringify(rw[0]));
  check('5e deleted_by 有值', rw[0] && String(rw[0][16]) !== '', JSON.stringify(rw[0]));
  check('5f reason=客戶跑單', rw[0] && String(rw[0][17]) === '客戶跑單', JSON.stringify(rw[0]));
  const r2 = send(env, '#未收款');
  check('5g 取消後不在未收款清單', /沒有未收款/.test(r2), r2);
})();

/* ---------- 6. 去重 ---------- */
(function () {
  // 6a 同 sourceMessageId → 只 1 筆
  const env = mkEnv(); post(env, MSG, 'MID_R1'); post(env, MSG, 'MID_R1');
  check('6a 同訊息ID重送→1筆', rows(env).length === 1, '筆數=' + rows(env).length);
  // 6b 同內容 24h 內 → 去重
  const env2 = mkEnv(); send(env2, MSG); send(env2, MSG);
  check('6b 同內容24h內→去重(1筆)', rows(env2).length === 1, '筆數=' + rows(env2).length);
  // 6c 同內容但首筆時間 > 24h → 允許再建（避免漏帳）
  const env3 = mkEnv(); send(env3, MSG);
  env3.sheets['待收款'].__rows[1][0] = '2026/07/01 10:00';   // 把首筆建立時間改成數天前
  send(env3, MSG);
  check('6c 同內容>24h→允許再建(2筆)', rows(env3).length === 2, '筆數=' + rows(env3).length);
})();

console.log('\n========== Task 4 收款/未收款 模組 回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
