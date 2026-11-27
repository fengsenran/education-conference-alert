import {plain} from './monitor.mjs';
import {createHash} from 'node:crypto';
const normalize=s=>String(s||'').replace(/[\s\p{P}]/gu,'').toLowerCase();
export function journalIdentity(html,source) {
 const title=plain(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'');
 const aliases=[source.name,...(source.aliases||[])].map(normalize);
 const parts=title.split(/\s*[|_\-]\s*/).map(normalize);
 return aliases.some(n=>parts.includes(n)||normalize(title)===n);
}
export function paperLinks(html,base) {
 const out=new Map();
 for(const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
  const href=m[1].match(/href\s*=\s*["']([^"']+)["']/i)?.[1];if(!href)continue;
  try{const u=new URL(href.replace(/&amp;/g,'&'),base);u.hash='';
   if(u.host!==new URL(base).host||!/(?:\/client\/paper\/(?!preview)|\/CN\/(?:abstract|10\.|Y)|\/article\/|darticle\.aspx|article-details|articleDetail|\/EN\/10\.)/i.test(u.href))continue;
   const title=plain(m[1].match(/title=["']([^"']*)/i)?.[1]||m[2]);if(title.length>5&&!/^(?:PDF|HTML|摘要|全文|下载|阅读)/i.test(title))out.set(u.href,{url:u.href,title});
  }catch{}
 }
 return [...out.values()];
}
export async function collectJournal(source,report,{request,htmlPaper,parseCnaes,parseFeed,today,recent,lookback}) {
 const audit={name:source.name,index:source.index,attempts:[],parsed:0,dated:0,inWindow:0,state:'unavailable'};
 report.journalCoverage.push(audit);
 const candidates=[];let identity=false;const covered=new Set();
 for(const endpoint of source.endpoints) {
  try{
   const html=await request(endpoint.url);
   if(endpoint.adapter==='cnki-rss') {
    const channel=plain(html.match(/<channel>\s*<title>([\s\S]*?)<\/title>/i)?.[1]||'').replace(/-CNKI$/i,'');
    if(normalize(channel)!==normalize(source.name))throw new Error('RSS刊名与目标期刊不一致');
    const items=parseFeed(html);if(!items.length)throw new Error('RSS没有可解析的题录');
    const feedPapers=items.map(p=>({title:p.title,abstract:p.description,authors:p.authors,date:p.date&&p.rawDate?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(p.rawDate)):null,
     journal:source.name,weight:source.weight,language:'zh',id:'cnki-rss:'+createHash('sha256').update(source.name+'|'+normalize(p.title)).digest('hex'),url:p.url,publicationVerification:'catalogue',dateBasis:'知网期刊RSS条目pubDate（北京时间）；未采用频道更新时间，首次网络首发时间尚未逐篇核验'}));
    report.papers.push(...feedPapers);identity=true;
    const latest=feedPapers.map(p=>p.date).filter(Boolean).sort().at(-1)||null;
    audit.rss={url:endpoint.url,items:items.length,latest,latestWithinWindow:recent(latest,today,lookback),limitedToLatestItems:items.length>=20};
    audit.attempts.push({url:endpoint.url,status:'read',directoryItems:items.length});
    // RSS offers only a latest-item feed, not a complete 30-day/online-first archive.
    continue;
   }
   const verified=endpoint.adapter==='cnaes'||journalIdentity(html,source);
   if(!verified)throw new Error('页面刊名与目标期刊不一致或无法核验');
   identity=true;let papers=[];
   if(endpoint.adapter==='cnaes')papers=parseCnaes(html,source);
   else {
    const links=paperLinks(html,endpoint.url);
    if(!links.length)throw new Error('期刊身份已核验，但未能解析文章目录');
    for(const p of links)candidates.push({...p,endpoint:endpoint.url});
   }
   for(const p of papers)report.papers.push(p);
   audit.attempts.push({url:endpoint.url,status:'read',directoryItems:papers.length||paperLinks(html,endpoint.url).length});
   covered.add(endpoint.role||'current');
   if(/paperNav_network/.test(html)&&/paperZone3/.test(html))covered.add('online-first');
  }catch(e){audit.attempts.push({url:endpoint.url,status:'failed',error:e.message});}
 }
 const unique=[...new Map(candidates.map(p=>[p.url,p])).values()];
 const max=source.maxArticles??80;
 audit.truncated=unique.length>max;
 for(let i=0;i<Math.min(unique.length,max);i+=3)await Promise.all(unique.slice(i,Math.min(i+3,max)).map(async link=>{
  try{const html=await request(link.url);const p=htmlPaper(html,source,link.url);if(!p)throw new Error('缺少文章题目');
   // Publisher article pages can use the article title; directory identity was checked above.
   if(!identity)throw new Error('目录刊名未经核验');
   if(normalize(p.title)!==normalize(link.title))throw new Error('文章题目与已核验目录不一致，暂不采纳');
   report.papers.push(p);
  }catch(e){audit.articleFailures??=[];audit.articleFailures.push({url:link.url,error:e.message});}
 }));
 const parsed=report.papers.filter(p=>p.journal===source.name);
 audit.parsed=parsed.length;audit.dated=parsed.filter(p=>p.date).length;
 audit.inWindow=parsed.filter(p=>recent(p.date,today,lookback)).length;
 audit.latestPublication=parsed.map(p=>p.date).filter(Boolean).sort().at(-1)||null;
 audit.currentIssueRead=covered.has('current');audit.onlineFirstRead=covered.has('online-first');
 if(parsed.length)audit.state=audit.truncated||audit.articleFailures?.length||!audit.onlineFirstRead||audit.dated<audit.parsed?'partial':'read';
 if(!parsed.length)throw new Error('该刊本轮未取得可解析题录；详见逐刊覆盖报告');
 return parsed.length;
}
