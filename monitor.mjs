import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dateRE = /(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*日?/g;
const conferenceRE = /研讨会|论坛|学术年会|学术会议|学术大会|学术研讨|年会征文/;
const callRE = /征稿|征文|截稿|论文征集|论文提交|投稿|摘要征集/;
const pastRE = /圆满|顺利召开|成功召开|成功举办|会议纪要|会议报道|会议日程/;
export function dayCN(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function decode(s) {
  return s.replace(/&#(x[\da-f]+|\d+);/gi, (m,n) => {
    const c = n[0].toLowerCase()==='x' ? parseInt(n.slice(1),16) : Number(n);
    return c>0 && c<=0x10ffff ? String.fromCodePoint(c) : '';
  }).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&apos;/gi,"'");
}
export function plain(html) {
  return decode(html.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,'')
    .replace(/<!--[^]*?-->/g,'').replace(/<\/(?:p|div|li|h[1-6]|tr|section)>|<br\s*\/?>/gi,'\n')
    .replace(/<[^>]+>/g,' ')).replace(/[\t \u3000]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
export function links(html, base) {
  const found = new Map();
  for (const a of html.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi)) {
    const href = a[1].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      const u = new URL(decode(href), base); u.hash='';
      if (u.hostname!==new URL(base).hostname || !/^https?:$/.test(u.protocol)) continue;
      if (/\.(pdf|docx?|xlsx?|zip|jpg|png)(\?|$)/i.test(u.href)) continue;
      const title=decode(a[1].match(/\btitle\s*=\s*["']([^"']+)["']/i)?.[1] || plain(a[2])).trim();
      if (title.length>7 && /会议|论坛|研讨|年会|征稿|征文/.test(title) && !pastRE.test(title)) found.set(u.href,{title,url:u.href});
    } catch { /* malformed website link */ }
  }
  return [...found.values()];
}
export function articleText(html) {
  const marker=/<(?:div|article)\b[^>]*(?:wp_articlecontent|v_news_content|TRS_Editor|article-content|vsb_content|rich_media_content)[^>]*>/i.exec(html);
  const body=marker ? html.slice(marker.index) : html;
  return plain(body.split(/相关阅读|上一篇[:：]|下一篇[:：]|Copyright|版权所有/i)[0]);
}
function dates(s) {
  return [...s.matchAll(dateRE)].flatMap(m => {
    const value=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    const d=new Date(`${value}T00:00:00Z`);
    return Number.isFinite(+d) && d.toISOString().slice(0,10)===value ? [{value,index:m.index,end:m.index+m[0].length}] : [];
  });
}
export function assess(title, body, today, topics) {
  if (pastRE.test(title) || !conferenceRE.test(title+'\n'+body) || !callRE.test(title+'\n'+body)) return {reason:'不是会议征稿通知'};
  const matches=topics.filter(t=>(title+'\n'+body).includes(t));
  if (!matches.length) return {reason:'主题不匹配'};
  const due=[];
  for (const d of dates(body)) {
    const before=body.slice(Math.max(0,d.index-60),d.index);
    const after=body.slice(d.end,d.end+45);
    // Require a submission deadline, never a registration deadline or publication date.
    const labelled=/(?:投稿|征文|征稿|论文(?:全文|电子稿)?|摘要|稿件|截稿)[^。；\n]{0,35}(?:截止|截稿)[^。；\n]{0,15}$/.test(before)
      || /(?:截稿|投稿截止|征文截止|征稿截止)(?:日期|时间)?\s*[:：]?\s*$/.test(before);
    const forward=/请于\s*$/.test(before) && /^\s*(?:[日\s]*)(?:前|之前)[^。；\n]{0,30}(?:论文|稿件|投稿|摘要)/.test(after);
    if (labelled || forward) due.push(d.value);
  }
  if (!due.length) return {reason:'未能确认含年份的投稿截止日期',topics:matches};
  const deadline=due.sort().at(-1);
  if (deadline<today) return {reason:'已截稿',deadline};
  if (deadline>`${Number(today.slice(0,4))+2}-12-31`) return {reason:'日期异常'};
  const venues=[...body.matchAll(/(?:会议地点|举办地点|会议地址|会址|地点)\s*[:：]?\s*([^\n。；]{2,100})/g)].map(m=>m[1]);
  for (const m of body.matchAll(/在([^\n。；]{2,60}?)(?:举办|召开|举行)/g)) venues.push(m[1]);
  const domestic=/北京|上海|天津|重庆|河北|山西|内蒙古|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|广西|海南|四川|贵州|云南|西藏|陕西|甘肃|青海|宁夏|新疆|香港|澳门|台湾|长春|武汉|南京|杭州|湖州|无锡|成都|西安|广州|深圳|长沙|济南|合肥|福州|厦门|郑州|贵阳|昆明|南昌|南宁|兰州|银川|西宁|海口|三亚|哈尔滨|沈阳|大连|线上|在线/;
  const foreign=/美国|英国|日本|韩国|澳大利亚|加拿大|新加坡|法国|德国|泰国|马来西亚|新西兰|境外|海外|纽约|伦敦|东京|首尔/;
  const venue=venues.find(v=>domestic.test(v) && !foreign.test(v));
  if (!venue || venues.some(v=>foreign.test(v) && !domestic.test(v))) return {reason:'无法确认国内举办地点',deadline};
  const excerpt=(re)=>body.split('\n').filter(l=>re.test(l)).slice(0,2).join('；').slice(0,240);
  return {deadline,venue:venue.trim(),topics:matches,
    organizer:excerpt(/主办|承办/), time:excerpt(/会议时间|举办时间|时间[:：]/),
    fee:excerpt(/会务费|会议费|注册费|不收取.*费|免.*会务费/) || '未能从网页明确识别，请查看官方通知',
    score:matches.reduce((s,t)=>s+(title.includes(t)?3:1),0)};
}
async function get(url) {
  const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'EducationCFPMonitor/1.0 (public academic notices; once daily)'}});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  if(!r.headers.get('content-type')?.includes('text/html')) throw new Error('不是HTML页面');
  const buf=new Uint8Array(await r.arrayBuffer());
  if(buf.length>4000000) throw new Error('页面超过4MB');
  const hint=r.headers.get('content-type')+' '+new TextDecoder().decode(buf.slice(0,1500));
  return new TextDecoder(/gb2312|gbk|gb18030/i.test(hint)?'gb18030':'utf-8').decode(buf);
}
async function push(title,body) {
  const key=process.env.SERVERCHAN_SENDKEY?.trim();
  if(!key || !/^SCT[a-zA-Z0-9]+$/.test(key)) throw new Error('请在仓库 Secrets 中设置正确的 SERVERCHAN_SENDKEY（SCT 开头）');
  let r;
  try { r=await fetch(`https://sctapi.ftqq.com/${key}.send`,{method:'POST',body:new URLSearchParams({title,desp:body}),signal:AbortSignal.timeout(30000)}); }
  catch { throw new Error('微信推送请求失败或超时；请在 Server酱控制台确认是否已送达，再手动重试'); }
  if(!r.ok) throw new Error(`微信推送接口 HTTP ${r.status}`);
  const data=await r.json();
  if(Number(data.code)!==0 || (data.data?.errno!=null && Number(data.data.errno)!==0)) throw new Error('微信推送接口报告失败，请到 Server酱控制台查看日志');
}
export async function main() {
  const today=dayCN();
  if(process.argv.includes('--test-notification')) {
    await push('教育会议推送连接测试','这是连接测试，收到消息表示 GitHub → Server酱 → 微信通道可用。\n\n目标：每天北京时间8:30，国内教育学会议，优先农村教育、教育政策、教育公平。定时调度可能延迟。');
    console.log('测试请求已被推送服务接受，请在微信确认接收。'); return;
  }
  const dry=process.argv.includes('--dry-run');
  const config=JSON.parse(await readFile(path.join(root,'config.json'),'utf8'));
  const state=JSON.parse(await readFile(path.join(root,'state.json'),'utf8'));
  if(!dry && state.lastSentDay===today) {console.log('今天已发送汇总，跳过。'); return;}
  const report={date:today,sources:[],items:[],review:[],errors:[]};
  for(const source of config.sources) {
    try {
      const list=links(await get(source.url),source.url).slice(0,config.maxArticlesPerSource);
      const status={name:source.name,candidates:list.length,checked:0}; report.sources.push(status);
      for(const link of list) {
        try {
          const body=articleText(await get(link.url)); status.checked++;
          const item={...link,source:source.name,...assess(link.title,body,today,config.topics)};
          if(item.reason) {report.review.push(item); continue;}
          item.id=createHash('sha256').update(item.title.replace(/[\s\p{P}]/gu,'')+'|'+item.deadline).digest('hex');
          if(!report.items.some(i=>i.id===item.id)) report.items.push(item);
        } catch(e) {report.errors.push({url:link.url,error:e.message});}
        await new Promise(r=>setTimeout(r,250));
      }
    } catch(e) {report.errors.push({url:source.url,error:e.message});}
  }
  report.items.sort((a,b)=>b.score-a.score || a.deadline.localeCompare(b.deadline));
  const fresh=report.items.filter(i=>!state.seen[i.id]);
  const chosen=fresh.slice(0,config.maxItemsPerMessage);
  const lines=[`国内教育学会议征稿监测｜${today}`,'关注：农村教育、教育政策、教育公平。',
    `成功读取 ${report.sources.length}/${config.sources.length} 个监测入口，抓取失败 ${report.errors.length} 项。`,
    '自动规则筛选，投稿前请核对官方通知；仅监测配置中的网站和列表前部，不代表全网。',''];
  if(!chosen.length) lines.push(report.errors.length?'本次未确认新的可投稿会议。部分页面读取失败，不能据此判断没有会议。':'本次监测范围内未确认新的可投稿会议。');
  for(const i of chosen) lines.push(`### ${i.title}`,`匹配主题：${i.topics.join('、')}`,`投稿截止：${i.deadline}`,`地点：${i.venue}`,
    `时间：${i.time||'请查看官方通知'}`,`主办/承办：${i.organizer||'请查看官方通知'}`,`费用：${i.fee}`,`[官方征稿通知](${i.url})`,'');
  if(fresh.length>chosen.length) lines.push(`另有 ${fresh.length-chosen.length} 条待后续汇总。`);
  lines.push('免费版推送内容仅保留1天，请及时保存官方链接。','未确认截止日期或国内地点的通知不列为可投稿会议，可查看运行报告核查。');
  await mkdir(path.join(root,'reports'),{recursive:true});
  await writeFile(path.join(root,'reports','latest.json'),JSON.stringify(report,null,2));
  await writeFile(path.join(root,'reports','latest.md'),lines.join('\n\n'));
  console.log(JSON.stringify({date:today,sources:report.sources,newItems:chosen.length,errors:report.errors.length,dryRun:dry},null,2));
  if(dry) return;
  if(!report.sources.length) {
    await push(`教育会议监测异常 ${today}`,'全部配置网站读取失败，本次未能完成检索。请查看 GitHub Actions 日志；这不表示没有可投稿会议。');
    throw new Error('全部网站读取失败，已发送异常通知');
  }
  await push(`教育会议征稿 ${today} ${chosen.length}条`,lines.join('\n\n'));
  for(const i of chosen) state.seen[i.id]=today;
  state.lastSentDay=today;
  await writeFile(path.join(root,'state.json'),JSON.stringify(state,null,2)+'\n');
  console.log('推送服务已接受请求；去重状态已保存。');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
}
