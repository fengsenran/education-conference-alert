import https from 'node:https';
import {isIP} from 'node:net';
const cache=new Map();
// Public address independently resolved and HTTPS/feed identity checked on 2026-11-27.
// Some overseas DNS/CDN routes return NXDOMAIN; certificate validation remains mandatory.
const lastVerifiedAddress={'navi.cnki.net':'121.194.4.8'};
export function publicIPv4(address) {
 if(isIP(address)!==4)return false;
 const [a,b]=address.split('.').map(Number);
 return a>0&&a<224&&a!==10&&a!==127&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&b===168)&&!(a===100&&b>=64&&b<=127)&&!(a===198&&(b===18||b===19));
}
export async function resolvePublicRss(hostname) {
 if(hostname!=='navi.cnki.net')throw new Error('不支持的RSS域名');
 const old=cache.get(hostname);if(old&&old.until>Date.now())return old.address;
 const u=new URL('https://dns.alidns.com/resolve');u.searchParams.set('name',hostname);u.searchParams.set('type','A');
 const r=await fetch(u,{signal:AbortSignal.timeout(10000),headers:{Accept:'application/dns-json'}});if(!r.ok)throw new Error('公共DNS查询失败 HTTP '+r.status);
 const data=await r.json();const answer=data.Status===0&&data.Answer?.find(a=>a.type===1&&a.name.replace(/\.$/,'')===hostname&&publicIPv4(a.data));
 if(!answer)throw new Error('公共DNS未返回有效公网地址');
 cache.set(hostname,{address:answer.data,until:Date.now()+Math.min(3600,Math.max(1,answer.TTL||30))*1000});return answer.data;
}
export function readRssAtAddress(url,address) {
 return new Promise((resolve,reject)=>{
  const request=https.get(url,{rejectUnauthorized:true,lookup:(hostname,options,callback)=>callback(null,options.all?[{address,family:4}]:address,4),headers:{Accept:'application/rss+xml,application/xml','User-Agent':'EducationReadingMonitor/2.0'}},response=>{
   if(response.statusCode!==200){response.resume();reject(new Error('RSS HTTP '+response.statusCode));return;}
   const chunks=[];let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>6000000){response.destroy(new Error('RSS响应超过6MB'));return;}chunks.push(chunk);});
   response.on('error',reject);response.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
  });
  const timer=setTimeout(()=>request.destroy(new Error('公共RSS读取超时')),16000);request.on('close',()=>clearTimeout(timer));request.on('error',reject);
 });
}
export async function requestPublicRss(url,{request,resolve=resolvePublicRss,transport=readRssAtAddress}) {
 const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='navi.cnki.net'||u.port||u.username||u.password||!/^\/knavi\/rss\/[A-Z0-9]+$/i.test(u.pathname)||u.search||u.hash)throw new Error('仅支持知网公开期刊RSS入口');
 try{return await request(url);}catch(e){
  if(!/ENOTFOUND|EAI_AGAIN|ENODATA/.test([e.message,e.cause?.code].join(' ')))throw e;
  let address;try{address=await resolve(u.hostname);}catch(dnsError){address=lastVerifiedAddress[u.hostname];if(!address)throw dnsError;}if(!publicIPv4(address))throw new Error('RSS解析地址不是有效公网IPv4');
  return transport(url,address);
 }
}
