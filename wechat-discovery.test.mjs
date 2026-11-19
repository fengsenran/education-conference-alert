import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWechatResults} from './wechat-discovery.mjs';
function item(title,date){return `<li id="sogou_vr_11002601_box_0"><h3><a>${title}</a></h3><p class="txt-info">征文线索</p><span class="all-time-y2">学术人生</span><script>timeConvert('${Date.parse(date+'T00:00:00Z')/1000}')</script></li>`;}
test('public-index discovery retains account and dates but never asserts an open submission',()=>{
 const r=parseWechatResults(item('基础教育高峰论坛第二轮通知','2026-11-18'),'教育论坛','2026-11-19');
 assert.equal(r.length,1);assert.equal(r[0].account,'学术人生');assert.match(r[0].reason,/尚待核实/);assert.equal(r[0].deadline,undefined);
 assert.equal(parseWechatResults(item('基础教育高峰论坛通知','2020-11-18'),'教育论坛','2026-11-19').length,0);
 assert.equal(parseWechatResults(item('基础教育高峰论坛成功举办','2026-11-18'),'教育论坛','2026-11-19').length,0);
 assert.equal(parseWechatResults(item('全国热舒适学术会议通知','2026-11-18'),'教育论坛','2026-11-19').length,0);
});
test('verification or unexpected HTML is a retrieval failure, not an empty result',()=>{
 assert.throws(()=>parseWechatResults('请输入验证码','教育会议'),/验证/);
 assert.throws(()=>parseWechatResults('<html>unexpected page</html>','教育会议'),/无法识别/);
 assert.deepEqual(parseWechatResults('没有找到相关内容','教育会议'),[]);
});
