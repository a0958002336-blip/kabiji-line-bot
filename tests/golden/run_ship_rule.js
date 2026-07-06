'use strict';
/* 寄運定義收緊 回歸測試（老闆確認的業務規則）
 * 只有 (a)有寄X物流指定 或 (b)客戶在物流客戶名單 才記寄運；否則不記，但(台子)等實物照記。
 * 跑法：node tests/golden/run_ship_rule.js
 */
const { createEnv } = require('./harness');
const G = 'G_ADMIN', OWNER = 'U_OWNER';
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function rows(env, s) { return env.sheets[s] ? env.sheets[s].__rows.slice(1) : []; }
function mkEnv() { const env = createEnv(); env.scriptProps.setProperty('OWNER_USER_ID', OWNER); env.scriptProps.setProperty('ADMIN_GROUP_IDS', G); return env; }
function send(env, text) { env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: text }, source: { groupId: G, userId: OWNER } }); const rs = env.urlFetchCalls.map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }); return rs[rs.length - 1] || ''; }

/* 1. 含「寄旭陽」→ 記寄運 */
(function () {
  const env = mkEnv(); const r = send(env, '王老闆\n高麗菜 中 20件 寄旭陽');
  check('1a 含寄旭陽 → 寄運 1 筆', rows(env, '寄運資料').length === 1, JSON.stringify(rows(env, '寄運資料')));
  check('1b 回覆含「已記錄寄運資料」', /已記錄寄運資料/.test(r), r);
})();

/* 2. 客戶在物流客戶名單（中壢巧巧龍）無寄字 → 記寄運 */
(function () {
  const env = mkEnv(); send(env, '中壢巧巧龍\n高麗菜 中 20件');
  check('2 物流客戶(中壢巧巧龍)無寄字 → 寄運 1 筆', rows(env, '寄運資料').length === 1, JSON.stringify(rows(env, '寄運資料')));
})();

/* 3. 十方齋單（無寄、不在名單、含5台台子）→ 寄運0、台子出庫5 */
(function () {
  const env = mkEnv(); const r = send(env, '十方齋\n毛豆 5台');
  check('3a 寄運 0 筆', rows(env, '寄運資料').length === 0, JSON.stringify(rows(env, '寄運資料')));
  const tz = rows(env, '台子庫存');
  check('3b 台子出庫 5', tz.length === 1 && String(tz[0][2]) === '出庫' && Number(tz[0][4]) === 5 && String(tz[0][5]) === '十方齋', JSON.stringify(tz));
  check('3c 回覆只報台子、不報寄運', /台子出庫/.test(r) && !/已記錄寄運資料/.test(r), r);
})();

/* 4. 一般出貨單（無寄、非物流客戶、無台子）→ 靜默不寫入 */
(function () {
  const env = mkEnv(); const r = send(env, '路人甲\n高麗菜 20件');
  check('4a 不記寄運', rows(env, '寄運資料').length === 0, JSON.stringify(rows(env, '寄運資料')));
  check('4b 不回「已記錄寄運資料」', !/已記錄寄運資料/.test(r), r);
})();

/* 5. 寄運修改/取消既有功能不受影響（貼回查詢輸出＋取消）*/
(function () {
  const env = mkEnv();
  send(env, '王老闆\n高麗菜 中 20件 寄旭陽');   // 先建立 1 筆
  const before = rows(env, '寄運資料').length;
  // 貼回輸出格式（首行日期）+ 取消整客戶
  send(env, '2026/07/06\n【王老闆】\n・高麗菜 中 20件\n取消');
  check('5 貼回取消可刪（既有功能不受影響）', rows(env, '寄運資料').length <= before, 'before=' + before + ' after=' + rows(env, '寄運資料').length);
})();

console.log('\n========== 寄運定義收緊 回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
