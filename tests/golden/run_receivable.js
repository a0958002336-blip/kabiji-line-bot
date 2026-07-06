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

/* ---------- 7. 清單顯示 R 編號（Bug1）---------- */
(function () {
  const env = mkEnv();
  send(env, '6986\n老人田 高山228 特8件 要收款6800元');
  const r = send(env, '#未收款');
  check('7a 清單有表頭 ID｜客戶', /ID｜客戶/.test(r), r);
  check('7b 清單每筆顯示 R 編號', /R0001/.test(r), r);
})();

/* ---------- 8. 用清單顯示的 ID 取消 → 成功且合計正確（Bug1）---------- */
(function () {
  const env = mkEnv();
  send(env, '6986\n老人田 高山228 特8件 要收款6800元');
  send(env, '2988\n阿美 玉美 特5件 要收款500元');
  const list = send(env, '#未收款');
  const id = (list.match(/R\d{4}/g) || [])[0];   // 取清單第一個 ID
  const r = send(env, '#取消收款 ' + id + ' 測試');
  check('8a 用清單ID取消成功', /已取消收款/.test(r) && new RegExp(id).test(r), 'id=' + id + ' reply=' + r);
  const list2 = send(env, '#未收款');
  check('8b 取消後剩 1 筆、合計正確', /（1 筆）/.test(list2) && (/合計未收：6800/.test(list2) || /合計未收：500/.test(list2)), list2);
})();

/* ---------- 9. 多筆同關鍵字 → 回候選、資料不變（Bug2）---------- */
(function () {
  const env = mkEnv();
  send(env, '6986\n老人田 高山228 特8件 要收款6800元');
  send(env, '6986\n老人田 玉美 特5件 要收款500元');   // 同客戶6986、不同品項金額(不去重)
  const before = rows(env).filter(function (x) { return String(x[7]) === '未收'; }).length;
  const r = send(env, '#取消收款 6986');
  check('9a 多筆命中→回候選清單', /找到 2 筆/.test(r) && /R000/.test(r), r);
  const after = rows(env).filter(function (x) { return String(x[7]) === '未收'; }).length;
  check('9b 候選階段不動資料', before === 2 && after === 2, before + '→' + after);
})();

/* ---------- 10. #取消收款 全部 關鍵字 → 全部取消 ---------- */
(function () {
  const env = mkEnv();
  send(env, '6986\n老人田 高山228 特8件 要收款6800元');
  send(env, '6986\n老人田 玉美 特5件 要收款500元');
  const r = send(env, '#取消收款 全部 6986');
  check('10a 全部取消回覆 2 筆', /已取消收款（軟刪除）2 筆/.test(r), r);
  check('10b 未收款清空', /沒有未收款/.test(send(env, '#未收款')), '');
})();

/* ---------- 11. 髒資料清理（欄位對調重複，dryRun 預覽→執行）---------- */
(function () {
  const env = mkEnv();
  const sh = env.fns.getSheet('待收款');
  sh.appendRow(['2026/07/01 10:00', '2026/07/01', '6986', '老人田', '高山228 特8件', 6800, '', '未收', '', '', '', '', '', '', '', '', '', '']);
  sh.appendRow(['2026/07/01 10:01', '2026/07/01', '老人田', '6986', '高山228 特8件', 6800, '', '未收', '', '', '', '', '', '', '', '', '', '']);   // 欄位對調重複
  const pv = env.fns.recvCleanup(true);
  check('11a dryRun 偵測到 1 項且不改資料', pv.count === 1 && rows(env).filter(function (x) { return String(x[7]) === '未收'; }).length === 2, JSON.stringify(pv.preview));
  env.fns.recvCleanup(false);
  const un = rows(env).filter(function (x) { return String(x[7]) === '未收' && !x[15]; });
  check('11b 執行後未收剩 1 筆（重複軟刪）', un.length === 1, JSON.stringify(un.map(function (x) { return x[2] + '/' + x[3]; })));
  check('11c 保留列(軟刪不實刪)', rows(env).length === 2, '列數=' + rows(env).length);
  check('11d 對調欄位已修正(客戶=6986)', un[0] && String(un[0][2]) === '6986' && String(un[0][3]) === '老人田', JSON.stringify(un[0]));
})();

/* ---------- 12. Bug6：清單保留收款人欄（未指定→建立人）---------- */
(function () {
  const env = mkEnv();
  send(env, MSG);
  const r = send(env, '#未收款');
  check('12a 清單表頭含收款人', /金額｜收款人/.test(r), r);
  check('12b 未指定收款人→顯示建立人', /建立人 /.test(r), r);
  // 含收款人(collectedBy)的資料列 → 顯示「收款人 X」
  const env2 = mkEnv();
  env2.fns.getSheet('待收款').appendRow(['2026/07/01 10:00', '2026/07/01', '6986', '老人田', '高山228 特8件', 6800, '', '未收', '小明', '阿良', '', '', '', '', '', '', '', '']);
  const r2 = env2.fns.receivableQuery(false);
  check('12c 有收款人→清單顯示「收款人 阿良」', /收款人 阿良/.test(r2), r2);
  check('12d #待辦 同走未收款清單', /收款人/.test(send(env, '#待辦')), '');
})();

console.log('\n========== Task 4 收款/未收款 模組 回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
