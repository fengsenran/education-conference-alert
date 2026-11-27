import test from 'node:test';
import assert from 'node:assert/strict';
import {due,exactDate,recent,crossrefDate,relevance,parseCnaes,htmlPaper,policyDate,policyKind,selectPapers,basicEducationFit,mergePaperCache,policyNewsKind,policyInspiration,parseFeed,combineReports,newReport} from './research.mjs';

test('verified cache survives a source outage but never refreshes publication dates or sent status',()=>{
 const p={id:'p',language:'en',title:'Rural school funding',abstract:'Rural school funding formulas for primary education',date:'2026-11-12',fetchedAt:'2026-11-26'};
 const kept=mergePaperCache([], [p,{...p,id:'expired',date:'2025-09-12'},{...p,id:'uncertain',date:'2026-09'}], '2026-11-27');
 assert.equal(kept.length,1);assert.equal(kept[0].date,'2026-11-12');assert.equal(kept[0].fetchedAt,'2026-11-26');assert.equal(kept[0].fromCache,true);
 assert.equal(selectPapers(kept,'2026-11-27',{p:true},{lookbackDays:30})[1],null);
 assert.equal(mergePaperCache([{...p,date:null}], [p], '2026-11-27').length,0);
 assert.equal(mergePaperCache([{...p}], [p], '2026-11-27')[0].fromCache,false);
});
test('every other day is continuous across months and leap days',()=>{
 assert.equal(due('2026-12-02','2026-11-18'),true);
 assert.equal(due('2026-12-01','2026-11-18',2),false);
 assert.equal(due('2026-11-19','2026-11-18'),true);
 assert.equal(due('2026-11-17','2026-11-18'),false);
 assert.equal(due('2028-03-01','2028-02-28'),true);
});
test('a 30-day window excludes older papers and prioritises a qualifying seven-day paper',()=>{
 const base={weight:5,language:'en',journal:'Journal',abstract:'primary school funding formulas in rural districts'};
 const items=[{...base,id:'old',title:'Rural school funding and demographic change',date:'2026-11-01'},
 {...base,id:'new',title:'Rural school funding',date:'2026-11-25'},
 {...base,id:'outside',title:'Rural school funding',date:'2026-10-28'}];
 const diagnostics={};
 assert.equal(selectPapers(items,'2026-11-27',{}, {lookbackDays:30,diagnostics})[1].id,'new');
 assert.equal(selectPapers(items,'2026-11-27',{new:true},{lookbackDays:30})[1].readingBand,'近30天论文');
 assert.equal(diagnostics.outsideWindow,1);
});

test('policy execution, interpretation, evidence and disputes are retained with distinct labels',()=>{
 assert.match(policyNewsKind('宁夏推进基础教育优化布局'),/执行/);
 assert.match(policyNewsKind('学校撤并政策引发家长争议'),/争议/);
 assert.match(policyNewsKind('解读基础教育经费保障政策'),/解读/);
 assert.match(policyNewsKind('县域师资配置政策效果评估'),/评估/);
 assert.match(policyNewsKind('关于印发义务教育经费管理办法的通知'),/正式/);
 assert.equal(policyNewsKind('中小学教师招聘公告'),null);
 assert.match(policyInspiration({title:'农村学校布局调整'}),/可及性/);
});

test('RSS publication dates never fall back to updated dates and malformed links stay untrusted',()=>{
 const p=parseFeed('<rss><item><title><![CDATA[农村学校布局调整]]></title><link>https://example.org/a?x=1&amp;y=2</link><pubDate>Fri, 27 Nov 2026 01:00:00 GMT</pubDate><description><![CDATA[<p>义务教育服务供给</p>]]></description></item></rss>')[0];
 assert.equal(p.date,'2026-11-27');assert.equal(p.url,'https://example.org/a?x=1&y=2');assert.equal(p.description,'义务教育服务供给');
 assert.equal(parseFeed('<feed><entry><title>Rural schools</title><updated>2026-11-27</updated></entry></feed>')[0].date,null);
});

