import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {journalIdentity,paperLinks,collectJournal} from './journal-monitor.mjs';
import {htmlPaper,parseCnaes,parseFeed,newReport,recent} from './research.mjs';
test('all 61 promised journals have separate monitoring records and a strict 30-day window',async()=>{
 const cfg=JSON.parse(await readFile(new URL('./research-config.json',import.meta.url),'utf8'));
 const registry=JSON.parse(await readFile(new URL('./journal-registry.json',import.meta.url),'utf8'));
 assert.equal(cfg.lookbackDays,30);assert.equal(cfg.policyLookbackDays,30);
 assert.equal(cfg.chineseJournals.length,61);assert.equal(new Set(cfg.chineseJournals.map(j=>j.name)).size,61);
 assert.deepEqual(new Set(cfg.chineseJournals.map(j=>j.name)),new Set(registry.map(j=>j.name)));
 assert.equal(new Set(cfg.policySources.map(j=>j.name)).size,cfg.policySources.length);
 assert.ok(cfg.policySources.length>=50);
});
test('similar journal names, malformed publisher links and other hosts are not substituted',()=>{
 assert.equal(journalIdentity('<title>教育科学研究</title>',{name:'教育科学'}),false);
 assert.equal(journalIdentity('<title>华东师范大学学报(教育科学版) - 首页</title>',{name:'华东师范大学学报（教育科学版）'}),true);
 assert.deepEqual(paperLinks('<a href="https://other.test/client/paper/abc">农村学校布局研究</a>','https://example.test/'),[]);
});
test('a directory read cannot hide article failures or missing online-first access',async()=>{
 const cfg={lookbackDays:30,policyLookbackDays:30};const report=newReport('2026-11-27',cfg);
 const source={name:'测试期刊',index:'CSSCI来源',endpoints:[{url:'https://example.test/index',role:'current'}]};
 const index='<title>测试期刊</title><a href="/client/paper/a">人口变化与农村学校布局</a><a href="/client/paper/b">农村义务教育资源配置</a>';
 const article='<title>测试期刊</title><meta name="citation_title" content="人口变化与农村学校布局"><meta name="citation_online_date" content="2026-11-20">';
 const request=async url=>{if(url.endsWith('index'))return index;if(url.endsWith('/a'))return article;throw new Error('HTTP 403');};
 await collectJournal(source,report,{request,htmlPaper,parseCnaes,today:report.date,recent,lookback:30});
 assert.equal(report.journalCoverage[0].state,'partial');assert.equal(report.journalCoverage[0].inWindow,1);assert.equal(report.journalCoverage[0].articleFailures.length,1);
});
test('CNKI dates use publication labels and never site upload or modification timestamps',()=>{
 const source={name:'测试期刊'};
 const h='<h1>人口变化与农村学校布局</h1><p>摘要(Abstract)：研究义务教育资源配置。关键词：农村</p><p>发布时间：2026-11-26</p><p>出版时间：2026-11-01</p><p>网络发布时间：2026-10-20</p>';
 const p=htmlPaper(h,source,'https://example.test/a');assert.equal(p.date,'2026-10-20');assert.equal(p.abstract,'研究义务教育资源配置。');
 assert.equal(htmlPaper(h.replace(/出版时间：2026-11-01|网络发布时间：2026-10-20/g,''),source,'https://example.test/a').date,null);
});

test('CNKI RSS identity, Chinese calendar dates, stable IDs and feed limits are explicit',async()=>{
 const report=newReport('2026-11-27',{lookbackDays:30});
 const source={name:'测试期刊',endpoints:[{url:'https://navi.cnki.net/knavi/rss/TEST',adapter:'cnki-rss'}]};
 const feed='<rss><channel><title>测试期刊-CNKI</title><pubDate>27 Nov 2026 00:00:00 GMT</pubDate><item><title>人口变化与乡村学校资源配置</title><link>https://kns.cnki.net/a?v=token1</link><description>县域义务教育资源配置</description><pubDate>Tue, 17 Nov 2026 16:00:00 GMT</pubDate><author>作者甲</author></item></channel></rss>';
 await collectJournal(source,report,{request:async()=>feed,htmlPaper,parseCnaes,parseFeed,today:report.date,recent,lookback:30});
 assert.equal(report.papers[0].date,'2026-11-18');assert.equal(report.papers[0].authors,'作者甲');assert.equal(report.papers[0].publicationVerification,'catalogue');assert.equal(report.journalCoverage[0].state,'partial');
 const again=newReport(report.date,{lookbackDays:30});await collectJournal(source,again,{request:async()=>feed.replace('token1','token2'),htmlPaper,parseCnaes,parseFeed,today:report.date,recent,lookback:30});assert.equal(again.papers[0].id,report.papers[0].id);
});

import {requestPublicRss,publicIPv4} from './public-rss-fetch.mjs';
test('RSS DNS fallback retains the original HTTPS hostname and excludes private addresses',async()=>{
 let called=0;const url='https://navi.cnki.net/knavi/rss/JYYJ';const request=async()=>{throw new Error('fetch failed | ENOTFOUND');};
 assert.equal(await requestPublicRss(url,{request,resolve:async host=>{assert.equal(host,'navi.cnki.net');return '121.194.4.8';},transport:async (target,address)=>{called++;assert.equal(target,url);assert.equal(address,'121.194.4.8');return '<rss />';}}),'<rss />');
 assert.equal(called,1);for(const address of ['127.0.0.1','10.0.0.2','169.254.1.1','192.168.2.1','::1'])assert.equal(publicIPv4(address),false);
 await assert.rejects(requestPublicRss(url,{request,resolve:async()=>'127.0.0.1'}),/公网/);
 await assert.rejects(requestPublicRss('https://other.test/knavi/rss/JYYJ',{request}),/公开/);
});
test('RSS DNS fallback never retries a certificate error, CAPTCHA, or HTTP access rejection',async()=>{
 for(const message of ['HTTP 403','页面要求登录或验证','UNABLE_TO_VERIFY_LEAF_SIGNATURE'])await assert.rejects(requestPublicRss('https://navi.cnki.net/knavi/rss/JYYJ',{request:async()=>{throw new Error(message);},resolve:async()=>{throw new Error('must not resolve');}}),e=>e.message===message);
});

test('an unavailable overseas DNS route can use only the previously verified fixed-host address',async()=>{
 const xml=await requestPublicRss('https://navi.cnki.net/knavi/rss/JYYJ',{request:async()=>{throw new Error('ENOTFOUND');},resolve:async()=>{throw new Error('NXDOMAIN');},transport:async(url,address)=>{assert.equal(new URL(url).hostname,'navi.cnki.net');assert.equal(address,'121.194.4.8');return '<rss />';}});assert.equal(xml,'<rss />');
});
