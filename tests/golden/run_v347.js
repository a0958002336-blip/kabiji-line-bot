'use strict';
/* v3.4.7 回歸測試：查出勤 月份篩選 ＋ 年/月誤讀 ＋ 顯示上限外顯
 *  ① 主修正：attendanceQuery 接上 resolveYM()（7月／本月／上月），
 *            原本「7月」會落到 emp 變成用「7月」比對員工姓名 → 永遠查無。
 *  ② B  修正：「2026/07」被 M/D 規則從第3字元起匹配成「26/07」→ 26月7日 → 靜默查無。
 *     B+ 修正：月>12 / 日>31 → 明確報錯，不再靜默回「目前沒有紀錄」。
 *  ③ 不回歸：M/D 單日與區間照舊。
 *  ④ 不改行為：不帶條件仍撈全部（刻意不比照 attendanceStats 的 || thisYM()）。
 *  ⑤ A  修正：超過 60 筆時明說「只顯示最近 60 筆」。
 * 跑法：node tests/golden/run_v347.js
 *
 * 註：attendanceQuery 未在 harness 導出，故一律走 handleEvent 完整路徑（比照 run_v33.js）。
 *     年份用當年動態計算、月份固定 3 月/9 月，確保任何日期跑都穩定。
 */
const { createEnv } = require('./harness');
const OWNER = 'U_OWNER', OTHER = 'U_OTHER', G = 'G_ADMIN';
const ATT = '出勤打卡';
let fails = 0; const out = []; let msgSeq = 0;
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function mkEnv() { const env = createEnv(); env.scriptProps.setProperty('OWNER_USER_ID', OWNER); env.scriptProps.setProperty('ADMIN_GROUP_IDS', G); return env; }
function send(env, text, uid) {
  const before = env.urlFetchCalls.length;
  env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: text, id: 'M' + (++msgSeq) }, source: { groupId: G, userId: uid || OWNER } });
  return env.urlFetchCalls.slice(before).filter(function (c) { return /\/message\/reply/.test(c.url); })
    .map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }).join(' || ');
}

const NOW = new Date();
const Y = NOW.getFullYear();              // 當年
const PREV_Y = Y - 1;                     // 去年（驗證月份篩選不跨年誤抓）
function pad(n) { return ('0' + n).slice(-2); }
function stamp(y, m, d, hm) { return y + '/' + pad(m) + '/' + pad(d) + ' ' + hm; }

/* 標準測資：當年3月 2 筆(阿良/宏欸)、當年9月 1 筆、去年3月 1 筆 */
function seed(env) {
  env.fns.getSheet(ATT);
  const r = env.sheets[ATT].__rows;
  r.push([stamp(Y, 3, 5, '08:05'), '阿良', '上班', '正常', '']);
  r.push([stamp(Y, 3, 20, '18:30'), '宏欸', '下班', '正常', '']);
  r.push([stamp(Y, 9, 10, '08:02'), '阿良', '上班', '正常', '']);
  r.push([stamp(PREV_Y, 3, 15, '08:01'), '阿良', '上班', '正常', '']);
  return env;
}
function cntOf(rep) { const m = String(rep).match(/共 (\d+) 筆/); return m ? parseInt(m[1], 10) : -1; }

/* ========== ① 月份篩選（主修正）========== */
(function () {
  const env = seed(mkEnv());
  const rep = send(env, '查出勤 3月');
  check('①1 「3月」只回當年3月的 2 筆（不含去年3月/當年9月）', cntOf(rep) === 2, rep);
  check('①2 標題顯示月份區間（' + Y + '/03），非把月份當員工名',
    rep.indexOf('（' + Y + '/03）') !== -1 && rep.indexOf('・3月') === -1, rep);
  check('①3 不含去年3月那筆（03/15）', rep.indexOf('03/15') === -1, rep);   // fmtTime 只印 MM/dd，故以日期辨識
  check('①4 不含 9 月那筆', rep.indexOf('09/10') === -1, rep);
})();
(function () {
  const env = seed(mkEnv());
  const rep = send(env, '查出勤 本月');
  check('①5 「本月」不被當員工名（標題無「・本月」）', rep.indexOf('・本月') === -1, rep);
})();
(function () {
  const env = seed(mkEnv());
  const rep = send(env, '查出勤 上月');
  check('①6 「上月」不被當員工名（標題無「・上月」）', rep.indexOf('・上月') === -1, rep);
})();

