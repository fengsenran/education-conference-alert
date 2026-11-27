import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseEndNote,prepareImports,mergeImports} from './import-cnki.mjs';
import {selectPapers,paperKey} from './research.mjs';
const cfg=JSON.parse(await readFile(new URL('./research-config.json',import.meta.url),'utf8'));
const text=await readFile(new URL('./imports/cnki-2026-11-27.enw',import.meta.url),'utf8');
const evidence=JSON.parse(await readFile(new URL('./imports/cnki-2026-11-27-dates.json',import.meta.url),'utf8'));
test('real CNKI EndNote export keeps full abstracts and repeated authors without inventing exact dates',()=>{
 const rows=parseEndNote(text);assert.equal(rows.length,2);assert.equal(rows[0].authors,'刘丽群、张玲');assert.equal(rows[1].authors,'李伟、秦弋涵、赖昀');
 assert.equal(rows[0].date,null);assert.equal(rows[1].date,null);
 assert.equal(rows[0].sourceUrl,'https://link.cnki.net/doi/10.16826/j.cnki.1009-7228.2026.06.003');
 assert.ok(rows[1].abstract.endsWith('实现精准增加、合理增加、有效增加的目的。'));
 assert.equal(prepareImports(rows,cfg.chineseJournals,[],'2026-11-27').papers.length,0);
});
test('external exact-date evidence must match the journal and title and cannot override an earlier date',()=>{
 const rows=parseEndNote(text);const r=prepareImports(rows,cfg.chineseJournals,evidence,'2026-11-27');assert.equal(r.papers.length,2);
 assert.equal(r.papers[0].date,'2026-11-24');assert.equal(r.papers[0].journal,'天津师范大学学报（基础教育版）');assert.equal(r.papers[0].publicationVerification,'catalogue');
 assert.equal(prepareImports(rows,cfg.chineseJournals,evidence.map(e=>({...e,journal:'别的期刊'})),'2026-11-27').papers.length,0);
 assert.equal(prepareImports(rows,cfg.chineseJournals,evidence.map(e=>({...e,source:''})),'2026-11-27').papers.length,0);
 assert.equal(prepareImports([{...rows[0],date:'2026-10-01'}],cfg.chineseJournals,evidence,'2026-11-27').papers.length,0);
});
test('import enriches RSS metadata while preserving stable IDs, earlier dates and sent-paper exclusion',()=>{
 const incoming=prepareImports(parseEndNote(text),cfg.chineseJournals,evidence,'2026-11-27').papers;
 const old={...incoming[1],id:'existing-rss-id',abstract:'之前的摘要',collectionOrigin:'local-public-rss'};
 const merged=mergeImports([old],incoming,'2026-11-27');assert.equal(merged.length,2);
 const enriched=merged.find(p=>p.title===old.title);assert.equal(enriched.id,old.id);assert.equal(enriched.abstract,incoming[1].abstract);assert.equal(enriched.collectionOrigin,'user-endnote');
 const selected=selectPapers(merged,'2026-11-27',{[old.id]:'2026-11-26'},{lookbackDays:30})[0];assert.equal(selected.title,incoming[0].title);
 assert.equal(paperKey(enriched),paperKey(old));
 const knownOld={...old,date:'2026-10-01'};assert.equal(mergeImports([knownOld],[incoming[1]],'2026-11-27').length,0);
});
