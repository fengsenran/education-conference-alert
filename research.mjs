import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {dayCN,plain,articleText,push} from './monitor.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
export const shift=(s,n)=>new Date(Date.parse(s+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export function due(today,anchor) {const d=(Date.parse(today)-Date.parse(anchor))/86400000;return d>=0 && d%2===0;}
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
function rationale(p) {
  const methods=/difference.in.differences|regression discontinuity|randomi[sz]ed|natural experiment|instrumental variable|双重差分|断点回归|随机试验|自然实验|工具变量/i.test(p.abstract);
  return `在本轮已核验日期且未推送的候选中，按期刊名单权重、题目及摘要主题匹配排序。涉及${p.topics.join('、')}。${methods?'摘要包含因果识别方法线索，适合进一步核查研究设计。':'可作为相关议题的阅读线索。'}推荐依据为题目${p.abstract?'和摘要':'，未获取摘要'}，尚未阅读全文。`;
}
async function request(url,json=false) {
  let r;
  for(let n=0;n<2;n++) {
    r=await fetch(url,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'EducationReadingMonitor/1.0 (academic metadata and public policy; every other day)'}});
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
  const date=raw.map(exactDate).filter(Boolean).sort()[0]||null;
  const fallbackAbstract=body.match(/摘要\s*[:：]\s*([\s\S]*?)(?:Abstract\s*[:：]|参考文献|相似文献|$)/)?.[1]?.trim()||'';
  const description=one('dc.description')||one('description')||'';
  return {title,abstract:fallbackAbstract||(/采编系统|稿件管理/.test(description)?'':description),authors:(m.citation_author||m['dc.creator']||[]).join('、')||body.match(/作者\s*[:：]\s*([^\n]+)/)?.[1]||'',date,
    journal:source.name,weight:source.weight,language:'zh',doi:one('citation_doi')||'',id:one('citation_doi')||url,url,dateBasis:'期刊官网文章出版/在线发表元数据'};
}
async function english(source,today,report) {
  const url=new URL(`https://api.crossref.org/journals/${source.issn}/works`);
  url.searchParams.set('filter',`type:journal-article,from-pub-date:${shift(today,-6)},until-pub-date:${today}`);
  url.searchParams.set('rows','100');
  const data=await request(url.href,true);
  const records=data.message.items;
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
async function policies(source,today,report) {
  if(source.adapter==='govuk') {
    const data=await request(source.url,true);
    let count=0;
    for(const item of data.results) {
      if(!recent(exactDate(item.public_timestamp),today))continue;
      const meta=await request(`https://www.gov.uk/api/content${item.link}`,true);
      const date=exactDate(meta.first_published_at);if(!recent(date,today))continue;
      const title=meta.title||item.title,body=plain(meta.details?.body||item.description||'');
      const match=relevance(title,body),kind=policyKind(title,body);
      if(!match.score||!kind)continue;
      report.policies.push({id:meta.content_id||item.link,title,date,url:`https://www.gov.uk${item.link}`,source:source.name,region:source.region,kind,...match});count++;
    }return count;
  }
  const html=await request(source.url);
  const links=anchors(html,source.url,source.pattern).filter(a=>relevance(a.title).score&&policyKind(a.title,'')).slice(0,25);
  let count=0;
  for(const link of links) {
    try {
      const page=await request(link.url),date=policyDate(page);if(!recent(date,today))continue;
      const m=metas(page),title=m['article.title']?.[0]||m['dcterms.title']?.[0]||link.title;
      const body=articleText(page),match=relevance(title,body),kind=policyKind(title,body);if(!match.score||!kind)continue;
      report.policies.push({id:link.url,title,date,url:link.url,region:source.region,source:source.name,kind,...match});count++;
    }catch(e){report.errors.push({source:source.name,url:link.url,error:e.message});}
  }return count;
}
export function selectPapers(items,today,seen={}) {
  const unique=new Map();
  for(const p of items) {
    if(!recent(p.date,today)||excluded.test(p.title)||seen[p.id])continue;
    const match=relevance(p.title,p.abstract);if(!match.score)continue;
    const candidate={...p,...match,rank:match.score+(p.weight||0)+(p.abstract?1:0)};
    if(!unique.has(p.id)||candidate.rank>unique.get(p.id).rank)unique.set(p.id,candidate);
  }
  return ['zh','en'].map(lang=>[...unique.values()].filter(p=>p.language===lang).sort((a,b)=>b.rank-a.rank||b.date.localeCompare(a.date))[0]||null);
}
export async function main() {
  const today=dayCN(),dry=process.argv.includes('--dry-run');
  const cfg=JSON.parse(await readFile(path.join(root,'research-config.json'),'utf8'));
  const state=JSON.parse(await readFile(path.join(root,'research-state.json'),'utf8'));
  if(!dry && (!due(today,cfg.anchorDate)||state.lastSentDay===today)){console.log('今天不是隔天推送日，或今天已经发送。');return;}
  const report={date:today,window:[shift(today,-6),today],sources:[],errors:[],warnings:[],papers:[],policies:[]};
  const jobs=[...cfg.englishJournals.map(s=>({s,kind:'英文期刊',run:()=>english(s,today,report)})),...cfg.chineseJournals.map(s=>({s,kind:'中文期刊',run:()=>chinese(s,report)})),...cfg.policySources.map(s=>({s,kind:'政策',run:()=>policies(s,today,report)}))];
  const runJob=async({s,kind,run})=>{
    try {const count=await run();report.sources.push({name:s.name,kind,count});}
    catch(e){report.errors.push({source:s.name,error:e.message});}
  };
  // Crossref's public pool has a concurrency limit. Read journal endpoints sequentially.
  for(const job of jobs.filter(j=>j.kind==='英文期刊')) {await runJob(job);await new Promise(r=>setTimeout(r,500));}
  const otherJobs=jobs.filter(j=>j.kind!=='英文期刊');
  for(let i=0;i<otherJobs.length;i+=3)await Promise.all(otherJobs.slice(i,i+3).map(runJob));
  const [zh,en]=selectPapers(report.papers,today,state.papers);
  const policyItems=[...new Map(report.policies.filter(p=>!state.policies[p.id]).map(p=>[p.id,p])).values()].sort((a,b)=>b.score-a.score||b.date.localeCompare(a.date));
  const selectedPolicies=policyItems.slice(0,8);
  report.selected={zh,en,policies:selectedPolicies};
  const lines=[`# 教育论文与政策精选｜${today}`,`核验发表窗口：${shift(today,-6)}—${today}（最近7个自然日）。`,
    '关注农村教育、教育人口、教育政策、教育公平。规则排序仅在配置来源内比较，不代表全网最佳。'];
  for(const [label,p] of [['中文论文',zh],['英文论文',en]]) {
    lines.push(`## ${label}`);
    if(!p){lines.push(`本轮已成功检索的来源中，没有确认最近7天内、主题匹配且尚未推送的${label}；失败来源不计入这个结论。`);continue;}
    lines.push(`**${p.title}**`,`${p.journal}｜${p.date}｜${p.authors||'作者信息见原文'}`,`主题：${p.topics.join('、')}`,`推荐理由：${rationale(p)}`);
    if(p.abstract)lines.push(`摘要摘录（非全文解读）：${p.abstract.slice(0,p.language==='zh'?140:400)}${p.abstract.length>(p.language==='zh'?140:400)?'…':''}`);
    lines.push(`[期刊原文/DOI](${p.url})`, `日期依据：${p.dateBasis}。全文是否开放获取请查看原文。`);
  }
  lines.push('## 国家或地区新政策');
  if(!selectedPolicies.length)lines.push('本轮监测范围内没有确认最近7天发布、主题相关且尚未推送的新政策。');
  for(const p of selectedPolicies)lines.push(`- **${p.title}**\n  ${p.region}｜${p.source}｜发布：${p.date}\n  状态：${p.kind}\n  关联：${p.topics.join('、')}\n  [政府原文](${p.url})`);
  if(policyItems.length>selectedPolicies.length)lines.push(`另有${policyItems.length-selectedPolicies.length}条符合条件政策，完整候选见本次运行摘要。`);
  lines.push(`监测入口：${report.sources.length}/${jobs.length}个成功，${report.errors.length}项读取失败，${report.warnings.length}项元数据不完整。`);
  if(report.errors.length)lines.push('部分来源读取失败，本轮结果不完整；不能据此判断这些来源没有新文或新政策。',...report.errors.slice(0,12).map(e=>`- ${e.source}：${e.error}`));
  lines.push('免费推送内容保留1天，请及时保存原文链接。');
  await mkdir(path.join(root,'reports'),{recursive:true});
  await writeFile(path.join(root,'reports','research-latest.json'),JSON.stringify(report,null,2));
  await writeFile(path.join(root,'reports','research-latest.md'),lines.join('\n\n'));
  console.log(JSON.stringify({date:today,sources:report.sources,selected:{zh:zh?.title||null,en:en?.title||null,policies:selectedPolicies.length},errors:report.errors,warnings:report.warnings.length,dry},null,2));
  if(dry)return;
  await push(`教育论文政策精选 ${today}`,lines.join('\n\n'));
  for(const p of [zh,en].filter(Boolean))state.papers[p.id]=today;
  for(const p of selectedPolicies)state.policies[p.id]=today;
  state.lastSentDay=today;
  await writeFile(path.join(root,'research-state.json'),JSON.stringify(state,null,2)+'\n');
  if(!report.sources.length)throw new Error('全部来源读取失败，已发送异常汇总');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