test('a missing or stale collection shard cannot masquerade as completed coverage',()=>{
 const cfg={lookbackDays:30,policyLookbackDays:30,chineseJournals:[{name:'甲刊'}],englishJournals:[],policySources:[]};
 const r=newReport('2026-11-27',cfg);assert.throws(()=>combineReports([r],'2026-11-27',cfg),/分片缺失/);
 r.errors.push({source:'甲刊',error:'HTTP 403'});assert.equal(combineReports([r],'2026-11-27',cfg).errors.length,1);
 assert.throws(()=>combineReports([r],'2026-11-28',cfg),/不一致/);
});
test('publication window uses exact dates and excludes future and month-only dates',()=>{
 assert.equal(exactDate('2026-11'),null);assert.equal(exactDate([2026,11]),null);
 assert.equal(exactDate('2026年11月17日'),'2026-11-17');assert.equal(exactDate('2026-02-30'),null);
 assert.equal(recent('2026-11-11','2026-11-17'),true);assert.equal(recent('2026-11-10','2026-11-17'),false);
 assert.equal(recent('2026-11-18','2026-11-17'),false);
});
test('first publication disqualifies an old article given a new print issue',()=>{
 const w={'published-online':{'date-parts':[[2026,8,1]]},'published-print':{'date-parts':[[2026,11,16]]}};
 assert.equal(crossrefDate(w),'2026-08-01');
 assert.equal(crossrefDate({'published-online':{'date-parts':[[2026,11,16]]},'published-print':{'date-parts':[[2025,4]]}}),null);
 assert.equal(crossrefDate({created:{'date-time':'2026-11-17'},indexed:{'date-time':'2026-11-17'}}),null);
});
test('education population relevance excludes rural health and broad demography alone',()=>{
 assert.equal(relevance('Rural health and declining population').score,0);
 assert.ok(relevance('School closures and declining enrolment in rural communities').topics.includes('教育人口'));
 assert.ok(relevance('县域学龄人口变化与学校布局').topics.includes('教育人口'));
 assert.ok(relevance('Leading Inclusive Schools for Students with Disabilities').topics.includes('教育公平'));
});
test('Chinese publisher modified timestamps are not publication dates',()=>{
 const o={id:1,title:'农村教育治理',issue_at:'2026-10-28 00:00:00',updated_at:'2026-11-17',authors:[]};
 const html=`<div onclick="toJournal('${JSON.stringify(o).replaceAll('"','&quot;')}')"></div>`;
 assert.equal(parseCnaes(html,{name:'教育研究',url:'https://jyyj.cnaes.edu.cn/',weight:5})[0].date,'2026-10-28');
 assert.equal(htmlPaper('<meta name="citation_title" content="农村教育"><meta name="citation_publication_date" content="2026-11">',{name:'期刊'},'https://example.org').date,null);
 assert.equal(htmlPaper('<body><h1>农村教育政策</h1><dt>出版日期:</dt><dd>2026-11-15</dd><dt>摘要:</dt><dd>城乡均衡发展研究</dd>Abstract: text</body>',{name:'期刊'},'https://example.org').date,'2026-11-15');
});
test('policy publication date is distinct from effective and modified dates',()=>{
 const html='<meta name="PubDate" content="2026-11-15"><meta property="article:modified_time" content="2026-11-17"><p>实施日期：2027-01-01</p>';
 assert.equal(policyDate(html),'2026-11-15');
 assert.equal(policyDate('<p>成文日期：2026-11-15</p><p>实施日期：2026-11-17</p>'),null);
 assert.match(policyKind('教育公平政策征求意见稿',''),/尚非/);
 assert.equal(policyKind('教育部负责人就教育公平政策答记者问',''),null);
});
test('ranking picks at most one per language, de-duplicates, excludes corrections and sent papers',()=>{
 const base={date:'2026-11-17',weight:5,abstract:'',language:'en',journal:'Journal'};
 const items=[{...base,id:'a',title:'Rural education policy and school funding'}, {...base,id:'a',title:'Rural education policy and school funding'},
 {...base,id:'b',title:'Corrigendum to rural education policy'}, {...base,id:'c',title:'Rural education policy',date:'2026-10-01'},
 {...base,id:'z',title:'农村学校教育治理',language:'zh'}];
 assert.deepEqual(selectPapers(items,'2026-11-17').map(x=>x?.id),['z','a']);
 assert.equal(selectPapers(items,'2026-11-17',{a:true})[1],null);
});
test('university institutional change is excluded while basic education is prioritised',()=>{
 assert.equal(basicEducationFit('Exploring Perceptions of Organizational Change Processes in Becoming a Hispanic-Serving Institution (HSI)','education equity and disadvantaged students').eligible,false);
 assert.equal(basicEducationFit('高校机构建设与教育公平','乡村大学与高等教育治理').eligible,false);
 assert.equal(basicEducationFit('学龄人口减少与县域义务教育学校布局').eligible,true);
 assert.equal(basicEducationFit('School funding and inequality','primary schools in rural districts').eligible,true);
 const base={date:'2026-11-19',weight:5,language:'en',journal:'AERJ',abstract:'education equity'};
 assert.equal(selectPapers([{...base,id:'hsi',title:'Exploring Perceptions of Organizational Change Processes in Becoming a Hispanic-Serving Institution (HSI)'}],'2026-11-19')[1],null);
});
