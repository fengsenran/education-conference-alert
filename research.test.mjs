import test from 'node:test';
import assert from 'node:assert/strict';
import {due,exactDate,recent,crossrefDate,relevance,parseCnaes,htmlPaper,policyDate,policyKind,selectPapers,basicEducationFit} from './research.mjs';
test('every other day is continuous across months and leap days',()=>{
 assert.equal(due('2026-12-02','2026-11-18'),true);
 assert.equal(due('2026-12-01','2026-11-18',2),false);
 assert.equal(due('2026-11-19','2026-11-18'),true);
 assert.equal(due('2026-11-17','2026-11-18'),false);
 assert.equal(due('2028-03-01','2028-02-28'),true);
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
