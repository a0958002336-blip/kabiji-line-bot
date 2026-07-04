'use strict';
/* 員工姓名正規化（SSOT）回歸測試
 * ---------------------------------------------------------------------------
 * 對應需求：良=阿良、宏欸4:07=宏欸4:07 有空白=宏欸；所有出勤/外勤/薪資/統計/借支/查詢/ERP寫入
 * 皆須以正式姓名合併，不得出現重複人名。
 * 跑法：node tests/golden/run_emp_norm.js　（任一 FAIL → exit 1）
 */
const { createEnv } = require('./harness');
const YM = '2026/06';
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function seed(env, sheet, rows) { const sh = env.fns.getSheet(sheet); rows.forEach(function (r) { sh.appendRow(r); }); }
function attRows(env) { return env.sheets['出勤打卡'].__rows.slice(1); }

/* 別名設定：良→阿良（扁平表）；宏欸4:07 / 宏欸 4:07 由 stripEmpTime 自動去時間，另用管理表宣告 */
function withAliases(env) {
  env.fns.setEmpAlias('良', '阿良');
  env.fns.setEmployeeAliases({ '阿良': ['良', '阿良'], '宏欸': ['宏欸', '宏欸4:07', '宏欸 4:07'] });
}

/* ---------- 0. normalizeEmployeeName 單元 ---------- */
(function () {
  const env = createEnv(); withAliases(env);
  const n = function (x) { return env.fns.normalizeEmployeeName(x); };
  check('0a 良→阿良', n('良') === '阿良', n('良'));
  check('0b 阿良→阿良', n('阿良') === '阿良', n('阿良'));
  check('0c 宏欸4:07→宏欸', n('宏欸4:07') === '宏欸', n('宏欸4:07'));
  check('0d 宏欸 4:07→宏欸', n('宏欸 4:07') === '宏欸', n('宏欸 4:07'));
  check('0e 宏欸→宏欸', n('宏欸') === '宏欸', n('宏欸'));
  check('0f 空白/全形冒號 宏欸 4：07→宏欸', n('宏欸 4：07') === '宏欸', n('宏欸 4：07'));
})();

/* ---------- 1. 出勤統計：良+阿良 合併、宏欸系列合併、無重複人名 ---------- */
(function () {
  const env = createEnv(); withAliases(env);
  seed(env, '出勤打卡', [
    ['2026/06/03 18:19', '良', '下班', '', ''],
    ['2026/06/04 18:20', '良', '下班', '', ''],
    ['2026/06/05 18:05', '良', '下班', '', ''],
    ['2026/06/06 18:00', '阿良', '下班', '', ''],
    ['2026/06/07 09:20', '阿良', '遲到', '', ''],
    ['2026/06/10 18:00', '宏欸', '下班', '', ''],
    ['2026/06/11 18:00', '宏欸4:07', '下班', '', ''],
    ['2026/06/12 18:00', '宏欸 4:07', '下班', '', ''],
  ]);
  const r = env.fns.attendanceStats(YM);
  check('1a 出現【阿良】', r.indexOf('【阿良】') !== -1, r);
  check('1b 不得出現【良】(單獨)', r.indexOf('【良】') === -1, r);
  check('1c 阿良 下班合併=4', /【阿良】[\s\S]*?下班 4/.test(r), r);
  check('1d 阿良 出勤天數=4', /【阿良】[\s\S]*?出勤 4 天/.test(r), r);
  check('1e 阿良 遲到=1', /【阿良】[\s\S]*?遲到 1 次/.test(r), r);
  check('1f 出現【宏欸】', r.indexOf('【宏欸】') !== -1, r);
  check('1g 宏欸 下班合併=3', /【宏欸】[\s\S]*?下班 3/.test(r), r);
  check('1h 統計不得殘留時間字串 4:07', r.indexOf('4:07') === -1, r);
  check('1i 宏欸只出現一次', (r.match(/【宏欸】/g) || []).length === 1, r);
  check('1j 阿良只出現一次', (r.match(/【阿良】/g) || []).length === 1, r);
})();

/* ---------- 2. 查單人出勤統計，須包含別名資料 ---------- */
(function () {
  const env = createEnv(); withAliases(env);
  seed(env, '出勤打卡', [
    ['2026/06/03 18:19', '良', '下班', '', ''],
    ['2026/06/04 18:20', '良', '下班', '', ''],
    ['2026/06/06 18:00', '阿良', '下班', '', ''],
  ]);
  const r = env.fns.attendanceStats(YM, '阿良');   // 查阿良 → 應含「良」的紀錄
  check('2a 查阿良含別名紀錄 下班=3', /下班 3/.test(r), r);
  check('2b 查阿良不出現【良】單獨', r.indexOf('【良】') === -1, r);
})();

