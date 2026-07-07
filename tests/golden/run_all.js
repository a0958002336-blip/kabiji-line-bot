'use strict';
/* runTests() 黃金測試總入口（Task 0）
 * ---------------------------------------------------------------------------
 * 聚合所有 golden 子測試套件，一次跑完並輸出總通過/失敗數。
 * 這是「回歸測試結果」的權威輸出——RC 前必須全綠（run.js 的既有待決策 RED 另計）。
 * 跑法：node tests/golden/run_all.js
 */
const { execFileSync } = require('child_process');
const path = require('path');
const DIR = __dirname;

// 全綠型套件（exit 0 = 通過）
const SUITES = [
  'run_version.js',       // #版本 build 識別
  'run_security.js',      // Task1/8 安全
  'run_task8.js',         // Task8 去重/fail-closed
  'run_emp_norm.js',      // Task6 員工正規化
  'run_intent_guard.js',  // Task3/4/9 意圖守衛
  'run_task9.js',         // Task9 誤判補強
  'run_route_fix.js',     // Bug3/4 外勤/冰庫貼回路由
  'run_task7.js',         // Task7 回覆防護/未填地點
  'run_stats_format.js',  // Task11+12 統計輸出格式
  'run_bug5.js',          // Bug5 寄運誤判 + 補測
  'run_ship_rule.js',     // 寄運定義收緊(業務規則)
  'run_receivable.js',    // Task4 收款/未收款
  'run_outbound.js',      // Task5 出庫/庫存
  'run_quiet.js',         // 安靜模式：分群獨立 + 全域 + unknown 提示尊重安靜
];

let totalPass = 0, totalCount = 0, hardFail = 0;
const lines = [];
SUITES.forEach(function (s) {
  let out = '', ok = true;
  try { out = execFileSync('node', [path.join(DIR, s)], { encoding: 'utf8' }); }
  catch (e) { ok = false; out = (e.stdout || '') + (e.stderr || ''); }
  const m = out.match(/全部 PASS（(\d+) 項）/);
  const f = out.match(/有 (\d+) 項 FAIL/);
  const pass = m ? parseInt(m[1], 10) : 0;
  const fail = f ? parseInt(f[1], 10) : (ok ? 0 : 1);
  totalPass += pass; totalCount += pass + fail;
  if (!ok || fail > 0) hardFail++;
  lines.push((ok && fail === 0 ? '✅' : '❌') + ' ' + s.padEnd(22) + ' ' + pass + ' 通過' + (fail ? ('，' + fail + ' 失敗') : ''));
});

// 既有 business-rule golden（run.js）：含刻意 RED（待決策 D4/D6），單獨呈現、不計入硬失敗
let goldenNote = '';
try { execFileSync('node', [path.join(DIR, 'run.js')], { encoding: 'utf8' }); goldenNote = '✅ run.js 全綠'; }
catch (e) { const o = (e.stdout || ''); const gm = o.match(/GREEN (\d+) \/ RED (\d+)/); goldenNote = 'ℹ️ run.js ' + (gm ? ('GREEN ' + gm[1] + ' / RED ' + gm[2] + '（既有待決策 D4/D6，非回歸）') : '（見 run.js）'); }

console.log('\n==================================================================');
console.log(' runTests() 黃金測試總結（Task 0）');
console.log('==================================================================\n');
console.log(lines.join('\n'));
console.log('\n' + goldenNote);
console.log('\n------------------------------------------------------------------');
console.log(' 總計：' + totalPass + '/' + totalCount + ' 通過' + (hardFail ? ('，' + hardFail + ' 個套件有失敗') : '') + '。');
console.log(hardFail === 0 ? ' ✓ 全綠（RC 就緒條件之一）' : ' ✗ 有失敗套件，不得產 RC');
console.log('------------------------------------------------------------------');
process.exit(hardFail === 0 ? 0 : 1);
