import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {exactDate,recent,paperKey} from './research.mjs';
import {dayCN} from './monitor.mjs';
const normalize=s=>String(s||'').replace(/[\s\p{P}]/gu,'').toLowerCase();
export function parseEndNote(text) {
 const records=[];let record=null,key=null;
 const lines=String(text).replace(/^\uFEFF/,'').replace(/&#x20;|&#32;|&nbsp;|&#160;/gi,' ').split(/\r?\n/);
 for(const raw of lines) {
  const line=raw.replace(/\\\s*$/,'').trim();
  const field=line.match(/^%([0-9A-Za-z@+])\s*(.*)$/);
  if(field){if(field[1]==='0'){record={};records.push(record);}if(!record)continue;key=field[1];(record[key]??=[]).push(field[2]);}
  else if(line&&record&&key)record[key][record[key].length-1]+=' '+line;
 }
 return records.filter(r=>/^journal\s+article$/i.test(r['0']?.[0]||'')).map(r=>{
  const one=k=>(r[k]||[]).join(' ').replace(/\\:/g,':').trim();
  const doi=(one('R')||one('U').match(/10\.\d{4,9}\/[^\s]+/)?.[0]||'').replace(/^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/i,'').toLowerCase();
  const date=[...(r['8']||[]),...(r.D||[])].map(exactDate).filter(Boolean).sort()[0]||null;
  return {title:one('T'),authors:(r.A||[]).map(a=>a.trim()).filter(Boolean).join('、'),affiliations:one('+'),journal:one('J'),abstract:one('X'),keywords:one('K'),year:one('D'),volume:one('V'),issue:one('N'),pages:one('P'),issn:one('@'),doi:/^10\.\d{4,9}\/\S+$/i.test(doi)?doi:'',sourceUrl:one('U'),date};
 });
}

export function parseCnkiCustom(text) {
 const records=[];let record=null,key=null;
 const lines=String(text).replace(/^\uFEFF/,'').replace(/&#x20;|&#32;|&nbsp;|&#160;/gi,' ').split(/\r?\n/);
 for(const raw of lines) {
  const line=raw.replace(/\\\s*$/,'').trim();
  const field=line.match(/^([A-Za-z]+)(?:-[^:：]+)?[:：]\s*(.*)$/);
  if(field) {
   if(field[1]==='SrcDatabase'){record={};records.push(record);}
   if(!record)continue;
   key=field[1];(record[key]??=[]).push(field[2]);
  } else if(line&&record&&key)record[key][record[key].length-1]+=' '+line;
 }
 return records.filter(r=>/^(?:期刊|journal(?: article)?)$/i.test(r.SrcDatabase?.[0]||'')).map(r=>{
  const one=k=>(r[k]||[]).join(' ').replace(/\\:/g,':').trim();
  const rawDoi=one('DOI')||one('URL').match(/10\.\d{4,9}\/[^\s]+/)?.[0]||'';
  const doi=rawDoi.replace(/^(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)/i,'').toLowerCase();
  const date=exactDate(one('PubTime'));
  return {title:one('Title'),authors:one('Author').split(/[;；]/).map(a=>a.trim()).filter(Boolean).join('、'),affiliations:one('Organ'),journal:one('Source'),abstract:one('Summary'),keywords:one('Keyword'),issn:one('ISSN'),doi:/^10\.\d{4,9}\/\S+$/i.test(doi)?doi:'',sourceUrl:one('URL'),date,year:date?.slice(0,4)||'',dateBasis:'知网自定义导出PubTime-发表时间字段',collectionOrigin:'user-cnki-custom'};
 });
}
export function parseCnkiExport(text) {
 return /^\s*SrcDatabase[-:：]/m.test(String(text))?parseCnkiCustom(text):parseEndNote(text);
}

export function prepareImports(records,journals,evidence,today,lookback=30) {
 const papers=[],rejected=[];
 for(const r of records) {
  const journal=journals.find(j=>normalize(j.name)===normalize(r.journal));
  if(!r.title||!journal){rejected.push({title:r.title,reason:'题名缺失或期刊不在已配置名单'});continue;}
  const proof=evidence.find(e=>normalize(e.title)===normalize(r.title)&&normalize(e.journal)===normalize(journal.name)&&(!e.doi||e.doi.toLowerCase()===r.doi));
  const proofDate=proof?.source?exactDate(proof.date):null;
  const date=[r.date,proofDate].filter(Boolean).sort()[0]||null;
  if(!date||!recent(date,today,lookback)){rejected.push({title:r.title,reason:date?'不在最近'+lookback+'天':'只有年份或缺少可核对的精确发表日期'});continue;}
  const url=r.doi?'https://doi.org/'+r.doi:r.sourceUrl;
  if(!/^https?:\/\//i.test(url)){rejected.push({title:r.title,reason:'缺少有效原文链接或DOI'});continue;}
  papers.push({...r,journal:journal.name,weight:journal.weight,language:'zh',id:r.doi||'cnki-import:'+createHash('sha256').update(journal.name+'|'+normalize(r.title)).digest('hex'),url,date,publicationVerification:'catalogue',
   dateBasis:(proofDate===date?proof.source:(r.dateBasis||'EndNote导出的完整日期字段'))+'；尚未独立核验更早网络首发日期',
   collectionOrigin:r.collectionOrigin||'user-endnote',fetchedAt:today});
 }
 return {papers,rejected};
}
export function mergeImports(existing,incoming,today,lookback=30) {
 const rows=new Map();
 for(const p of existing)rows.set(paperKey(p),p);
 for(const p of incoming) {
  const k=paperKey(p),old=rows.get(k),earlier=old?.date&&old.date<p.date;
  rows.set(k,{...old,...p,id:old?.id||p.id,...(earlier?{date:old.date,dateBasis:old.dateBasis,publicationVerification:old.publicationVerification}:{})});
 }
 return [...rows.values()].filter(p=>recent(p.date,today,lookback)).map(({fromCache,...p})=>p);
}
export async function main() {
 const root=path.dirname(fileURLToPath(import.meta.url));
 const args=process.argv.slice(2),input=args[0];
 if(!input||input.startsWith('--'))throw new Error('用法：node import-cnki.mjs 文件.txt或.enw [--dates 日期证据.json] [--apply]；默认只预览');
 const i=args.indexOf('--dates'),dateFile=i>=0?args[i+1]:null;
 if(i>=0&&(!dateFile||dateFile.startsWith('--')))throw new Error('--dates缺少文件名');
 const cfg=JSON.parse(await readFile(path.join(root,'research-config.json'),'utf8'));
 const evidence=dateFile?JSON.parse(await readFile(path.resolve(dateFile),'utf8')):[];
 const records=parseCnkiExport(await readFile(path.resolve(input),'utf8'));
 if(!records.length)throw new Error('未解析到EndNote或知网自定义期刊题录');
 const result=prepareImports(records,cfg.chineseJournals,evidence,dayCN(),cfg.lookbackDays);
 const old=JSON.parse(await readFile(path.join(root,'paper-cache.json'),'utf8'));
 const merged=mergeImports(old,result.papers,dayCN(),cfg.lookbackDays);
 if(args.includes('--apply'))await writeFile(path.join(root,'paper-cache.json'),JSON.stringify(merged,null,2)+'\n');
 console.log(JSON.stringify({mode:args.includes('--apply')?'applied':'preview',parsed:records.length,accepted:result.papers.length,rejected:result.rejected,cacheRecords:merged.length,titles:result.papers.map(p=>({title:p.title,date:p.date,journal:p.journal}))},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