/* ---------- 3. 外勤補貼：合計/明細依正式姓名合併 ---------- */
(function () {
  const env = createEnv(); withAliases(env);
  seed(env, '外勤補貼', [
    ['2026/06/03 18:19', '良', '台北一市場', '18:19', 500, ''],
    ['2026/06/08 17:45', '阿良', '西螺市場', '17:45', 300, ''],
    ['2026/06/12 19:02', '宏欸4:07', '嘉義加工廠', '19:02', 800, ''],
  ]);
  const all = env.fns.dutyAll(YM);
  check('3a 外勤合計出現阿良', all.indexOf('阿良') !== -1, all);
  check('3b 外勤合計阿良=800(500+300)', /阿良：800/.test(all), all);
  check('3c 外勤合計不得有單獨「・良：」', all.indexOf('・良：') === -1, all);
  check('3d 外勤合計宏欸(去時間)=800', /宏欸：800/.test(all), all);
  const q = env.fns.dutyQuery('阿良', YM);
  check('3e 查阿良外勤含別名 本月累計 800', /本月累計：800/.test(q), q);
})();

/* ---------- 4. 薪資/綜合評比：合併同一人 ---------- */
(function () {
  const env = createEnv(); withAliases(env);
  seed(env, '出勤打卡', [
    ['2026/06/03 18:19', '良', '下班', '', ''],
    ['2026/06/06 18:00', '阿良', '下班', '', ''],
  ]);
  seed(env, '外勤補貼', [['2026/06/03 18:19', '良', '台北', '18:19', 500, '']]);
  const r = env.fns.evaluation(YM);
  check('4a 評比出現【阿良】', r.indexOf('【阿良】') !== -1, r);
  check('4b 評比不出現【良】單獨', r.indexOf('【良】') === -1, r);
  check('4c 評比阿良只一次', (r.match(/【阿良】/g) || []).length === 1, r);
})();

/* ---------- 5. 借支：未還合計依正式姓名合併 ---------- */
(function () {
  const env = createEnv(); withAliases(env);
  seed(env, '員工借支', [
    ['2026/06/03 10:00', '良', '借', 1000],
    ['2026/06/05 10:00', '阿良', '借', 500],
    ['2026/06/09 10:00', '阿良', '還', 200],
  ]);
  const r = env.fns.loanQuery();
  check('5a 借支合併阿良未還=1300', /阿良：1300/.test(r), r);
  check('5b 借支不得單獨「・良：」', r.indexOf('・良：') === -1, r);
})();

/* ---------- 6. ERP 寫入路徑：打卡/外勤寫入前即正規化（不寫髒名） ---------- */
(function () {
  const env = createEnv(); withAliases(env);
  const OWNER = 'U_OWNER', G = 'G_ADMIN';
  env.scriptProps.setProperty('OWNER_USER_ID', OWNER);
  env.scriptProps.setProperty('ADMIN_GROUP_IDS', G);
  const ev = function (t) { return { type: 'message', replyToken: 'RT', message: { type: 'text', text: t }, source: { groupId: G, userId: OWNER } }; };

  env.fns.handleEvent(ev('宏欸 4:07 下班'));   // 時間被吃進姓名的經典案例
  let rows = attRows(env);
  const last = rows[rows.length - 1];
  check('6a 打卡寫入姓名=宏欸(非「宏欸 4:07」)', last && last[1] === '宏欸', JSON.stringify(last));

  env.fns.handleEvent(ev('良 下班'));           // 別名應在寫入時轉正式名
  rows = attRows(env);
  const last2 = rows[rows.length - 1];
  check('6b 打卡別名寫入=阿良', last2 && last2[1] === '阿良', JSON.stringify(last2));

  // 外勤寫入
  const dr = env.fns.handleDuty('宏欸4:07 出外勤 台中加工廠');
  check('6c 外勤寫入回覆用正式名 宏欸', dr.count === 1 && /🚚 宏欸 /.test(dr.reply), dr.reply);
  const dRow = env.sheets['外勤補貼'].__rows.slice(1).pop();
  check('6d 外勤寫入姓名欄=宏欸', dRow && dRow[1] === '宏欸', JSON.stringify(dRow));
})();

/* ---------- 報告 ---------- */
console.log('\n========== 員工姓名正規化 SSOT 回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
