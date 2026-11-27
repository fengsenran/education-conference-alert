import test from 'node:test';
import assert from 'node:assert/strict';
import { assess as originalAssess, conferenceTiming, dayCN, links, articleText } from './monitor.mjs';
// Deadline tests below supply a known future meeting date as context.
const assess=(title,body,...args)=>originalAssess(title,body+'\n会议时间：2026年12月15日',...args);
const topics=['农村教育','教育公平'];
const title='农村教育资源配置学术研讨会征稿通知';
test('only future submission deadlines qualify, registration dates do not',()=>{
  const body='农村教育与教育公平\n会议地点：北京师范大学\n投稿截止时间：2026年12月1日\n报名截止时间：2026年12月10日';
  assert.equal(assess(title,body,'2026-11-17',topics).deadline,'2026-12-01');
  assert.equal(assess(title,body,'2026-12-02',topics).reason,'已截稿');
  assert.match(assess(title,body.replace('投稿截止时间：2026年12月1日',''),'2026-11-17',topics).reason,/未能确认/);
});
test('old or undated conferences cannot escape through the pending-information branch',()=>{
 assert.match(originalAssess('2023年全国基础教育学术年会','主办单位：中国教育学会\n会议时间：2023年12月1日','2026-11-27',topics).reason,/过期/);
 assert.match(conferenceTiming('全国基础教育年会','会议时间：2023年12月1日','2026-11-27').reason,/已举行/);
 assert.match(conferenceTiming('全国基础教育年会','会议时间：另行通知','2026-11-27').reason,/无法核实/);
 assert.match(conferenceTiming('全国基础教育年会','会议时间：2027年7月1日','2026-11-27').reason,/超过/);
 assert.equal(conferenceTiming('2027年全国基础教育年会','会议时间：2027年2月1日','2026-11-27').meetingStart,'2027-02-01');
 assert.match(conferenceTiming('基础教育论坛','会议时间：2027年3月1日','2026-08-31').reason,/超过/);
});

test('closed submissions require verified open registration and a known general education organiser',()=>{
 const body='主办单位：中国教育学会\n会议时间：2026年12月15日\n会议地点：北京\n投稿截止：2026年11月20日\n报名截止时间：2026年12月1日';
 assert.match(originalAssess('全国基础教育高峰论坛',body,'2026-11-27',topics).reason,/仅参会/);
 assert.equal(originalAssess('全国基础教育高峰论坛',body.replace('报名截止时间：2026年12月1日',''),'2026-11-27',topics).reason,'已截稿');
 assert.match(originalAssess('全国基础教育高峰论坛',body.replace('2026年12月1日','2026年11月25日'),'2026-11-27',topics).reason,/报名已经截止/);
 assert.match(originalAssess('全国基础教育高峰论坛',body.replace('北京','英国伦敦'),'2026-11-27',topics).reason,/境外/);
});
test('ambiguous deadlines and overseas locations are withheld',()=>{
  assert.match(assess(title,'农村教育 投稿截止：12月1日 地点：北京','2026-11-17',topics).reason,/未能确认/);
  assert.match(assess(title,'农村教育\n投稿截止：2026年12月1日\n会议地点：美国纽约','2026-11-17',topics).reason,/境外/);
  assert.match(assess(title,'农村教育\n投稿截止：2026年12月1日','2026-11-17',topics).reason,/国内/);
});
test('submission phrasing and date validity',()=>{
  assert.equal(assess(title,'农村教育\n请于2026年12月1日前提交论文\n地点：杭州','2026-11-17',topics).deadline,'2026-12-01');
  assert.match(assess(title,'农村教育\n投稿截止：2027年2月30日\n地点：杭州','2026-11-17',topics).reason,/未能确认/);
  assert.equal(assess('农村教育学术研讨会成功举办','投稿截止：2027年12月1日','2026-11-17',topics).reason,'不是会议征稿通知');
});
test('same-host links and visible article text',()=>{
  const html='<a href="/a.htm" title="农村教育研讨会征稿通知">更多</a><a href="https://other.test/x">农村教育研讨会征稿通知</a>';
  assert.deepEqual(links(html,'https://example.test/').map(x=>x.url),['https://example.test/a.htm']);
  assert.equal(articleText('<div class="wp_articlecontent"><p>教育公平</p><script>bad</script><p>征稿</p></div>版权所有 X'),'教育公平\n征稿');
});
test('daily boundary uses China time',()=>{
  assert.equal(dayCN(new Date('2026-11-17T16:01:00Z')),'2026-11-18');
});
test('priority topics rank general education meetings without excluding them',()=>{
 const r=assess('长三角教育一体化发展高峰论坛','主办单位：安徽师范大学\n会议征稿\n投稿截止：2026年12月1日\n会议地点：安徽师范大学','2026-11-19',topics);
 assert.equal(r.deadline,'2026-12-01');assert.equal(r.score,1);
 const a=assess('县域公共教育服务学术论坛','欢迎提交参会论文\n请拟参会代表于2026年12月1日前提交参会回执、论文题目及300字摘要\n会议地点：安徽芜湖','2026-11-19',topics);
 assert.equal(a.deadline,'2026-12-01');
});
