'use strict';
/* Task 1 安全修補 回歸測試
 * ---------------------------------------------------------------------------
 * - # 設定/寫入指令：非老闆一律被拒且資料/PROPS 不變；老闆照常。
 * - #註冊老闆：已有老闆且非本人 → 搶注被拒，OWNER 不變。
 * - #轉移老闆 確定：現任老闆解除；非老闆不可轉移。
 * 跑法：node tests/golden/run_security.js（任一 FAIL → exit 1）
 */
const { createEnv } = require('./harness');
const OWNER = 'U_OWNER', OTHER = 'U_OTHER', G = 'G_ADMIN';
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }

function mkEnv(withOwner) {
  const env = createEnv();
  if (withOwner) env.scriptProps.setProperty('OWNER_USER_ID', OWNER);
  env.scriptProps.setProperty('ADMIN_GROUP_IDS', G);
  return env;
}
function send(env, text, userId) {
  const ev = { type: 'message', replyToken: 'RT', message: { type: 'text', text: text }, source: { groupId: G, userId: userId } };
  env.fns.handleEvent(ev);
  const replies = env.urlFetchCalls.map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join(' '); } catch (e) { return ''; } });
  return replies.join(' || ');
}

/* ---------- 1. 非老闆被拒、資料不變 ---------- */
(function () {
  const cmds = [
    { t: '#新增貨主 測試貨主', prop: 'VENDORS' },
    { t: '#安靜', prop: 'QUIET' },
    { t: '#新增冰庫 測試庫', prop: 'WAREHOUSES' },
    { t: '#設定客戶 測試客戶', prop: 'GROUP_CUSTOMER' },
    { t: '#設定物流客戶 旭陽 甲 乙', prop: 'CARRIER_CUST' },
    { t: '#清空冰庫名單', prop: 'WAREHOUSES' },
    { t: '#設定工作群組', prop: 'WORK_GROUPS' },
    { t: '#取消客戶', prop: 'GROUP_CUSTOMER' },
    { t: '#設定外勤補貼 18:00 500 800', prop: 'DUTY_THRESHOLD' },
  ];
  cmds.forEach(function (c, i) {
    const env = mkEnv(true);
    const before = env.scriptProps.getProperty(c.prop);
    const r = send(env, c.t, OTHER);
    const after = env.scriptProps.getProperty(c.prop);
    check('1.' + (i + 1) + ' 非老闆「' + c.t + '」被拒且不變', /🔒/.test(r) && before === after, 'reply=' + r + ' before=' + before + ' after=' + after);
  });
})();

/* ---------- 2. 老闆照常可用 ---------- */
(function () {
  const env = mkEnv(true);
  const r = send(env, '#新增貨主 旭陽新貨主', OWNER);
  check('2.1 老闆新增貨主成功', /已新增貨主/.test(r) && (env.scriptProps.getProperty('VENDORS') || '').indexOf('旭陽新貨主') !== -1, 'reply=' + r);
  const env2 = mkEnv(true);
  const r2 = send(env2, '#安靜', OWNER);
  check('2.2 老闆開安靜成功', /安靜/.test(r2) && env2.scriptProps.getProperty('QUIET') === '1', 'reply=' + r2);
})();

/* ---------- 3. #註冊老闆 搶注防護 ---------- */
(function () {
  const env = mkEnv(true);           // 已有 OWNER
  const r = send(env, '#註冊老闆', OTHER);
  check('3.1 已有老闆時他人搶注被拒', /無法搶注|已有老闆/.test(r) && env.scriptProps.getProperty('OWNER_USER_ID') === OWNER, 'reply=' + r + ' owner=' + env.scriptProps.getProperty('OWNER_USER_ID'));
  const env2 = mkEnv(false);         // 無 OWNER
  const r2 = send(env2, '#註冊老闆', OTHER);
  check('3.2 無老闆時首註成功', /註冊成功/.test(r2) && env2.scriptProps.getProperty('OWNER_USER_ID') === OTHER, 'reply=' + r2);
  const env3 = mkEnv(true);
  const r3 = send(env3, '#註冊老闆', OWNER);   // 本人重註冊
  check('3.3 本人重註冊允許', /註冊成功/.test(r3) && env3.scriptProps.getProperty('OWNER_USER_ID') === OWNER, 'reply=' + r3);
})();

/* ---------- 4. #轉移老闆 ---------- */
(function () {
  const env = mkEnv(true);
  const rNon = send(env, '#轉移老闆 確定', OTHER);
  check('4.1 非老闆不可轉移', /🔒|僅限/.test(rNon) && env.scriptProps.getProperty('OWNER_USER_ID') === OWNER, 'reply=' + rNon);
  const env2 = mkEnv(true);
  const rNoConfirm = send(env2, '#轉移老闆', OWNER);
  check('4.2 無「確定」只提示不解除', /確定/.test(rNoConfirm) && env2.scriptProps.getProperty('OWNER_USER_ID') === OWNER, 'reply=' + rNoConfirm);
  const env3 = mkEnv(true);
  const rDo = send(env3, '#轉移老闆 確定', OWNER);
  check('4.3 老闆確定轉移→解除為無主', /已解除/.test(rDo) && !env3.scriptProps.getProperty('OWNER_USER_ID'), 'reply=' + rDo + ' owner=' + env3.scriptProps.getProperty('OWNER_USER_ID'));
  // 解除後新人可接手
  const rNew = send(env3, '#註冊老闆', OTHER);
  check('4.4 轉移後新人可接手', env3.scriptProps.getProperty('OWNER_USER_ID') === OTHER, 'owner=' + env3.scriptProps.getProperty('OWNER_USER_ID'));
})();

/* ---------- 報告 ---------- */
console.log('\n========== Task 1 安全修補 回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
