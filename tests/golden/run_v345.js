'use strict';
/* v3.4.5 回歸測試：#備註防呆 ＋ 電錶月結模組
 *  A #備註防呆：只有「#備註 內容」才掛備註；其他 #開頭非指令 → 明確報「無此指令」，不再兜底成備註
 *  B 電錶：#新增電錶/#抄錶/#電錶/#電費紀錄/#電錶設定/#停用+啟用電錶/#電錶提醒；算式/期間串接/防呆/提醒/觸發器
 * 跑法：node tests/golden/run_v345.js
 */
const { createEnv } = require('./harness');
const OWNER = 'U_OWNER', G = 'G_ADMIN';
const MCFG = '電錶設定', MLOG = '電費紀錄', SHIP = '寄運資料';
let fails = 0; const out = []; let msgSeq = 0;
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
function mkEnv() { const env = createEnv(); env.scriptProps.setProperty('OWNER_USER_ID', OWNER); env.scriptProps.setProperty('ADMIN_GROUP_IDS', G); return env; }
function send(env, text, uid) {
  const before = env.urlFetchCalls.length;
  env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: text, id: 'M' + (++msgSeq) }, source: { groupId: G, userId: uid || OWNER } });
  return env.urlFetchCalls.slice(before).filter(function (c) { return /\/message\/reply/.test(c.url); })
    .map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }).join(' || ');
}
function pushes(env) { return env.urlFetchCalls.filter(function (c) { return /\/message\/push/.test(c.url); }).map(function (c) { try { return JSON.parse(c.opts.payload); } catch (e) { return {}; } }); }
function cfg(env) { return env.sheets[MCFG] ? env.sheets[MCFG].__rows.slice(1) : []; }
function log(env) { return env.sheets[MLOG] ? env.sheets[MLOG].__rows.slice(1) : []; }
function shipRows(env) { return env.sheets[SHIP] ? env.sheets[SHIP].__rows.slice(1) : []; }

