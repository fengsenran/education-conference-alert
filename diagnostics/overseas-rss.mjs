import fs from 'node:fs/promises';
import {parseFeed,recent,newReport,htmlPaper,parseCnaes,selectPapers} from '../research.mjs';
import {collectJournal} from '../journal-monitor.mjs';
const cfg=JSON.parse(await fs.readFile('research-config.json','utf8'));
const rows=[],report=newReport('2026-11-27',cfg);
await fs.mkdir('reports/overseas-rss',{recursive:true});
for(let at=0;at<cfg.chineseJournals.length;at+=3)await Promise.all(cfg.chineseJournals.slice(at,at+3).map(async j=>{
 const url='https://oversea.cnki.net/knavi/rss/'+j.code.toUpperCase()+'?language=CHS';
 try {
  const r=await fetch(url,{signal:AbortSignal.timeout(18000)});if(!r.ok)throw new Error('HTTP '+r.status);
  const h=await r.text();await fs.writeFile('reports/overseas-rss/'+j.code+'.xml',h);
  const name=h.match(/<channel>\s*<title>([\s\S]*?)<\/title>/i)?.[1];
  const items=parseFeed(h);
  const normalized=s=>String(s).replace(/-CNKI$/i,'').replace(/[\s\p{P}]/gu,'');
  const valid=normalized(name)===normalized(j.name);
  const dates=items.map(p=>p.rawDate?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(p.rawDate)):p.date).filter(Boolean).sort();
  const row={journal:j.name,code:j.code,url,status:r.status,feedName:name,identity:valid,items:items.length,withAbstract:items.filter(p=>p.description).length,latest:dates.at(-1),inWindow:dates.filter(d=>recent(d,report.date,30)).length};
  rows.push(row);console.log(JSON.stringify(row));
  if(valid&&items.length)await collectJournal({...j,endpoints:[{url,adapter:'cnki-rss'}]},report,{request:async()=>h,htmlPaper,parseCnaes,parseFeed,today:report.date,recent,lookback:30});
  if(j.code.toUpperCase()==='JYYJ')console.log(JSON.stringify({sample:items.slice(0,1).map(p=>({title:p.title,date:p.rawDate,url:p.url,abstract:p.description?.slice(0,350)}))}));
 }catch(e){const row={journal:j.name,code:j.code,error:e.message,cause:e.cause?.code};rows.push(row);console.log(JSON.stringify(row));}
}));
const diagnostics={};const selected=selectPapers(report.papers,report.date,{}, {lookbackDays:30,diagnostics});
await fs.writeFile('reports/overseas-rss/audit.json',JSON.stringify(rows,null,2));
await fs.writeFile('reports/overseas-rss/collection.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({total:rows.length,verified:rows.filter(r=>r.identity&&r.items).length,withWindow:rows.filter(r=>r.inWindow>0).length,abstracts:rows.reduce((n,r)=>n+(r.withAbstract||0),0),diagnostics,selected:selected.map(p=>p&&({title:p.title,journal:p.journal,date:p.date}))}));

for(const p of selected.filter(Boolean)){try{const r=await fetch(p.url,{signal:AbortSignal.timeout(14000)});const h=await r.text();const meta=htmlPaper(h,{name:p.journal},p.url);await fs.writeFile('reports/overseas-rss/selected-detail.html',h);console.log(JSON.stringify({detailProbe:{title:p.title,url:p.url,status:r.status,final:r.url,htmlTitle:h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],parsed:meta&&{title:meta.title,date:meta.date,abstractLength:meta.abstract.length},sample:h.slice(0,80)}}));}catch(e){console.log(JSON.stringify({detailProbe:{title:p.title,error:e.message,cause:e.cause?.code}}));}}
