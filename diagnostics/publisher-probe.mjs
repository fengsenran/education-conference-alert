import fs from 'node:fs/promises';
const urls=[
'https://tsjy.cbpt.cnki.net/WKD2/WebPublication/index.aspx?mid=tsjy',
'https://tsjy.cbpt.cnki.net/portal/journal/portal/client/paper_list/type_benqi',
'https://szjk.cbpt.cnki.net/portal/journal/portal/client/paper_list/type_benqi',
'https://shgj.cbpt.cnki.net/portal/journal/portal/client/paper_list/type_benqi',
'https://oversea.cnki.net/knavi/journals/TSJY/detail?uniplatform=OVERSEA&language=CHS',
'https://ncpssd.org/journal/list?e=s%3D'+encodeURIComponent('天津师范大学学报')+'&langType=1'
];
await fs.mkdir('reports/publisher-probe',{recursive:true});
async function readPublic(url) {
 const origin=new URL(url).origin,cookies=new Map(),trail=[];
 for(let n=0;n<7;n++){
  const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')}});
  for(const cookie of r.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}
  const h=await r.text();trail.push({url,status:r.status,length:h.length,title:h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]});
  if(/captcha|verify|login/i.test(new URL(url).pathname)||/安全验证|访问暂时受限|人机验证/.test(h))return {trail,h,blocked:true};
  const loc=r.headers.get('location')||h.match(/<meta[^>]+http-equiv=['"]refresh['"][^>]+content=['"][^'"]*?url=([^'"]+)/i)?.[1];
  if(!loc)return {trail,h};
  const next=new URL(loc.replace(/&amp;/g,'&'),url);if(next.origin!==origin)return {trail,h,externalRedirect:next.href};url=next.href;
 }
 throw new Error('公开导航重定向次数过多');
}
for(let at=0;at<urls.length;at+=2)await Promise.all(urls.slice(at,at+2).map(async(url,n)=>{
 const i=at+n;try{const data=await readPublic(url);await fs.writeFile('reports/publisher-probe/source-'+i+'.html',data.h);
 const links=[...data.h.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map(m=>({href:m[1].match(/href=['"]([^'"]+)/)?.[1],title:m[2].replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim()})).filter(a=>a.href&&/paper|abstract|article|digest|details/i.test(a.href));
 console.log(JSON.stringify({i,url,trail:data.trail,blocked:data.blocked,externalRedirect:data.externalRedirect,links:links.slice(-5),scripts:[...data.h.matchAll(/<script[^>]+src=['"]([^'"]+)/gi)].map(m=>m[1]).slice(-8)}));
 }catch(e){console.log(JSON.stringify({i,url,error:e.message,cause:e.cause?.code}));}
}));
