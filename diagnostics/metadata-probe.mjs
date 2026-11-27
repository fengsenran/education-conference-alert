import fs from 'node:fs/promises';
const urls=[
'https://ncpssd.org/journal/details?gch=96925X&langType=1&num=11&years=2026',
'https://ncpssd.org/journal',
'https://ncpssd.org/js/web/journal.js',
'https://ncpssd.org/js/web/Master.js',
'https://www.ncpssd.cn/',
'https://www.nssd.cn/',
'https://c.wanfangdata.com.cn/magazine/jyyj',
'https://qikan.cqvip.com/',
'https://rss.cnki.net/knavi/rss/JYYJ?pcode=CJFD,CCJD',
'https://oversea.cnki.net/knavi/rss/JYYJ',
'https://chn.oversea.cnki.net/knavi/rss/JYYJ',
'https://navi.cnki.net/knavi/rss/JYYJ',
'https://tsjy.cbpt.cnki.net/'
];
await fs.mkdir('reports/metadata-probe',{recursive:true});
for(let at=0;at<urls.length;at+=3)await Promise.all(urls.slice(at,at+3).map(async(url,n)=>{
 const i=at+n;try{const r=await fetch(url,{signal:AbortSignal.timeout(14000)});const h=await r.text();await fs.writeFile('reports/metadata-probe/source-'+i+'.html',h);
 console.log(JSON.stringify({i,url,status:r.status,final:r.url,title:h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],length:h.length,scripts:[...h.matchAll(/<script[^>]+src=["']([^"']+)/gi)].map(m=>m[1]).slice(-12),start:h.slice(0,130)}));
 }catch(e){console.log(JSON.stringify({i,url,error:e.message,code:e.cause?.code}));}
}));
