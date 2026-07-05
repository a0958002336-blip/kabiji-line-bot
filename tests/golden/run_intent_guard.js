'use strict';
/* Intent Guard 回歸測試（P0）
 * ---------------------------------------------------------------------------
 * 鎖定不變量（「寧可不執行，也不能執行錯」）：
 *   - 收台/空籃/棧板回收 → 不得判定為收款
 *   - 聊天/填充詞（好/哈哈/用今天的/今天/收到/修改一下…）→ 不得建立任何 ERP 資料
 *   - 只有完整寄運/出貨格式（客戶+品項+件數）才建立寄運
 * 跑法：node tests/golden/run_intent_guard.js（任一 FAIL → exit 1）
 */
const { createEnv } = require('./harness');
const G = 'G_ADMIN', OWNER = 'U_OWNER';
const ERP_SHEETS = ['寄運資料', '出勤打卡', '外勤補貼', '財務改價', '冰庫寄存', '台子庫存', '鐵架庫存', '退貨紀錄', '員工借支', '入職時間', '冰庫總量'];
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }

function drive(text, opts) {
  opts = opts || {};
  const env = createEnv();
  env.scriptProps.setProperty('OWNER_USER_ID', OWNER);
  env.scriptProps.setProperty('ADMIN_GROUP_IDS', G);   // 管理群組（可寫入）— 最嚴格情境
  const msg = { type: 'text', text: text };
  if (opts.quote) msg.quotedMessageId = 'QMID_123';    // 模擬 Line Quote 引用
  const ev = { type: 'message', replyToken: 'RT', message: msg, source: { groupId: G, userId: OWNER } };
  let err = null; try { env.fns.handleEvent(ev); } catch (e) { err = String(e && e.message || e); }
  const writes = {};
  ERP_SHEETS.forEach(function (s) { const rows = env.sheets[s] ? env.sheets[s].__rows.slice(1) : []; if (rows.length) writes[s] = rows.length; });
  return { env: env, writes: writes, err: err };
}
function totalWrites(w) { return Object.keys(w).reduce(function (a, k) { return a + w[k]; }, 0); }

/* ---------- A. classifyIntent 單元 ---------- */
(function () {
  const env = createEnv(); const ci = env.fns.classifyIntent;
  check('A1 收台回來→非收款(collection)', ci('收台回來').intent === 'collection', JSON.stringify(ci('收台回來')));
  check('A2 空籃回收→非收款', ci('空籃回收').intent !== 'payment', JSON.stringify(ci('空籃回收')));
  check('A3 棧板回收→非收款', ci('棧板回收').intent !== 'payment', JSON.stringify(ci('棧板回收')));
  check('A4 收款5000→payment', ci('收款5000').intent === 'payment', JSON.stringify(ci('收款5000')));
  check('A5 匯款3000→payment', ci('匯款3000').intent === 'payment', JSON.stringify(ci('匯款3000')));
  check('A6 用今天的→chat(低信心)', ci('用今天的').intent === 'chat' && ci('用今天的').confidence < 95, JSON.stringify(ci('用今天的')));
  check('A7 好→chat', ci('好').confidence < 95, JSON.stringify(ci('好')));
  check('A8 哈哈→chat', ci('哈哈').confidence < 95, JSON.stringify(ci('哈哈')));
  check('A9 修改一下→低信心', ci('修改一下').confidence < 95, JSON.stringify(ci('修改一下')));
  check('A10 今天→低信心', ci('今天').confidence < 95, JSON.stringify(ci('今天')));
  check('A11 收到→低信心', ci('收到').confidence < 95, JSON.stringify(ci('收到')));
  // 正式出貨單（含備註需收台）→ shipping，不得被收台字誤判成 collection/payment
  const s = ci('漢光\n老八田南瓜 特30件（漢光三場950元 需收台回來）');
  check('A12 30件出貨單→shipping(非收款/回收)', s.intent === 'shipping', JSON.stringify(s));
})();

/* ---------- B. 端到端：聊天/填充詞不得建立任何 ERP ---------- */
['好', '嗯', 'OK', '收到', '今天', '用今天的', '等等', '回來', '修改一下', '哈哈', '了解', '可以'].forEach(function (t, i) {
  const r = drive(t);
  check('B' + (i + 1) + ' 「' + t + '」不得建立任何 ERP', totalWrites(r.writes) === 0 && !r.err, '寫入=' + JSON.stringify(r.writes) + (r.err ? ' err=' + r.err : ''));
});

/* ---------- C. 端到端：收台回來 不得建立收款/財務 ---------- */
(function () {
  const r = drive('收台回來');
  check('C1 收台回來 無收款/財務寫入', !r.writes['財務改價'] && totalWrites(r.writes) === 0, JSON.stringify(r.writes));
})();

/* ---------- D. 端到端：漢光出貨單 → 建立寄運、且「不」建立收款/財務 ---------- */
(function () {
  const r = drive('漢光\n老八田南瓜 特30件（漢光三場950元 需收台回來）');
  check('D1 漢光30件 → 建立寄運 1 筆', r.writes['寄運資料'] === 1, JSON.stringify(r.writes));
  check('D2 漢光30件 → 不建立收款/財務', !r.writes['財務改價'], JSON.stringify(r.writes));
})();

/* ---------- E. Line Quote 引用：不得直接寫入 ERP ---------- */
(function () {
  // 引用一張正式寄運單的文字 → 因為是「引用」，不得建立寄運
  const q = drive('漢光\n老八田南瓜 特30件 寄旭陽', { quote: true });
  check('E1 引用寄運單 → 不建立寄運', !q.writes['寄運資料'] && totalWrites(q.writes) === 0, JSON.stringify(q.writes));
  // 對照組：同一則非引用 → 正常建立寄運（確認守衛沒有誤殺正常寫入）
  const n = drive('漢光\n老八田南瓜 特30件 寄旭陽', { quote: false });
  check('E2 對照：非引用同文字 → 正常建立寄運 1 筆', n.writes['寄運資料'] === 1, JSON.stringify(n.writes));
  // 引用 + 打卡 → 不得寫入出勤
  const q2 = drive('小明 上班', { quote: true });
  check('E3 引用打卡 → 不建立出勤', !q2.writes['出勤打卡'] && totalWrites(q2.writes) === 0, JSON.stringify(q2.writes));
})();

/* ---------- F. 硬攔：正常寄運不受影響（回歸保護）---------- */
(function () {
  const ok = drive('陳老闆\n高麗菜 中 20件 寄旭陽');
  check('F1 正式寄運單 → 硬攔放行、建立 1 筆', ok.writes['寄運資料'] === 1, JSON.stringify(ok.writes));
})();

/* ---------- G. Task5 數字客戶白名單 ---------- */
(function () {
  const w = drive('3088\n南瓜 30件');   // 3088 為白名單數字客戶（無「寄」也放行）
  check('G1 白名單數字客戶3088 → 建立寄運', w.writes['寄運資料'] === 1, JSON.stringify(w.writes));
  const b1 = drive('1828\n南瓜 30件');   // 1828 非白名單 → 擋
  check('G2 非白名單數字1828 → 不建立寄運', !b1.writes['寄運資料'], JSON.stringify(b1.writes));
  const b2 = drive('1828\n50件');
  check('G3 「1828⏎50件」 → 不寫入', totalWrites(b2.writes) === 0, JSON.stringify(b2.writes));
})();

/* ---------- 報告 ---------- */
console.log('\n========== Intent Guard 回歸測試（P0）==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
