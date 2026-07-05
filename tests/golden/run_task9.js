'use strict';
/* Task 9 誤判補強 回歸測試
 * - 出勤：疑問語尾（嗎/呢/？）→ 聊天不寫；代名詞/老闆 → 不寫；正常打卡照常
 * - 退貨：代名詞主詞 → 不寫；正常退貨照常
 * - 借支：非員工（旭陽/純數字）→ 不寫；出勤表內員工 → 照常
 * - isWholeIce：單獨「冰」不觸發；寄冰/（冰）照常
 * 跑法：node tests/golden/run_task9.js
 */
const { createEnv } = require('./harness');
const G = 'G_ADMIN', OWNER = 'U_OWNER';
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function rows(env, s) { return env.sheets[s] ? env.sheets[s].__rows.slice(1) : []; }
function mkEnv() { const env = createEnv(); env.scriptProps.setProperty('OWNER_USER_ID', OWNER); env.scriptProps.setProperty('ADMIN_GROUP_IDS', G); return env; }
function send(env, text) { env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: text }, source: { groupId: G, userId: OWNER } }); }

/* ---------- 1. 出勤誤判 ---------- */
(function () {
  const env = mkEnv();
  send(env, '老闆上班了嗎');
  check('1a 「老闆上班了嗎」不寫出勤', rows(env, '出勤打卡').length === 0, JSON.stringify(rows(env, '出勤打卡')));
  const env2 = mkEnv();
  send(env2, '他上班');
  check('1b 「他上班」(代名詞)不寫出勤', rows(env2, '出勤打卡').length === 0, JSON.stringify(rows(env2, '出勤打卡')));
  const env3 = mkEnv();
  send(env3, '小明上班');
  check('1c 「小明上班」正常寫出勤', rows(env3, '出勤打卡').length === 1 && String(rows(env3, '出勤打卡')[0][1]) === '小明', JSON.stringify(rows(env3, '出勤打卡')));
  const env4 = mkEnv();
  send(env4, '請假嗎');
  check('1d 「請假嗎」不寫出勤', rows(env4, '出勤打卡').length === 0, JSON.stringify(rows(env4, '出勤打卡')));
})();

/* ---------- 2. 退貨誤判 ---------- */
(function () {
  const env = mkEnv();
  send(env, '他退了3件喔');
  check('2a 「他退了3件喔」不寫退貨', rows(env, '退貨紀錄').length === 0, JSON.stringify(rows(env, '退貨紀錄')));
  const env2 = mkEnv();
  send(env2, '旺來退了5件');
  check('2b 「旺來退了5件」正常寫退貨', rows(env2, '退貨紀錄').length === 1, JSON.stringify(rows(env2, '退貨紀錄')));
})();

/* ---------- 3. 借支：非員工不寫、員工照常 ---------- */
(function () {
  const env = mkEnv();
  send(env, '旭陽借500');
  check('3a 「旭陽借500」(非員工)不寫借支', rows(env, '員工借支').length === 0, JSON.stringify(rows(env, '員工借支')));
  const env2 = mkEnv();
  env2.fns.getSheet('出勤打卡').appendRow(['2026/07/01 08:00', '阿明', '上班', '', '']);   // 讓阿明成為已知員工
  send(env2, '阿明借500');
  check('3b 「阿明借500」(出勤表員工)正常寫借支', rows(env2, '員工借支').length === 1, JSON.stringify(rows(env2, '員工借支')));
})();

/* ---------- 4. isWholeIce 收緊 ---------- */
(function () {
  const env = createEnv();
  check('4a 單獨「冰」不觸發 whole-ice', env.fns.isWholeIce('冰') === false, String(env.fns.isWholeIce('冰')));
  check('4b 「寄冰 客A 菜 5」觸發', env.fns.isWholeIce('寄冰 客A 高麗菜 5') === true, String(env.fns.isWholeIce('寄冰 客A 高麗菜 5')));
  check('4c 「客A 菜（冰）5」觸發', env.fns.isWholeIce('客A 高麗菜（冰）5') === true, String(env.fns.isWholeIce('客A 高麗菜（冰）5')));
})();

console.log('\n========== Task 9 誤判補強 回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