/* ========== ② 年/月誤讀（B）＋ 超範圍報錯（B+）========== */
(function () {
  const env = seed(mkEnv());
  const rep = send(env, '查出勤 ' + Y + '/03');
  check('②1 「' + Y + '/03」走月份路徑，回當年3月 2 筆（B 修正前會靜默查無）', cntOf(rep) === 2, rep);
  check('②2 「' + Y + '/03」不再出現「目前沒有紀錄」', rep.indexOf('目前沒有紀錄') === -1, rep);
})();
(function () {
  const env = seed(mkEnv());
  const rep = send(env, '查出勤 26/07');
  check('②3 「26/07」明確報錯，不靜默回「沒有紀錄」',
    /日期看不懂/.test(rep) && rep.indexOf('目前沒有紀錄') === -1, rep);
  check('②4 「26/07」報錯訊息附正確用法教學', /查出勤 7月/.test(rep) && /7\/1-7\/15/.test(rep), rep);
})();
(function () {
  const env = seed(mkEnv());
  const rep = send(env, '查出勤 13/1');
  check('②5 月份邊界 13 → 報錯', /日期看不懂/.test(rep), rep);
})();
(function () {
  const env = seed(mkEnv());
  const rep = send(env, '查出勤 12/31');
  check('②6 邊界 12/31 為合法日期，不報錯', !/日期看不懂/.test(rep), rep);
})();

/* ========== ③ M/D 不回歸 ========== */
(function () {
  const env = seed(mkEnv());
  const rep = send(env, '查出勤 3/5-3/20');
  check('③1 區間 3/5-3/20 仍正常（2 筆）', cntOf(rep) === 2, rep);
})();
(function () {
  const env = seed(mkEnv());
  const rep = send(env, '查出勤 3/5');
  check('③2 單日 3/5 仍正常（1 筆）', cntOf(rep) === 1, rep);
})();

/* ========== ④ 不帶條件仍撈全部（不預設本月）========== */
(function () {
  const env = seed(mkEnv());
  const rep = send(env, '查出勤紀錄');
  check('④1 不帶條件撈全部 4 筆（含去年，不預設本月）', cntOf(rep) === 4, rep);
})();
(function () {
  const env = seed(mkEnv());
  const rep = send(env, '查出勤 阿良 3月');
  check('④2 員工名+月份混合 → 只回阿良當年3月 1 筆', cntOf(rep) === 1, rep);
  check('④3 標題同時含員工名與月份', rep.indexOf('阿良') !== -1 && rep.indexOf('（' + Y + '/03）') !== -1, rep);
})();

/* ========== ⑤ 顯示上限外顯（A）========== */
(function () {
  const env = mkEnv();
  env.fns.getSheet(ATT);
  const r = env.sheets[ATT].__rows;
  for (let i = 1; i <= 65; i++) r.push([stamp(Y, 3, (i % 28) + 1, '08:0' + (i % 10)), '阿良', '下班', '正常', '']);
  const rep = send(env, '查出勤紀錄');
  check('⑤1 65 筆 → 顯示總數 65', cntOf(rep) === 65, rep.slice(0, 120));
  check('⑤2 65 筆 → 明說只顯示最近 60 筆', /只顯示最近 60 筆/.test(rep), rep.slice(-200));
})();
(function () {
  const env = seed(mkEnv());
  const rep = send(env, '查出勤紀錄');
  check('⑤3 未超過 60 筆 → 不出現截斷提示', !/只顯示最近/.test(rep), rep);
})();

/* ========== 輸出 ========== */
console.log('\n========== v3.4.7（查出勤月份篩選／年月誤讀／顯示上限）回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
if (fails) { console.log(' ✗ 有 ' + fails + ' 項 FAIL'); process.exit(1); }
console.log(' ✓ 全部 PASS（' + out.length + ' 項）');
