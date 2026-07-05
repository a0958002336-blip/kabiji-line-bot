'use strict';
/* Task 11+12 出勤統計/綜合評比 輸出格式 回歸測試
 * 只驗證渲染格式與明細/簡表分流；統計數字沿用既有邏輯（已由 emp_norm 測試覆蓋合併正確性）。
 * 跑法：node tests/golden/run_stats_format.js
 */
const { createEnv } = require('./harness');
const G = 'G_ADMIN', OWNER = 'U_OWNER', OTHER = 'U_OTHER';
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }

function mkEnv() {
  const env = createEnv();
  env.scriptProps.setProperty('OWNER_USER_ID', OWNER);
  env.scriptProps.setProperty('ADMIN_GROUP_IDS', G);
  env.fns.setEmpAlias('良', '阿良');
  // 2026/06：良（3天，均正常打卡，皆早於18點→offLate0），阿良（1天+遲到1）
  const A = env.fns.getSheet('出勤打卡');
  [['2026/06/03 08:00', '良', '上班'], ['2026/06/03 17:00', '良', '下班'],
   ['2026/06/04 08:00', '良', '上班'], ['2026/06/04 17:00', '良', '下班'],
   ['2026/06/05 08:00', '良', '上班'], ['2026/06/05 17:00', '良', '下班'],
   ['2026/06/06 08:00', '阿良', '上班'], ['2026/06/06 17:00', '阿良', '下班'],
   ['2026/06/07 09:30', '阿良', '遲到', '遲到']].forEach(function (r) { A.appendRow([r[0], r[1], r[2], r[3] || '', '']); });
  const D = env.fns.getSheet('外勤補貼');
  D.appendRow(['2026/06/08 18:00', '良', '台北', '18:00', 500, '']);
  return env;
}
function send(env, text, uid) { env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: text }, source: { groupId: G, userId: uid || OWNER } }); const rs = env.urlFetchCalls.map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }); return rs.join('\n'); }

/* 1. 出勤統計 簡表 */
(function () { const r = send(mkEnv(), '出勤統計 6月'); check('1 簡表含表頭+結尾', /姓名｜出勤｜遲到｜請假｜全勤/.test(r) && /共 1 人｜全勤 0 人/.test(r), r); })();
/* 2. 查阿良出勤統計 → 明細，只含阿良、含🔵外勤 */
(function () { const r = send(mkEnv(), '查阿良出勤統計 6月'); check('2 明細版只含阿良+外勤行', /👤 阿良/.test(r) && /🔵 外勤:/.test(r) && /正常打卡/.test(r) && r.indexOf('👤 良\n') === -1, r); })();
/* 3. 出勤統計月份參數 */
(function () { const r = send(mkEnv(), '出勤統計 6月'); check('3 標題月份=2026/06', /📊 2026\/06 出勤統計/.test(r), r.split('\n')[0]); })();
/* 4. 良+阿良合併為一個阿良 */
(function () { const r = send(mkEnv(), '出勤統計 6月'); const cnt = (r.match(/阿良/g) || []).length; check('4 只出現一個阿良、無單獨【良】', cnt >= 1 && !/(^|\n)良｜/.test(r), r); })();
/* 5. 綜合評比 排名簡表 */
(function () { const r = send(mkEnv(), '綜合評比 6月'); check('5 排名表頭+權重行', /名次｜姓名｜評分｜出勤｜外勤｜遲到/.test(r) && /權重:出勤×/.test(r), r); })();
/* 6. 查阿良評比 → 明細，含名次評分+外勤加給 */
(function () { const r = send(mkEnv(), '查阿良評比 6月'); check('6 明細含名次評分與外勤加給', /【阿良】評分 /.test(r) && /🔵 外勤:.*加給/.test(r), r); })();
/* 7. offLate=0 → 無🌙 */
(function () { const r = send(mkEnv(), '綜合評比 6月 明細'); check('7 offLate=0 無🌙晚下班行', !/🌙/.test(r), r); })();
/* 8. 非老闆綜合評比 → 🔒 */
(function () { const r = send(mkEnv(), '綜合評比 6月', OTHER); check('8 非老闆被拒', /🔒.*綜合評比/.test(r), r); })();
/* 9. 無資料月份 → 無資料訊息、不噴錯 */
(function () { const env = mkEnv(); const r1 = send(env, '出勤統計 3月'); const r2 = send(env, '綜合評比 3月'); check('9 無資料回訊息不噴錯', /沒有可統計的資料/.test(r1) && /沒有可統計的資料/.test(r2), r1 + ' || ' + r2); })();
/* 10. 月份參數解析（5月無資料也應顯示 2026/05 標題） */
(function () { const r = send(mkEnv(), '出勤統計 5月'); check('10 月份解析 5月', /2026\/05/.test(r), r.split('\n')[0]); })();

console.log('\n========== Task 11+12 統計輸出格式 回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
