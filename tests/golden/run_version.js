'use strict';
/* #版本 build 識別 回歸測試（開發紀律：交付前 #版本 必含當前版本字串＋build hash）
 * 跑法：node tests/golden/run_version.js
 */
const { createEnv } = require('./harness');
let fails = 0; const out = [];
function check(name, cond, detail) { if (cond) out.push('PASS ' + name); else { fails++; out.push('FAIL ' + name + '  ::  ' + (detail || '')); } }
const env = createEnv();
env.scriptProps.setProperty('OWNER_USER_ID', 'U'); env.scriptProps.setProperty('ADMIN_GROUP_IDS', 'G');
env.fns.handleEvent({ type: 'message', replyToken: 'RT', message: { type: 'text', text: '#版本' }, source: { groupId: 'G', userId: 'U' } });
const reply = env.urlFetchCalls.map(function (c) { try { return JSON.parse(c.opts.payload).messages.map(function (m) { return m.text; }).join('\n'); } catch (e) { return ''; } }).join('\n');
check('1 #版本 含當前版本字串 v3.3', /v3\.3/.test(reply.split('\n')[0]), reply.split('\n')[0]);
check('2 #版本 含 build 短hash (xxxxxxx)', /\([0-9a-f]{7}\)/.test(reply), reply.split('\n')[0]);
check('3 #版本 含本輪重點(收款/待收款)', /收款|待收款/.test(reply), '');
check('4 #版本 非舊版首行(不含 v2.58/v3.0/v3.1/v3.2)', !/v2\.58/.test(reply.split('\n')[0]) && !/v3\.0/.test(reply.split('\n')[0]) && !/v3\.1/.test(reply.split('\n')[0]) && !/v3\.2/.test(reply.split('\n')[0]), reply.split('\n')[0]);
console.log('\n========== #版本 build 識別 回歸測試 ==========\n');
console.log(out.join('\n'));
console.log('\n--------------------------------------------------');
console.log(fails === 0 ? ' ✓ 全部 PASS（' + out.length + ' 項）' : ' ✗ 有 ' + fails + ' 項 FAIL');
process.exit(fails === 0 ? 0 : 1);
