import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {dayCN,plain,articleText,push} from './monitor.mjs';
import {researchFit} from './research-profile.mjs';
import {collectJournal} from './journal-monitor.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
export const shift=(s,n)=>new Date(Date.parse(s+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export function due(today,anchor,intervalDays=1) {const d=(Date.parse(today)-Date.parse(anchor))/86400000;return Number.isInteger(intervalDays)&&intervalDays>0&&d>=0&&d%intervalDays===0;}
export function exactDate(value) {
  if(Array.isArray(value)) {if(value.length<3)return null;value=value.join('-');}
  const m=String(value??'').match(/^(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})(?:日|\b|T)/);
  if(!m)return null;
  const s=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  const d=new Date(s+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s?s:null;
}
export function recent(s,today,days=7) {return !!s&&s>=shift(today,1-days)&&s<=today;}
export function crossrefDate(w) {
  const online=w['published-online']?.['date-parts']?.[0];
  const print=w['published-print']?.['date-parts']?.[0];
  // A known earlier year/month is enough to disqualify a newly reissued old article.
  const dates=[online,print,w.published?.['date-parts']?.[0]].map(exactDate).filter(Boolean).sort();
  if(!dates.length)return null;
  const first=dates[0];
  for(const parts of [online,print]) if(parts?.length && parts.length<3) {
    const prefix=parts.map((x,i)=>i?String(x).padStart(2,'0'):x).join('-');
    if(prefix<first.slice(0,prefix.length))return null;
  }
  return first;
}
const groups=[
 ['农村教育',/农村|乡村|rural|remote communit|village school/i],
 ['教育人口',/学龄人口|教育人口|人口变化|少子化|人口流动|出生率|人口预测|人口减少|生源|demograph|fertility|birth rate|population decline|pupil projection|enrol[l]?ment|school closure|school consolidation|migration|migrant/i],
 ['教育政策',/教育政策|教育财政|教育治理|教育资源|学校布局|教育管理体制|教育改革|(?:教育|学校|教师|学生|招生)[^。；]{0,24}(?:政策|规划|方案|办法|计划|意见|通知)|education(?:al)? polic|school polic|school fund|education(?:al)? financ|school financ|school reform|education(?:al)? reform|school choice|education(?:al)? govern|student financ|school admission/i],
 ['教育公平',/教育公平|教育均衡|优质均衡|教育不平等|机会公平|入学机会|受教育机会|随迁子女|留守儿童|融合教育|特殊教育|学生资助|助学|education(?:al)? inequal|education(?:al)? equit|education(?:al)? equal|school segregation|achievement gap|education(?:al)? opportunit|disadvantaged|socioeconomic gap|social stratification|inclusive school|inclusive educat|special education|student financial aid|free school meals|inequali|inequity|equitable/i]
];
export function relevance(title,abstract='') {
  if(!/教育|学校|学生|学龄|师资|教师|school|educat|student|pupil|teacher|learning|enrol[l]?ment/i.test(title+' '+abstract))return {topics:[],score:0};
  const topics=groups.filter(([,re])=>re.test(title+' '+abstract)).map(([n])=>n);
  const score=groups.reduce((s,[,re])=>s+(re.test(title)?8:re.test(abstract)?2:0),0);
  return {topics,score};
}
const excluded=/^(?:editorial|introduction|book review|reviewer acknowledgment|acknowledgment|correction|corrigendum|erratum|retraction|call for papers)|^编者|^目录|^征稿|^更正|^勘误/i;
export function basicEducationFit(title,abstract='') {
  const basic=/基础教育|义务教育|学前教育|中小学|小学|初中|高中|幼儿园|学龄|县中|农村学校|乡村学校|\bK[–−-]?12\b|\bpre[–-]?K\b|primary (?:school|education|pupil)|secondary (?:school|education)|elementary|middle school|high school|preschool|kindergarten|compulsory education|school[ -]age|school district|pupil/i;
  const higher=/高等教育|高校|大学|高职|本科|研究生|higher education|universit|\bcollege\b|\bcolleges\b|postsecondary|post-secondary|tertiary|hispanic.serving institution|\bHSI\b|campus/i;
  const school=/农村教育|乡村教育|学校布局|学校撤并|school funding|school financ|school choice|school admission|rural school|school segregation|inclusive school|school closure|school consolidation/i;
  if(higher.test(title)&&!basic.test(title))return {eligible:false,reason:'研究对象为高等教育或高校机构'};
  if(basic.test(title))return {eligible:true,level:'明确涉及基础教育',bonus:30};
  if(basic.test(abstract)&&!higher.test(title))return {eligible:true,level:'摘要明确涉及基础教育',bonus:20};
  if(school.test(title)&&!higher.test(title+' '+abstract))return {eligible:true,level:'学校教育议题，学段须复核',bonus:10};
  return {eligible:false,reason:'无法确认与基础教育的直接关系'};
}
function rationale(p) {
  const methods=/difference.in.differences|regression discontinuity|randomi[sz]ed|natural experiment|instrumental variable|双重差分|断点回归|随机试验|自然实验|工具变量/i.test(p.abstract);
  return `对应你的研究问题：${p.researchReason}。学段判断：${p.level}。${methods?'摘要包含因果识别方法线索，可进一步核查研究设计。':''}依据为题目${p.abstract?'和摘要':'，未获取摘要'}，并非全文学术质量评审。`;
}
export async function request(url,json=false) {
  let r;
  for(let n=0;n<2;n++) {
    try { r=await fetch(url,{signal:AbortSignal.timeout(16000),headers:{'User-Agent':'EducationReadingMonitor/2.0 (public metadata and education news; daily)','Accept':'text/html,application/json,application/rss+xml,application/xml'}}); }
    catch(e) { throw new Error([e.message,e.cause?.code,e.cause?.message].filter(Boolean).join(' | ')); }
    if(![429,500,502,503,504].includes(r.status)||n===1)break;
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  if(!r.ok)throw new Error(`HTTP ${r.status}`);
  if(/login|wvpn|captcha/i.test(r.url)&&!r.url.includes('api.crossref'))throw new Error('页面要求登录或验证');
  const buf=new Uint8Array(await r.arrayBuffer());if(buf.length>6000000)throw new Error('响应超过6MB');
  const hint=r.headers.get('content-type')+' '+new TextDecoder().decode(buf.slice(0,1500));
  const body=new TextDecoder(/gb2312|gbk|gb18030/i.test(hint)?'gb18030':'utf-8').decode(buf);
  if(!json && body.length<500)throw new Error('页面内容不足或要求跳转');
  return json?JSON.parse(body):body;
}
function attrs(s) {return Object.fromEntries([...s.matchAll(/([\w:.-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map(m=>[m[1].toLowerCase(),plain(m[3])]));}
export function metas(html) {
  const m={};for(const tag of html.matchAll(/<meta\b[^>]*>/gi)) {const a=attrs(tag[0]);const k=(a.name||a.property||'').toLowerCase();if(k&&a.content)(m[k]??=[]).push(a.content);}return m;
}
function anchors(html,base,pattern) {
  const out=new Map();
  for(const a of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const v=attrs(a[1]);if(!v.href)continue;
    try {const u=new URL(v.href,base);u.hash='';
      if(!/^https?:$/.test(u.protocol)||u.hostname!==new URL(base).hostname||!new RegExp(pattern).test(u.pathname))continue;
      const title=(v.title||plain(a[2])).trim();if(title.length>6&&!out.has(u.href))out.set(u.href,{url:u.href,title});
    }catch{}
  }return [...out.values()];
}
export function parseCnaes(html,source) {
  const items=[];
  for(const m of html.matchAll(/toJournal\('([^']+)'\)/g)) {
    try {const o=JSON.parse(plain(m[1]));
      const dates=[o.issue_at,o.publish_at].map(exactDate).filter(Boolean).sort();
      items.push({title:o.title,abstract:plain(o.summary||o.content||''),date:dates[0]||null,authors:(o.authors||[]).map(a=>a.name).join('、'),journal:source.name,
        weight:source.weight,language:'zh',id:`cnaes:${o.id}`,doi:o.DOI||'',url:o.out_link||source.url,dateBasis:'期刊官网 issue_at/publish_at（不采用 updated_at）'});
    }catch{}
  }return [...new Map(items.map(i=>[i.id,i])).values()];
}
export function htmlPaper(html,source,url) {
  const m=metas(html),one=k=>m[k]?.[0];
  const body=plain(html.replace(/^[\s\S]*?<body\b[^>]*>/i,''));
  const title=one('citation_title')||one('dc.title')||plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
  if(!title)return null;
  const raw=[...(m.citation_online_date||[]),...(m.citation_publication_date||[]),...(m['dc.date.issued']||[])];
  for(const d of body.matchAll(/(?:出版日期|在线出版日期|网络出版日期)\s*[:：]\s*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2})/g))raw.push(d[1]);
  for(const d of body.matchAll(/(?:网络发布时间|出版时间)\s*[:：]\s*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2})/g))raw.push(d[1]);
  const date=raw.map(exactDate).filter(Boolean).sort()[0]||null;
  const fallbackAbstract=body.match(/(?:摘要(?:\s*\(Abstract\))?)\s*[:：]\s*([\s\S]*?)(?:Abstract\s*[:：]|关键词|参考文献|相似文献|基金项目|$)/)?.[1]?.trim()||'';
  const description=one('dc.description')||one('description')||'';
  const doi=one('citation_doi')||body.match(/DOI\s*[:：]\s*(10\.\d{4,9}\/[^\s]+)/i)?.[1]||'';
  return {title,abstract:fallbackAbstract||(/采编系统|稿件管理/.test(description)?'':description),authors:(m.citation_author||m['dc.creator']||[]).join('、')||body.match(/作者\s*[:：]\s*([^\n]+)/)?.[1]||'',date,
    journal:source.name,weight:source.weight,language:'zh',doi,id:doi.toLowerCase()||url,url,dateBasis:'期刊官网文章出版/在线发表元数据'};
}
async function english(source,today,report,lookbackDays=7) {
  const url=new URL(`https://api.crossref.org/journals/${source.issn}/works`);
  url.searchParams.set('filter',`type:journal-article,from-pub-date:${shift(today,1-lookbackDays)},until-pub-date:${today}`);
  url.searchParams.set('rows','1000');
  url.searchParams.set('select','DOI,title,container-title,author,abstract,published,published-online,published-print,ISSN,type');
  const data=await request(url.href,true);
  const records=data.message.items;
  if(data.message['total-results']>records.length)report.warnings.push({source:source.name,reason:'接口返回上限导致部分记录未读取'});
  for(const w of records) {
    const title=plain(w.title?.[0]||'');
    // Reject non-English and non-research material even if tagged journal-article.
    if(!title || /[\u3400-\u9fff]/.test(title) || (w.language&&!/^en(?:-|$)/i.test(w.language)) || excluded.test(title))continue;
    const journalTitle=(w['container-title']||[]).join(' ');
    const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
    if(!journalTitle || !(w.ISSN||[]).includes(source.issn) || !norm(journalTitle).includes(norm(source.name)))continue;
    report.papers.push({title,abstract:plain(w.abstract||''),authors:(w.author||[]).map(a=>[a.given,a.family].filter(Boolean).join(' ')).slice(0,6).join('; '),
      date:crossrefDate(w),journal:journalTitle,weight:source.weight,language:'en',doi:w.DOI,id:w.DOI,url:`https://doi.org/${w.DOI}`,dateBasis:'出版社提交到Crossref的首次发表日期'});
  }
  return records.length;
}
async function chinese(source,report) {
  if(source.endpoints)return collectJournal(source,report,{request,htmlPaper,parseCnaes,parseFeed,today:report.date,recent,lookback:report.lookbackDays});
  const html=await request(source.url);
  if(source.adapter==='cnaes') {const items=parseCnaes(html,source);if(!items.length)throw new Error('未解析到期刊文章');report.papers.push(...items);return items.length;}
  const list=anchors(html,source.url,source.pattern).slice(0,35);
  if(!list.length)throw new Error('未解析到文章链接（可能页面结构变化）');
  let parsed=0;
  for(const link of list) {
    try {const item=htmlPaper(await request(link.url),source,link.url);if(item){report.papers.push(item);parsed++;}else report.warnings.push({source:source.name,url:link.url,reason:'缺少文章元数据'});}
    catch(e) {report.errors.push({source:source.name,url:link.url,error:e.message});}
    await new Promise(r=>setTimeout(r,180));
  }if(!parsed)throw new Error('抓取到链接但未能解析文章元数据');return parsed;
}
export function policyDate(html) {
  const m=metas(html);
  const candidates=['pubdate','publishdate','publishtime','dc.date.issued','dcterms.issued','article:published_time','date','dc.date'].flatMap(k=>m[k]||[]).map(exactDate).filter(Boolean);
  for(const tag of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {const walk=o=>{if(!o||typeof o!=='object')return;if(o.datePublished){const d=exactDate(o.datePublished);if(d)candidates.push(d);}for(const v of Object.values(o))if(typeof v==='object')walk(v);};walk(JSON.parse(tag[1]));}catch{}
  }
  const text=plain(html);
  for(const match of text.matchAll(/(?:发布日期|发布时间|Published|First published)\s*[:：]?\s*(20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}日?)/gi)){const d=exactDate(match[1]);if(d)candidates.push(d);}
  // Do not use URL dates, signature dates, effective dates, or last-modified dates.
  return candidates.sort()[0]||null;
}
export function policyKind(title,body) {
  if(/解读|答记者问|图解|研究报告|统计公报|统计报告|公示|会议|调研|讲话|会见|speech|visit|research report|statistics|award/i.test(title))return null;
  if(/征求意见|草案|consultation|draft/i.test(title))return '征求意见/草案，尚非正式实施政策';
  if(/通知|意见|办法|方案|规划|条例|决定|政策|计划|行动|批复|通告|规定|policy|policies|action plan|strategy|strategic|funding|reform|regulation|statutory|guidance|grant|investment|free school meals/i.test(title))return '正式文件/政策公告（实施状态以原文为准）';
  return null;
}
export function policyNewsKind(title,body='') {
 if(/招聘|招标|采购公告|中标|考试答案|录取名单|招生广告|award ceremony/i.test(title))return null;
 if(/关于开展.+督导评估的公告/.test(title))return null;
 if(/争议|质疑|反对|抗议|困境|冲突|争论|controvers|dispute|protest|backlash|opposition|legal challenge/i.test(title+' '+body.slice(0,1000)))return '争议/问题报道（报道中的主张需核对证据）';
 if(/评估|评价|成效|效果|调研|调查|研究报告|统计|assessment|evaluation|impact|research report|statistics/i.test(title))return '政策评估/调研资料';
 if(/解读|答记者问|图解|评论|观察|建议|analysis|opinion|explainer/i.test(title))return '解读/评论（与正式政策文件区分）';
 const formal=policyKind(title,body);
 if(formal&&/通知$|意见$|办法$|方案$|规划$|条例$|决定$|规定$|征求意见|草案|consultation|draft|statutory guidance/i.test(title))return formal;
 if(/落实|实施|推进|探索|改革|试点|调整|撤并|布局|配置|统筹|供给|学位|入学|教师|师资|教育|学校|school|education|teacher|funding|closure|admission/i.test(title))return '政策执行/相关教育新闻';
 return null;
}
export function policyBody(html) {
 const clean=html.replace(/<(?:header|nav|footer|aside)\b[^>]*>[\s\S]*?<\/(?:header|nav|footer|aside)>/gi,'');
 return articleText(clean).split(/推荐阅读|延伸阅读|相关新闻|责任编辑|相关阅读/)[0].trim();
}
export function policyInspiration(item) {
 const text=item.title+' '+(item.excerpt||'');
 if(/撤并|布局|通学|closure|consolidat|catchment/i.test(text))return '可研究学校布局调整的效率与可及性：调整依据是什么，不同地区与学生群体分别承担哪些成本？';
 if(/教师|师资|编制|teacher/i.test(text))return '可研究人口变化与师资调配的制度衔接：编制、岗位和财政责任能否随实际需求调整？';
 if(/财政|经费|投入|funding|financ/i.test(text))return '可研究财政分配规则与教育需求的适配：人口变化后哪些地区或学校获得或失去资源？';
 if(/学位|入学|随迁|admission|migration|migrant/i.test(text))return '可研究常住人口教育服务供给：入学资格、学位容量与财政保障是否同步调整？';
 return '可沿“政策目标—地方执行—资源分配—群体差异”追问，核查当地公告、数据与不同主体的意见。';
}
export function parseFeed(xml) {
 const decode=s=>plain(String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1'));
 return [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(([,kind,s])=>{
  const tag=n=>s.match(new RegExp('<'+n+'[^>]*>([\\s\\S]*?)<\\/'+n+'>','i'))?.[1]||'';
  const rawDate=decode(tag('pubDate')||tag('published'));
  const parsed=Date.parse(rawDate);
  return {title:decode(tag('title')),url:decode(tag('link'))||s.match(/<link[^>]*href=["']([^"']+)/i)?.[1]||'',rawDate,authors:decode(tag('author')||tag('dc:creator')),
   date:Number.isFinite(parsed)?new Date(parsed).toISOString().slice(0,10):null,description:decode(tag('description')||tag('summary')),dateBasis:'发布机构/媒体RSS的pubDate或published字段（不使用updated）'};
 });
}
async function policies(source,today,report) {
  const days=report.policyLookbackDays??7;
  const add=(title,body,date,url,dateBasis,extra={})=>{
   if(!recent(date,today,days))return false;
   const match=researchFit(title,body),kind=policyNewsKind(title,body);if(!match.eligible||!kind)return false;
   report.policies.push({id:url,title,date,url,source:source.name,region:source.region,kind,dateBasis,excerpt:body.replace(/\s+/g,' ').slice(0,260),...match,...extra});return true;
  };
  if(source.adapter==='rss') {
   const items=parseFeed(await request(source.url));if(!items.length)throw new Error('未解析到RSS条目');let count=0;
   for(const p of items.filter(p=>recent(p.date,today,days))) {
    let u;try{u=new URL(p.url);if(!/^https?:$/.test(u.protocol)||!(source.articleHosts||[]).some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))continue;}catch{continue;}
    if(!/教育|学校|小学|中学|高中|县中|人口|学位|入学|教师|师资|校舍|school|education|teacher|pupil|funding/i.test(p.title+' '+p.description))continue;
    let body=p.description,date=p.date,dateBasis=p.dateBasis,bodyVerified=false;
    try{const h=await request(p.url);body=policyBody(h);date=policyDate(h)||date;dateBasis=policyDate(h)?'新闻原文首次发布日期元数据':dateBasis;bodyVerified=true;}catch{}
    if(add(p.title,body,date,p.url,dateBasis,{bodyVerified,rssOnly:!bodyVerified}))count++;
   }return count;
  }
  if(source.adapter==='govuk') {
    const data=await request(source.url,true);
    let count=0;
    for(const item of data.results) {
      if(!recent(exactDate(item.public_timestamp),today,days))continue;
      const meta=await request(`https://www.gov.uk/api/content${item.link}`,true);
      const date=exactDate(meta.first_published_at);if(!recent(date,today,days))continue;
      const title=meta.title||item.title,body=plain(meta.details?.body||item.description||'');
      if(add(title,body,date,`https://www.gov.uk${item.link}`,'GOV.UK first_published_at',{bodyVerified:true}))count++;
    }return count;
  }
  const html=await request(source.url);
  const all=source.direct?[{title:source.title,url:source.url}]:anchors(html,source.url,source.pattern||'.');
  const qualified=all.filter(a=>/教育|学校|小学|中学|高中|县中|人口|学位|入学|教师|师资|校舍|school|education|teacher|pupil|funding/i.test(a.title)&&policyNewsKind(a.title,''));
  const links=qualified.slice(0,source.maxArticles??12);
  if(!all.length)throw new Error('未解析到新闻/文章链接（不能当作无相关新闻）');
  if(qualified.length>links.length)report.warnings.push({source:source.name,reason:'列表候选超过检查上限，本轮未覆盖全部条目'});
  let count=0;
  for(const link of links) {
    try {
      const page=source.direct?html:await request(link.url),date=policyDate(page);if(!recent(date,today,days))continue;
      const m=metas(page),title=m['article.title']?.[0]||m.articletitle?.[0]||m['og:title']?.[0]||m['dcterms.title']?.[0]||link.title.replace(/\s*20\d{2}-\d{2}-\d{2}\s*$/,'');
      const body=policyBody(page);if(add(title,body,date,link.url,'新闻原文首次发布日期（区别于原政策成文/实施日期）',{bodyVerified:true}))count++;
    }catch(e){report.errors.push({source:source.name,url:link.url,error:e.message});}
  }return count;
}
export function paperKey(p) {return `paper:${p.language}:${p.journal}:${p.title}`.replace(/[\s\p{P}]/gu,'').toLowerCase();}
export function selectPapers(items,today,seen={},options={}) {
  const lookback=options.lookbackDays??7;
  const counts={input:items.length,missingDate:0,outsideWindow:0,alreadySent:0,excludedType:0,offTopic:0,eligible:0};
  const unique=new Map();
  const first=new Map();for(const p of items)if(p.date&&exactDate(p.date)===p.date&&(!first.has(paperKey(p))||p.date<first.get(paperKey(p)).date||(p.date===first.get(paperKey(p)).date&&first.get(paperKey(p)).publicationVerification==='catalogue'&&p.publicationVerification!=='catalogue')))first.set(paperKey(p),p);
  for(const raw of items) {
    const key=paperKey(raw),earliest=first.get(key);
    const p=earliest&&raw.date>=earliest.date?{...raw,date:earliest.date,dateBasis:earliest.dateBasis,publicationVerification:earliest.publicationVerification}:raw;
    if(!p.date){counts.missingDate++;continue;}
    if(!recent(p.date,today,lookback)){counts.outsideWindow++;continue;}
    if(seen[p.id]||seen[key]){counts.alreadySent++;continue;}
    if(excluded.test(p.title)){counts.excludedType++;continue;}
    const research=researchFit(p.title,p.abstract);if(!research.eligible){counts.offTopic++;continue;}
    const fit=basicEducationFit(p.title,p.abstract);
    const age=Math.floor((Date.parse(today)-Date.parse(p.date))/86400000);
    const freshness=age<7?0:1;
    counts.eligible++;
    const candidate={...p,key,topics:research.topics,researchReason:research.rationale,level:fit.level||'基础教育资源与公共服务研究（对象线索已核验）',freshness,
      readingBand:p.publicationVerification==='catalogue'?(freshness===0?'最近7天期刊题录':'近30天期刊题录'):(freshness===0?'最近7天新文':'近30天论文'),rank:research.score+(fit.bonus||0)+(p.weight||0)+(p.abstract?1:0)};
    if(!unique.has(key)||candidate.rank>unique.get(key).rank)unique.set(key,candidate);
  }
  if(options.diagnostics)Object.assign(options.diagnostics,counts);
  return ['zh','en'].map(lang=>[...unique.values()].filter(p=>p.language===lang).sort((a,b)=>a.freshness-b.freshness||b.rank-a.rank||b.date.localeCompare(a.date))[0]||null);
}
export function mergePaperCache(live,cached,today,lookback=30) {
  const stored=new Map(cached.filter(p=>exactDate(p.date)===p.date&&recent(p.date,today,lookback)&&p.fetchedAt&&p.fetchedAt<=today).map(p=>[p.id,{...p,fromCache:true}]));
  for(const p of live) {
    if(!p.id)continue;
    // Freshly retrieved metadata supersedes the cache, even when its date is now invalid.
    stored.delete(p.id);
    if(exactDate(p.date)===p.date&&recent(p.date,today,lookback))stored.set(p.id,{...p,fetchedAt:today,fromCache:false});
  }
  return [...stored.values()];
}
export function newReport(today,cfg) {return {date:today,configHash:createHash('sha256').update(JSON.stringify(cfg)).digest('hex'),lookbackDays:cfg.lookbackDays,policyLookbackDays:cfg.policyLookbackDays??30,window:[shift(today,1-cfg.lookbackDays),today],sources:[],errors:[],warnings:[],papers:[],policies:[],journalCoverage:[],funnel:{}};}
export async function collectSources(cfg,today,kind='all',shard=0,shards=1) {
 const report=newReport(today,cfg);
 const jobs=[...cfg.englishJournals.map(s=>({s,kind:'en',label:'英文期刊',run:()=>english(s,today,report,cfg.lookbackDays)})),...cfg.chineseJournals.map(s=>({s,kind:'zh',label:'中文期刊',run:()=>chinese(s,report)})),...cfg.policySources.map(s=>({s,kind:'news',label:'政策与新闻',run:()=>policies(s,today,report)}))].filter(j=>kind==='all'||kind===j.kind).filter((j,i)=>i%shards===shard);
 const run=async j=>{try{const count=await j.run();report.sources.push({name:j.s.name,kind:j.label,count});}catch(e){report.errors.push({source:j.s.name,error:e.message});}console.log(JSON.stringify({source:j.s.name,kind:j.kind,finished:true}));};
 if(kind==='en'||kind==='zh')for(const j of jobs){await run(j);await new Promise(r=>setTimeout(r,600));}
 else for(let i=0;i<jobs.length;i+=3)await Promise.all(jobs.slice(i,i+3).map(run));
 return report;
}
export function combineReports(reports,today,cfg) {
 const report=newReport(today,cfg),names=new Set();
 for(const r of reports){if(r.date!==today||r.configHash!==report.configHash||r.lookbackDays!==cfg.lookbackDays||r.policyLookbackDays!==cfg.policyLookbackDays)throw new Error('分片日期、配置或筛选窗口不一致');
  for(const k of ['sources','errors','warnings','papers','policies','journalCoverage'])report[k].push(...r[k]);
  for(const row of [...r.sources,...r.errors])names.add(row.name||row.source);
 }
 const expected=[...cfg.englishJournals,...cfg.chineseJournals,...cfg.policySources].map(s=>s.name);
 const missing=expected.filter(n=>!names.has(n));if(missing.length)throw new Error('检索分片缺失，不能生成完整汇总：'+missing.join('、'));
 return report;
}
export async function main() {
  const today=dayCN(),dry=process.argv.includes('--dry-run');
  const cfg=JSON.parse(await readFile(path.join(root,'research-config.json'),'utf8'));
  const flag=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
  const collectKind=flag('--collect');
  if(collectKind){if(!['zh','en','news'].includes(collectKind))throw new Error('无效检索分片类型');const shard=Number(flag('--shard')??0),shards=Number(flag('--shards')??1);if(!Number.isInteger(shard)||!Number.isInteger(shards)||shards<1||shard<0||shard>=shards)throw new Error('无效分片编号');
   const result=await collectSources(cfg,today,collectKind,shard,shards);await mkdir(path.join(root,'reports'),{recursive:true});await writeFile(path.join(root,'reports',`collect-${collectKind}-${shard}.json`),JSON.stringify(result));console.log(JSON.stringify({kind:collectKind,shard,sources:result.sources.length,errors:result.errors.length,papers:result.papers.length,news:result.policies.length}));return;}
  const state=JSON.parse(await readFile(path.join(root,'research-state.json'),'utf8'));
  const cached=JSON.parse(await readFile(path.join(root,'paper-cache.json'),'utf8'));
  if(!dry && (!due(today,cfg.anchorDate,cfg.intervalDays??1)||state.lastSentDay===today)){console.log('今天不是计划推送日，或今天已经发送。');return;}
  let report;
  const assembled=flag('--assemble');
  if(assembled){const directory=path.resolve(assembled);const files=(await readdir(directory)).filter(f=>/^collect-(?:zh|en|news)-\d+\.json$/.test(f));const reports=await Promise.all(files.map(f=>readFile(path.join(directory,f),'utf8').then(JSON.parse)));report=combineReports(reports,today,cfg);}
  else report=await collectSources(cfg,today);
  const totalSources=cfg.englishJournals.length+cfg.chineseJournals.length+cfg.policySources.length;
  const livePapers=report.papers;
  const merged=mergePaperCache(livePapers,cached,today,cfg.lookbackDays);
  report.cache={retained:merged.length,used:merged.filter(p=>p.fromCache).length};
  report.papers=[...livePapers,...merged.filter(p=>p.fromCache)];
  const [zh,en]=selectPapers(report.papers,today,state.papers,{lookbackDays:cfg.lookbackDays,diagnostics:report.funnel});
  const policyItems=[...new Map(report.policies.filter(p=>!state.policies[p.id]&&!state.policyTitles?.[p.title.replace(/[\s\p{P}]/gu,'')]).map(p=>[p.title.replace(/[\s\p{P}]/gu,''),p])).values()].sort((a,b)=>Number(!recent(a.date,today,7))-Number(!recent(b.date,today,7))||b.score-a.score||b.date.localeCompare(a.date));
  const selectedPolicies=policyItems.slice(0,cfg.maxNewsItems??5);
  report.selected={zh,en,policies:selectedPolicies};
  const lines=[`# 教育论文与政策素材｜${today}`,`论文范围最近${cfg.lookbackDays}天，优先最近7天，中文、英文各至多一篇。官网出版日期与RSS题录日期分别注明；未核验最早首发时间的题录会单独说明。政策与新闻取最近${cfg.policyLookbackDays}天，包含新文件、地方执行、解读评估与争议报道。`,
    '优先基础教育：农村教育、教育人口、教育政策、教育公平；排除高校机构建设等研究对象。规则排序仅在配置来源内比较，不代表全网最佳。'];
  for(const [label,p] of [['中文论文',zh],['英文论文',en]]) {
    lines.push(`## ${label}`);
    if(!p){lines.push(`本轮成功检索的来源及有效缓存中，没有确认最近${cfg.lookbackDays}天内、主题匹配且未推送的${label}；失败来源不计入结论。`);continue;}
    lines.push(`**${p.title}**`,`${p.readingBand}｜${p.journal}｜${p.publicationVerification==='catalogue'?'题录标注日期':'首次发表'}：${p.date}｜${p.authors||'作者信息见原文'}`,`主题：${p.topics.join('、')}`,`推荐理由：${rationale(p)}`);
    if(p.publicationVerification==='catalogue')lines.push('日期依据为知网期刊RSS条目，尚未逐篇核验更早的网络首发时间；如取得更早出版日期，按更早日期重新筛选。');
    if(p.abstract)lines.push(`摘要摘录（非全文解读）：${p.abstract.slice(0,p.language==='zh'?140:400)}${p.abstract.length>(p.language==='zh'?140:400)?'…':''}`);
    lines.push(`[期刊原文/DOI](${p.url})`, `日期依据：${p.dateBasis}。全文是否开放获取请查看原文。`);
    if(p.fromCache)lines.push(`本次使用已核验元数据缓存，采集日期：${p.fetchedAt}；本轮未重新取得该条文章元数据，原文可访问性须打开链接确认。`);
  }
  lines.push('## 政策动态与写作素材');
  if(!selectedPolicies.length)lines.push(`本轮成功读取的来源中，没有确认最近${cfg.policyLookbackDays}天内、相关且未推送的政策或新闻素材；读取失败不等于没有相关内容。`);
  for(const p of selectedPolicies)lines.push(`- **${p.title}**\n  ${p.region}｜${p.source}｜本篇发布：${p.date}\n  类型：${p.kind}\n  关联：${p.researchReason||p.rationale}\n  内容线索：${p.excerpt||'见原文'}\n  写作切入：${policyInspiration(p)}\n  ${p.rssOnly?'仅取得发布机构RSS摘要，正文尚未核验。':''}\n  [报道/文件原文](${p.url})`);
  if(policyItems.length>selectedPolicies.length)lines.push(`另有${policyItems.length-selectedPolicies.length}条符合条件政策，完整候选见本次运行摘要。`);
  const jc=report.journalCoverage;const read=jc.filter(s=>s.state==='read').length,partial=jc.filter(s=>s.state==='partial').length;
  lines.push(`中文期刊范围${cfg.chineseJournals.length}本：目录与首发入口均取得题录${read}本，部分取得${partial}本，未取得题录${cfg.chineseJournals.length-read-partial}本。RSS刊名核验并读取${jc.filter(s=>s.rss).length}本，其中RSS最新日期已超出30天窗口${jc.filter(s=>s.rss&&!s.rss.latestWithinWindow).length}本，可能存在更新滞后。入口读取成功不代表完整覆盖所有新文。`, '[逐刊读取状态](https://github.com/fengsenran/education-conference-alert/blob/main/archive/journal-coverage.json)');
  lines.push(`监测入口：${report.sources.length}/${totalSources}个读取成功，${report.errors.length}项读取失败，${report.warnings.length}项检查未完成或元数据不完整。`);
  lines.push(`筛选记录：解析后候选${report.funnel.input}；日期不明${report.funnel.missingDate}；超出窗口${report.funnel.outsideWindow}；已推送${report.funnel.alreadySent}；非研究性文章${report.funnel.excludedType}；不符合研究主线${report.funnel.offTopic}；可选${report.funnel.eligible}。`);
  lines.push(`本次另保留${report.cache.used}条既有元数据缓存参与筛选；缓存不改变首次发表日期或去重规则，超过${cfg.lookbackDays}天自动淘汰。`);
  if(report.errors.length)lines.push('部分来源读取失败，本轮结果不完整；不能据此判断这些来源没有新文或新政策。',...report.errors.slice(0,12).map(e=>`- ${e.source}：${e.error}`));
  lines.push('免费推送内容保留1天，请及时保存原文链接。');
  await mkdir(path.join(root,'reports'),{recursive:true});
  await writeFile(path.join(root,'reports','research-latest.json'),JSON.stringify(report,null,2));
  await writeFile(path.join(root,'reports','research-latest.md'),lines.join('\n\n'));
  await writeFile(path.join(root,'reports','journal-coverage.json'),JSON.stringify({date:today,window:report.window,journals:jc},null,2));
  console.log(JSON.stringify({date:today,sources:report.sources,journalCoverage:jc.map(j=>({name:j.name,state:j.state,parsed:j.parsed,dated:j.dated,inWindow:j.inWindow,failures:j.attempts.filter(a=>a.status==='failed')})),funnel:report.funnel,selected:{zh:zh?.title||null,en:en?.title||null,policies:selectedPolicies.map(p=>({title:p.title,date:p.date,kind:p.kind,url:p.url}))},errors:report.errors,warnings:report.warnings.length,dry},null,2));
  if(dry)return;
  const receipt=await push(`教育论文政策精选 ${today}`,lines.join('\n\n'));
  await mkdir(path.join(root,'archive'),{recursive:true});
  await writeFile(path.join(root,'archive','research-latest.md'),lines.join('\n\n'));
  await writeFile(path.join(root,'archive','journal-coverage.json'),JSON.stringify({date:today,window:report.window,journals:jc},null,2)+'\n');
  await writeFile(path.join(root,'archive','research-receipt.json'),JSON.stringify({...receipt,digestDate:today},null,2)+'\n');
  console.log('推送服务已接受请求，实际微信送达须在接收端确认；正文和接口回执已存档。');
  for(const p of [zh,en].filter(Boolean)){state.papers[p.id]=today;state.papers[paperKey(p)]=today;}
  for(const p of selectedPolicies)state.policies[p.id]=today;
  state.policyTitles??={};for(const p of selectedPolicies)state.policyTitles[p.title.replace(/[\s\p{P}]/gu,'')]=today;
  await writeFile(path.join(root,'paper-cache.json'),JSON.stringify(merged.map(({fromCache,...p})=>p),null,2)+'\n');
  state.lastSentDay=today;
  await writeFile(path.join(root,'research-state.json'),JSON.stringify(state,null,2)+'\n');
  if(!report.sources.length&&!zh&&!en)throw new Error('全部来源读取失败且没有可用缓存文章，已发送异常汇总');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
