'use strict';
/* 出庫 / 扣庫存 模組回歸測試（Item 3）
 * ---------------------------------------------------------------------------
 * 需求：新增出庫、修改出庫、取消出庫、扣庫存正確、出庫與庫存一致（餘額欄=實際餘額）。
 * 手法：以真實 handleFreezerCmd（寄冰指令）+ handleEvent 驅動，檢查「冰庫寄存」表與 freezerBalanceOf。
 * 冰庫寄存欄位：[時間, 客戶, 品項, 動作, 數量, 餘額]
 * 跑法：node tests/golden/run_outbound.js（任一 FAIL → exit 1）
 */
const { createEnv } = require('./harness');
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function frzRows(env) { return env.sheets['冰庫寄存'] ? env.sheets['冰庫寄存'].__rows.slice(1) : []; }
function lastRow(env) { const r = frzRows(env); return r[r.length - 1]; }

/* 出庫與庫存一致性檢查：每個 (客戶|品項) 的最後一列餘額，必須等於 freezerBalanceOf */
function assertConsistent(env, tag) {
  const rows = frzRows(env); const seen = {};
  for (let i = 0; i < rows.length; i++) { const k = String(rows[i][1]) + '|' + String(rows[i][2]); seen[k] = { c: rows[i][1], p: rows[i][2], bal: Number(rows[i][5]) || 0 }; }
  let okAll = true, bad = '';
  Object.keys(seen).forEach(function (k) { const o = seen[k]; const q = env.fns.freezerBalanceOf(o.c, o.p); if (q !== o.bal) { okAll = false; bad += k + ' 表餘額=' + o.bal + ' 但 freezerBalanceOf=' + q + '; '; } });
  check(tag + ' 出庫與庫存一致', okAll, bad);
}

/* ---------- 1. 新增出庫（入庫→出庫，扣庫存正確）---------- */
(function () {
  const env = createEnv();
  env.fns.handleFreezerCmd('寄冰 客A 高麗菜 100');      // 入庫 100
  check('1a 入庫後餘額=100', env.fns.freezerBalanceOf('客A', '高麗菜') === 100, String(env.fns.freezerBalanceOf('客A', '高麗菜')));
  env.fns.handleFreezerCmd('寄冰 客A 高麗菜 -30');       // 出庫 30
  const lr = lastRow(env);
  check('1b 出庫列 動作=出庫', lr && lr[3] === '出庫', JSON.stringify(lr));
  check('1c 出庫列 數量=30', lr && Number(lr[4]) === 30, JSON.stringify(lr));
  check('1d 出庫後餘額=70', env.fns.freezerBalanceOf('客A', '高麗菜') === 70, String(env.fns.freezerBalanceOf('客A', '高麗菜')));
  assertConsistent(env, '1e');
})();

/* ---------- 2. 修改出庫（校正到指定值）---------- */
(function () {
  const env = createEnv();
  env.fns.handleFreezerCmd('寄冰 客B 芥菜 100');
  env.fns.handleFreezerCmd('寄冰 客B 芥菜 修改40');       // 校正為 40
  check('2a 修改後餘額=40', env.fns.freezerBalanceOf('客B', '芥菜') === 40, String(env.fns.freezerBalanceOf('客B', '芥菜')));
  check('2b 修改列動作=校正', lastRow(env)[3] === '校正', JSON.stringify(lastRow(env)));
  assertConsistent(env, '2c');
})();

/* ---------- 3. 取消出庫（歸 0，保留紀錄列不刪原始）---------- */
(function () {
  const env = createEnv();
  env.fns.handleFreezerCmd('寄冰 客C 大白菜 80');
  const before = frzRows(env).length;
  env.fns.handleFreezerCmd('寄冰 客C 大白菜 取消');       // 取消 → 歸 0
  check('3a 取消後餘額=0', env.fns.freezerBalanceOf('客C', '大白菜') === 0, String(env.fns.freezerBalanceOf('客C', '大白菜')));
  check('3b 取消是新增校正列(不刪舊資料)', frzRows(env).length === before + 1, '列數 ' + before + '→' + frzRows(env).length);
  assertConsistent(env, '3c');
})();

/* ---------- 4. 扣庫存不得為負（超額出庫夾在 0）---------- */
(function () {
  const env = createEnv();
  env.fns.handleFreezerCmd('寄冰 客D 青江菜 50');
  env.fns.handleFreezerCmd('寄冰 客D 青江菜 -999');       // 超額出庫
  check('4a 超額出庫餘額=0(不為負)', env.fns.freezerBalanceOf('客D', '青江菜') === 0, String(env.fns.freezerBalanceOf('客D', '青江菜')));
  assertConsistent(env, '4b');
})();

/* ---------- 5. 連續操作：入庫/出庫/入庫/修改/取消 → 一致 ---------- */
(function () {
  const env = createEnv();
  env.fns.handleFreezerCmd('寄冰 客E 莧菜 100');   // 100
  env.fns.handleFreezerCmd('寄冰 客E 莧菜 -20');    // 80
  env.fns.handleFreezerCmd('寄冰 客E 莧菜 10');     // 90 (裸數字=入庫累加)
  env.fns.handleFreezerCmd('寄冰 客E 莧菜 修改55');  // 55
  env.fns.handleFreezerCmd('寄冰 客E 莧菜 -5');     // 50
  check('5a 連續操作最終餘額=50', env.fns.freezerBalanceOf('客E', '莧菜') === 50, String(env.fns.freezerBalanceOf('客E', '莧菜')));
  assertConsistent(env, '5b');
})();

/* ---------- 6. handleEvent 整合（寄冰指令端到端出庫）---------- */
(function () {
  const env = createEnv();
  const G = 'G_ADMIN', OWNER = 'U_OWNER';
  env.scriptProps.setProperty('OWNER_USER_ID', OWNER);
  env.scriptProps.setProperty('ADMIN_GROUP_IDS', G);
  const ev = function (t) { return { type: 'message', replyToken: 'RT', message: { type: 'text', text: t }, source: { groupId: G, userId: OWNER } }; };
  env.fns.handleEvent(ev('寄冰 客F 空心菜 60'));
  env.fns.handleEvent(ev('寄冰 客F 空心菜 -25'));
  check('6a 端到端出庫後餘額=35', env.fns.freezerBalanceOf('客F', '空心菜') === 35, String(env.fns.freezerBalanceOf('客F', '空心菜')));
  assertConsistent(env, '6b');
})();

/* ---------- 報告 ---------- */
console.log('\n========== 出庫 / 扣庫存 模組回歸測試（Item 3）==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
