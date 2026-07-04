'use strict';
/* Task 8 安全與去重 回歸測試
 * - doPost 事件去重：同 message.id 重送 → 只處理一次；isRedelivery → 跳過
 * - fail-closed：未註冊老闆時高危清除操作被拒、資料不變
 * 跑法：node tests/golden/run_task8.js
 */
const { createEnv } = require('./harness');
const G = 'G_ADMIN', OWNER = 'U_OWNER', OTHER = 'U_OTHER';
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function shipRows(env) { return env.sheets['寄運資料'] ? env.sheets['寄運資料'].__rows.slice(1) : []; }
function post(env, evObj) { env.fns.doPost({ postData: { contents: JSON.stringify({ events: [evObj] }) } }); }
function shipEvent(id, extra) { return Object.assign({ type: 'message', replyToken: 'RT', message: { type: 'text', text: '陳老闆\n高麗菜 中 20件 寄旭陽', id: id }, source: { groupId: G, userId: OWNER } }, extra || {}); }
function mkEnv() { const env = createEnv(); env.scriptProps.setProperty('OWNER_USER_ID', OWNER); env.scriptProps.setProperty('ADMIN_GROUP_IDS', G); return env; }

/* ---------- 1. 同 message.id 重送 → 只寫一次 ---------- */
(function () {
  const env = mkEnv();
  post(env, shipEvent('MID_1'));
  post(env, shipEvent('MID_1'));   // 重送同一則
  check('1 同 message.id 重送 → 寄運只寫 1 筆', shipRows(env).length === 1, '筆數=' + shipRows(env).length);
})();

/* ---------- 2. 不同 message.id → 正常各寫一次（確認去重沒誤殺）---------- */
(function () {
  const env = mkEnv();
  post(env, shipEvent('MID_A'));
  post(env, shipEvent('MID_B'));
  check('2 不同 message.id → 寄運寫 2 筆', shipRows(env).length === 2, '筆數=' + shipRows(env).length);
})();

/* ---------- 3. isRedelivery=true → 跳過 ---------- */
(function () {
  const env = mkEnv();
  post(env, shipEvent('MID_R', { deliveryContext: { isRedelivery: true } }));
  check('3 isRedelivery 事件 → 不寫入', shipRows(env).length === 0, '筆數=' + shipRows(env).length);
})();

/* ---------- 4. fail-closed：未註冊老闆，清除被拒、資料不變 ---------- */
(function () {
  const env = createEnv();
  env.scriptProps.setProperty('ADMIN_GROUP_IDS', G);   // 有 admin 群但「無老闆」
  const sh = env.fns.getSheet('寄運資料');
  sh.appendRow(['2026/07/01 10:00', '客A', '', '高麗菜', '', '10', '', '旭陽', '', '', '件']);
  const ev = { type: 'message', replyToken: 'RT', message: { type: 'text', text: '寄運資料 清除 確定' }, source: { groupId: G, userId: OTHER } };
  env.fns.handleEvent(ev);
  const replies = env.urlFetchCalls.map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join(' '); } catch (e) { return ''; } }).join(' ');
  check('4a 未註冊老闆 → 清除被拒(提示註冊)', /註冊老闆/.test(replies), 'reply=' + replies);
  check('4b 未註冊老闆 → 寄運資料未被清除', shipRows(env).length === 1, '筆數=' + shipRows(env).length);
})();

/* ---------- 5. 有老闆時非老闆清除被拒 ---------- */
(function () {
  const env = mkEnv();
  const sh = env.fns.getSheet('寄運資料');
  sh.appendRow(['2026/07/01 10:00', '客A', '', '高麗菜', '', '10', '', '旭陽', '', '', '件']);
  const ev = { type: 'message', replyToken: 'RT', message: { type: 'text', text: '寄運資料 清除 確定' }, source: { groupId: G, userId: OTHER } };
  env.fns.handleEvent(ev);
  check('5 非老闆清除 → 資料不變', shipRows(env).length === 1, '筆數=' + shipRows(env).length);
})();

console.log('\n========== Task 8 安全與去重 回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
