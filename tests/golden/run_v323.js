'use strict';
/* v3.2.3 修正回歸：聊天句誤觸件數/搜尋查詢 + 查無結果尊重安靜
 *  ① 參數含禮貌/聊天用語（麻煩|提供|一下|謝謝|請|幫我|記得|喔|耶|啦|唷）→ 不觸發查詢、靜默
 *  ② 正常品名查詢照常回覆（有結果/查無結果）
 *  ③ 查無結果的回覆尊重安靜：quiet 時查無不回覆；有結果照常回
 * 跑法：node tests/golden/run_v323.js
 */
const { createEnv } = require('./harness');
const OWNER = 'U_OWNER', G = 'G_ADMIN';
let fails = 0; const out = []; let msgSeq = 0;
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function mkEnv() { const env = createEnv(); env.scriptProps.setProperty('OWNER_USER_ID', OWNER); env.scriptProps.setProperty('ADMIN_GROUP_IDS', G); return env; }
function send(env, text) {
  const before = env.urlFetchCalls.length;
  env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: text, id: 'M' + (++msgSeq) }, source: { groupId: G, userId: OWNER } });
  return env.urlFetchCalls.slice(before).filter(function (c) { return /\/message\/reply/.test(c.url); })
    .map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }).join(' || ');
}
function isQueryReply(r) { return /總出貨|沒有找到|今天「/.test(r); }

/* ---------- ① 聊天句不觸發查詢（靜默） ---------- */
['件數要麻煩提供喔', '件數麻煩給一下', '件數 請幫我', '搜尋麻煩一下', '總件數提供一下謝謝'].forEach(function (t, i) {
  const env = mkEnv();
  const r = send(env, t);
  check('①' + (i + 1) + ' 「' + t + '」不觸發查詢(靜默)', !isQueryReply(r), JSON.stringify(r));
});

/* ---------- ② 正常品名查詢照常回覆 ---------- */
(function () {
  const env = mkEnv();
  send(env, '高山228 特 30件');            // 記入群組訊息（供件數統計）
  const r = send(env, '件數 高山228');
  check('②1 件數 高山228 → 有結果照常回', /高山228/.test(r) && /30件/.test(r), r);
})();
(function () {
  const env = mkEnv();
  send(env, '進口228 中 50件');
  const r = send(env, '總件數 進口228');
  check('②2 總件數 進口228 → 有結果照常回', /進口228/.test(r) && /50件/.test(r), r);
})();
(function () {
  const env = mkEnv();
  const r = send(env, '件數 高山228');     // 無資料 → 查無（非安靜 → 照回）
  check('②3 非安靜查無 → 回覆「沒有找到」', /沒有找到/.test(r), r);
})();

/* ---------- ③ 查無結果尊重安靜；有結果照常 ---------- */
(function () {
  const env = mkEnv();
  send(env, '#安靜');                       // 老闆開啟本群安靜
  const r = send(env, '件數 不存在品名XYZ');  // 查無 + 安靜 → 靜默
  check('③1 安靜群查無 → 靜默', r === '', JSON.stringify(r));
})();
(function () {
  const env = mkEnv();
  send(env, '#安靜');
  send(env, '高山228 特 30件');
  const r = send(env, '件數 高山228');       // 有結果 → 安靜也照回（功能回覆不壓）
  check('③2 安靜群有結果 → 照常回覆', /高山228/.test(r) && /30件/.test(r), r);
})();

/* ---------- 報告 ---------- */
console.log('\n========== v3.2.3 聊天句誤觸件數查詢 修正 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