/* ========== A #備註 防呆 ========== */
(function () {
  const env = mkEnv();
  send(env, '6986\n高山228 特 100件 寄旭陽');
  const r1 = send(env, '#備註 客戶下午到');
  check('A1 #備註 內容 → 掛寄運備註', /已把備註掛到今日最近一筆/.test(r1) && shipRows(env)[0][9] === '客戶下午到', r1 + ' | ' + JSON.stringify(shipRows(env)[0]));
  // 裸 # 非指令 → 無此指令，且不掛備註
  const env2 = mkEnv();
  send(env2, '6986\n高山228 特 100件 寄旭陽');
  const r2 = send(env2, '#可以連鐵架一起需紀錄');
  check('A2 裸#非指令 → 無此指令(不兜底成備註)', /無此指令/.test(r2) && shipRows(env2)[0][9] === '', r2 + ' | ' + JSON.stringify(shipRows(env2)[0]));
  // 打錯字的指令(#抄表，正解 #抄錶) → 無此指令(這正是害董事長被誤掛備註的情境)
  const r3 = send(mkEnv(), '#抄表 子緯 1173');
  check('A3 打錯字 #抄表 → 無此指令(指向 #指令表/#備註)', /無此指令：#抄表/.test(r3) && /#指令表/.test(r3) && /#備註/.test(r3), r3);
  // #備註 空 → 用法提示
  check('A4 #備註(空) → 用法提示', /用法：#備註/.test(send(mkEnv(), '#備註')), '');
  // #指令表 含電錶
  check('A5 #指令表 含電錶指令', /電錶月結/.test(send(mkEnv(), '#指令表')) && /#抄錶/.test(send(mkEnv(), '#指令表')), '');
})();

/* ========== B 純函式 ========== */
(function () {
  const env = mkEnv();
  const c = env.fns.meterCompute(829, 1173, 30, 5);
  check('B1 meterCompute 829→1173 ×30 ×5 = 344/10320/51600', c.face === 344 && c.real === 10320 && c.amount === 51600, JSON.stringify(c));
  check('B2 fmtMoney 千分位', env.fns.fmtMoney(51600) === '51,600' && env.fns.fmtMoney(1234567) === '1,234,567' && env.fns.fmtMoney(0) === '0', '');
  check('B3 isMeterPendingThisMonth', env.fns.isMeterPendingThisMonth('', '2026/07/16') === true && env.fns.isMeterPendingThisMonth('2026/07/02', '2026/07/16') === false && env.fns.isMeterPendingThisMonth('2026/06/30', '2026/07/16') === true, '');
  check('B4 meterAnomaly >3倍', env.fns.meterAnomaly(51600, 10000) === true && env.fns.meterAnomaly(11000, 10000) === false && env.fns.meterAnomaly(51600, 0) === false, '');
})();

/* ========== B 電錶指令端到端 ========== */
(function () {
  const env = mkEnv();
  const r0 = send(env, '#新增電錶 子緯x旭陽 倍率30 電價5 起始829');
  check('B5 #新增電錶 → 建錶', /已新增電錶/.test(r0) && cfg(env).length === 1 && cfg(env)[0][0] === '子緯x旭陽' && Number(cfg(env)[0][4]) === 829, r0 + ' | ' + JSON.stringify(cfg(env)[0]));
  check('B6 重複建錶 → 已存在', /已存在/.test(send(env, '#新增電錶 子緯x旭陽 倍率30 電價5 起始829')), '');
  // 抄錶算式
  const r1 = send(env, '#抄錶 子緯x旭陽 1173');
  check('B7 #抄錶 回算式 344度(錶面)×30=10320度×5元=51,600元', /1173−829=344度\(錶面\)×30=10320度×5元=51,600元/.test(r1), r1);
  check('B8 抄錶後 目前讀數→1173、上次金額→51600', Number(cfg(env)[0][4]) === 1173 && Number(cfg(env)[0][7]) === 51600, JSON.stringify(cfg(env)[0]));
  const lg = log(env)[0];
  check('B9 電費紀錄結構化欄位(期間起=建錶日/本期1173/金額51600/科目)', lg && Number(lg[6]) === 1173 && Number(lg[11]) === 51600 && lg[3] === cfg(env)[0][5] && lg[13] === '營業支出-電費', JSON.stringify(lg));
})();
(function () {
  // 讀數≤上期 / 同日重複 防呆
  const env = mkEnv();
  send(env, '#新增電錶 A表 倍率10 電價6 起始1000');
  const r1 = send(env, '#抄錶 A表 900');
  check('B10 讀數≤上期 無確認 → 提示確認、零寫入', /≤ 上期/.test(r1) && log(env).length === 0, r1 + ' logs=' + log(env).length);
  const r2 = send(env, '#抄錶 A表 900 確認');
  check('B11 加「確認」→ 強制寫入', log(env).length === 1, r2);
  const r3 = send(env, '#抄錶 A表 1200');
  check('B12 同日重複 無確認 → 已記錄提示', /今天已抄過/.test(r3), r3);
})();
(function () {
  // #電錶設定 只影響之後、歷史不變
  const env = mkEnv();
  send(env, '#新增電錶 B表 倍率10 電價5 起始0');
  send(env, '#抄錶 B表 100');          // 歷史第一筆 電價=5 → 金額 100*10*5=5000
  const set = send(env, '#電錶設定 B表 電價5.2');
  check('B13 #電錶設定 電價5.2 → 更新設定', /已更新/.test(set) && Number(cfg(env)[0][3]) === 5.2, set + ' | ' + JSON.stringify(cfg(env)[0]));
  check('B14 歷史第一筆電價不變(=5)', Number(log(env)[0][10]) === 5, JSON.stringify(log(env)[0]));
})();
(function () {
  // 停用/啟用
  const env = mkEnv();
  send(env, '#新增電錶 C表 倍率10 電價5 起始0');
  send(env, '#停用電錶 C表');
  check('B15 停用後 狀態=停用、pending 排除', cfg(env)[0][8] === '停用' && env.fns.meterPendingList('2026/07/16').length === 0, JSON.stringify(cfg(env)[0]));
  check('B16 停用電錶 #抄錶 → 提示停用', /已停用/.test(send(env, '#抄錶 C表 50')), '');
  send(env, '#啟用電錶 C表');
  check('B17 啟用後 pending 恢復', cfg(env)[0][8] === '啟用' && env.fns.meterPendingList('2026/07/16').length === 1, '');
})();
(function () {
  // 查狀態 / 查歷史 / 電價小數 raw→round
  const env = mkEnv();
  send(env, '#新增電錶 D表 倍率3 電價5.2 起始0 出租方旭陽');
  const st = send(env, '#電錶 D表');
  check('B18 #電錶 查狀態', /電錶 D表/.test(st) && /出租方：旭陽/.test(st) && /電價：5.2/.test(st), st);
  const r = send(env, '#抄錶 D表 7');   // 7*3=21度 ×5.2=109.2 → round 109
  check('B19 電價小數 raw→round 顯示(109.2→109)', /109.2→109元\(四捨五入\)/.test(r), r);
  const hist = send(env, '#電費紀錄 D表');
  check('B20 #電費紀錄 列出期別＋合計', /電費紀錄/.test(hist) && /109元/.test(hist) && /合計/.test(hist), hist);
})();

/* ========== B 提醒 / 觸發器 ========== */
(function () {
  const env = mkEnv();
  send(env, '#新增電錶 子緯x旭陽 倍率30 電價5 起始829');
  // 未抄 → 追抄提醒推播到管理群
  env.fns.meterPendingReminder();
  const ps = pushes(env);
  check('B21 未抄 → meterPendingReminder 推播管理群', ps.length >= 1 && ps[0].to === G && /尚未抄錶/.test(ps[0].messages[0].text) && /子緯x旭陽/.test(ps[0].messages[0].text), JSON.stringify(ps));
  // 抄完後 → 不再推
  send(env, '#抄錶 子緯x旭陽 1173');
  const before = pushes(env).length;
  env.fns.meterPendingReminder();
  check('B22 抄完後 → 不再推播', pushes(env).length === before, 'before=' + before + ' after=' + pushes(env).length);
  // 早報訊息內容（meterMorningMessage 本身不判日期，僅組訊息；日期判斷在 meterMorningReminder）
  const mm = env.fns.meterMorningMessage();
  check('B23 早報訊息列待抄電錶＋上期讀數', /當月1號/.test(mm) && /子緯x旭陽/.test(mm) && /上期讀數/.test(mm), mm);
})();
(function () {
  const env = mkEnv();
  const r1 = env.fns.setupMeterTriggers();
  check('B24 setupMeterTriggers 建立 2 觸發器', /已建立/.test(r1) && env.triggers.length === 2, r1 + ' triggers=' + env.triggers.length);
  const r2 = env.fns.setupMeterTriggers();
  check('B25 再跑一次 → 不重複建立(idempotent)', /已存在/.test(r2) && env.triggers.length === 2, r2 + ' triggers=' + env.triggers.length);
  const st = env.fns.meterReminderStatus();
  check('B26 #電錶提醒 顯示觸發器健康＋推送群組', /早報觸發器.*✅/.test(st) && /追抄觸發器.*✅/.test(st) && /管理群 1 個/.test(st), st);
})();

console.log('\n========== v3.4.5（#備註防呆＋電錶月結）回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
