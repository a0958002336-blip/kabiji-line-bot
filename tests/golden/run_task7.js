'use strict';
/* Task 7 回覆防護 + 未填地點 回歸測試
 * - splitForLine：超長分多則（最多5則），仍超長截斷加提示；正常短訊單則
 * - handleDuty：「X出外勤」無地點 → 登記為（未填地點），count>0
 * 跑法：node tests/golden/run_task7.js
 */
const { createEnv } = require('./harness');
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }

(function () {
  const env = createEnv();
  const split = env.fns.splitForLine;
  check('1a 短訊 → 單則', split('哈囉').length === 1, JSON.stringify(split('哈囉').length));
  const m1 = split('x'.repeat(10000));
  check('1b 1萬字 → 分多則(≤5)', m1.length >= 2 && m1.length <= 5, '則數=' + m1.length);
  const m2 = split('x'.repeat(40000));
  check('1c 4萬字 → 最多5則', m2.length === 5, '則數=' + m2.length);
  check('1d 超長最後一則含截斷提示', /截斷/.test(m2[m2.length - 1].text), m2[m2.length - 1].text.slice(-40));
  check('1e 每則不超過4800', m1.every(function (x) { return x.text.length <= 4800; }) && m2.every(function (x) { return x.text.length <= 4800; }), 'ok');
})();

/* ---------- 2. 外勤未填地點 ---------- */
(function () {
  const env = createEnv();
  const r = env.fns.handleDuty('阿良出外勤');
  check('2a 「阿良出外勤」可登記(count>0)', r.count === 1, JSON.stringify(r));
  check('2b 回覆含未填地點', /未填地點/.test(r.reply || ''), r.reply);
  const row = env.sheets['外勤補貼'] ? env.sheets['外勤補貼'].__rows.slice(1)[0] : null;
  check('2c 外勤列地點欄=未填地點', row && row[2] === '未填地點', JSON.stringify(row));
  // 對照：有地點照常
  const env2 = createEnv();
  const r2 = env2.fns.handleDuty('阿良出外勤 台北一市場');
  check('2d 有地點正常登記', r2.count === 1 && /台北一市場/.test(r2.reply), r2.reply);
  // v3.2.x：即時回覆移除累計行、改附查累計提示
  check('2e 即時回覆不含舊累計行', !/本月累計|總累計/.test(r2.reply), r2.reply);
  check('2f 即時回覆含查累計提示', /查阿良外勤/.test(r2.reply), r2.reply);
})();

console.log('\n========== Task 7 回覆防護 + 未填地點 回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
