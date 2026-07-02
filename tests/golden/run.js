/**
 * Golden 回歸測試 runner（B2 / QA）
 * ---------------------------------------------------------------------------
 * 跑法：  node tests/golden/run.js
 * 語意：  任一測試 FAIL → process.exit(1)（供 pre-push / merge gate 擋合併）。
 *
 * RED / GREEN 慣例（見 docs/business_rules.md、MANIFEST.md）：
 *   - 每個測試斷言的是「商業規則的**目標行為**」。
 *   - 目前程式若不符目標 → 測試 FAIL → 標記 [RED]：代表 bug 尚未修，這是**刻意**的，
 *     RED 就是「這個 bug 還在」的可執行證據。修好 .gs 後同一測試會自動轉 [GREEN]。
 *   - 目前程式若已符合 → 測試 PASS → 標記 [GREEN]。
 *
 * 因此在 bug 修好前，本 runner 會以 exit 1 結束並擋住 merge —— 這是預期狀態。
 */
'use strict';

const { createEnv } = require('./harness');

/* ---------------- 迷你測試框架 ---------------- */
const results = [];
function record(id, title, rule, ok, expectRed, detail) {
  results.push({ id, title, rule, ok, expectRed, detail: detail || '' });
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

/* 每個測試回傳一個會 throw 代表「不符目標行為」的函式；throw = RED，通過 = GREEN。 */
function runTest(id, title, rule, expectRed, fn) {
  let ok = true, detail = '';
  try {
    detail = fn() || '';
  } catch (e) {
    ok = false;
    detail = String(e && e.message || e);
  }
  record(id, title, rule, ok, expectRed, detail);
}

/* ============================================================= */
/* G001 — 一般交易不建寄運 (R1.1)                                 */
/* 目標：首行純數字 `1828` 不是寄運客戶，不得產生 customer 為純數字的寄運記錄。 */
/* 現況預期：RED（1828 被當客戶寫進寄運）                          */
/* ============================================================= */
runTest('G001', '一般交易不建寄運（1828 不得成為寄運客戶）', 'R1.1', true, () => {
  const { fns } = createEnv();
  const res = fns.parseShipping('1828\n翠峰文科高山228 中15件');
  const numericCustomers = (res.records || []).filter(r => /^\d+$/.test(String(r.customer).trim()));
  const dump = JSON.stringify(res.records);
  assert(
    numericCustomers.length === 0,
    '產生了 customer 為純數字的寄運記錄（應為 0）：' + JSON.stringify(numericCustomers) + '｜全部records=' + dump
  );
  return 'records=' + dump;
});

/* ============================================================= */
/* G004 — 玉美加工廠寄旭陽 (R1.3)                                  */
/* 目標：解析出 1 筆 record：customer=玉美加工廠、qty=87、包裝/單位含台子、物流=旭陽。 */
/* 測試輸入為【任務指定的原字串】（單行、以空白分隔）。               */
/* ============================================================= */
runTest('G004', '玉美加工廠寄旭陽（單行字串，任務指定輸入）', 'R1.3', false, () => {
  const { fns } = createEnv();
  const res = fns.parseShipping('玉美加工廠 毛路87台 寄旭陽');
  const dump = JSON.stringify(res.records);
  assert(res.count === 1, '應解析出 1 筆 record，實際 ' + res.count + ' 筆｜records=' + dump);
  const r = res.records[0];
  assert(r.customer === '玉美加工廠', "customer 應為 '玉美加工廠'，實際 '" + r.customer + "'");
  assert(String(r.qty) === '87', '數量應為 87，實際 ' + r.qty);
  const packUnit = String(r.pack || '') + '/' + String(r.unit || '');
  assert(/台/.test(packUnit), '包裝/單位應含台子，實際 pack=' + r.pack + ' unit=' + r.unit);
  assert(r.logistics === '旭陽', "物流應為 '旭陽'，實際 '" + r.logistics + "'");
  return 'records=' + dump;
});

/* ---- G004n（診斷，非 gate）：同一筆用【換行分隔】格式，驗證 parser 本身能正確處理 ---- */
/* 目的：釐清 G004 若 RED，是「格式輸入方式」問題還是「parser 能力」問題。       */
runTest('G004n', '（診斷）玉美加工廠寄旭陽 — 換行分隔格式', 'R1.3', false, () => {
  const { fns } = createEnv();
  const res = fns.parseShipping('玉美加工廠\n毛路87台\n寄旭陽');
  const dump = JSON.stringify(res.records);
  assert(res.count === 1, '換行格式應解析 1 筆，實際 ' + res.count + '｜' + dump);
  const r = res.records[0];
  assert(r.customer === '玉美加工廠', "customer 應為 '玉美加工廠'，實際 '" + r.customer + "'");
  assert(String(r.qty) === '87', '數量應為 87，實際 ' + r.qty);
  assert(/台/.test(String(r.pack || '') + String(r.unit || '')), '包裝應含台子，實際 pack=' + r.pack);
  assert(r.logistics === '旭陽', "物流應為 '旭陽'，實際 '" + r.logistics + "'");
  return 'records=' + dump;
});

/* ============================================================= */
/* G005 — 錯誤打卡不入正式 (R4.1 / R4.2)                           */
/* 目標：非白名單員工（亂碼）的「XXX 下班」不得寫入正式出勤紀錄。      */
/* 手法：走 handleEvent 真實打卡辨識路徑（行481-507），用 mock 攔截寫入。 */
/* 現況預期：RED（無白名單驗證，亂碼被當員工寫入出勤打卡分頁）        */
/* ============================================================= */
runTest('G005', '錯誤打卡不入正式（非白名單員工不得寫入 attendance）', 'R4.1', true, () => {
  const env = createEnv();
  const { fns, sheets } = env;
  const GARBAGE = '測試亂碼zzz';
  const ADMIN_G = 'ADMIN_GROUP_1';
  // 設為管理群組，讓寫入通過權限閘門（否則會在 canWrite 檢查被擋，測不到打卡邏輯）
  env.scriptProps.setProperty('ADMIN_GROUP_IDS', ADMIN_G);

  const event = {
    type: 'message',
    replyToken: 'REPLY_TOKEN',
    message: { type: 'text', text: GARBAGE + '下班' },
    source: { groupId: ADMIN_G, userId: 'USER_X' },
  };
  fns.handleEvent(event);

  const attend = sheets['出勤打卡'];
  const rows = attend ? attend.__rows.slice(1) : []; // 去表頭
  const empCol = rows.map(r => String(r[1]));
  const written = empCol.includes(GARBAGE);
  // 目標行為：不應寫入；若已寫入 → throw（RED，記錄現況為證據）
  assert(
    !written,
    '非白名單亂碼「' + GARBAGE + '」被當員工寫入出勤打卡（現況無 R4.2 白名單驗證）｜出勤員工欄=' + JSON.stringify(empCol)
  );
  return '出勤員工欄=' + JSON.stringify(empCol);
});

/* ============================================================= */
/* G007 — 市場群組不得改寄運 (R5.1)                                */
/* 目標：市場群組 getPerm(chatId).canWrite === false。             */
/* 現況預期：GREEN                                                 */
/* ============================================================= */
runTest('G007', '市場群組不得改寄運（getPerm.canWrite=false）', 'R5.1', false, () => {
  const env = createEnv();
  const { fns } = env;
  const MKT_G = 'MARKET_GROUP_1';
  env.scriptProps.setProperty('MARKET_GROUP_IDS', MKT_G);

  const perm = fns.getPerm(MKT_G);
  assert(perm && perm.type === 'market', "perm.type 應為 'market'，實際 '" + (perm && perm.type) + "'");
  assert(perm.canWrite === false, 'market 群組 canWrite 應為 false，實際 ' + perm.canWrite);
  assert(perm.canShipping === false, 'market 群組 canShipping 應為 false，實際 ' + perm.canShipping);
  return 'perm=' + JSON.stringify(perm);
});

/* ---------------- 輸出報告 ---------------- */
function color(s, c) {
  const codes = { red: 31, green: 32, yellow: 33, gray: 90, bold: 1 };
  if (!process.stdout.isTTY) return s;
  return '\x1b[' + (codes[c] || 0) + 'm' + s + '\x1b[0m';
}

console.log('');
console.log('==================================================================');
console.log(' 卡比集機器人 — Golden 回歸測試 (B2/QA)');
console.log('==================================================================');

let fails = 0;
let unexpected = 0;
for (const r of results) {
  const passed = r.ok;
  if (!passed) fails++;
  const state = passed ? '[GREEN]' : '[RED]';
  const stateColored = passed ? color(state, 'green') : color(state, 'red');
  const passFail = passed ? color('PASS', 'green') : color('FAIL', 'red');
  // 是否符合預期（expectRed=true 代表現況預期為 RED）
  const asExpected = passed ? !r.expectRed : r.expectRed;
  const tag = asExpected ? color('(符合預期)', 'gray') : color('(!! 非預期，請注意)', 'yellow');
  if (!asExpected) unexpected++;
  console.log('');
  console.log(`${passFail} ${stateColored} ${r.id}  ${r.title}`);
  console.log(`        規則:${r.rule}  現況預期:${r.expectRed ? 'RED' : 'GREEN'}  ${tag}`);
  console.log('        ' + color(r.detail, 'gray'));
}

console.log('');
console.log('------------------------------------------------------------------');
const green = results.length - fails;
console.log(` 總計 ${results.length} 項：GREEN ${green} / RED ${fails}`);
if (unexpected > 0) {
  console.log(color(` ⚠ 有 ${unexpected} 項結果與「現況預期」不同，請人工確認。`, 'yellow'));
}
console.log('------------------------------------------------------------------');
console.log('');

if (fails > 0) {
  console.log(color(' ✗ 有 RED（未修 bug）→ exit 1，merge gate 應擋住合併。', 'red'));
  console.log('   （RED 是刻意的：代表 business_rules 目標行為尚未達成；修好 .gs 即轉 GREEN。）');
  process.exit(1);
} else {
  console.log(color(' ✓ 全部 GREEN → exit 0。', 'green'));
  process.exit(0);
}
