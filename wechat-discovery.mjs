import {plain,dayCN} from './monitor.mjs';
export function parseWechatResults(html,query,today=dayCN(),maxAgeDays=60) {
  if(/请输入验证码|访问过于频繁|安全验证|用户您好，您的访问/.test(html))throw new Error('公开搜索要求验证，本轮停止，不绕过验证');
  const blocks=[...html.matchAll(/<li\b[^>]*id=["']sogou_vr_11002601_box_\d+["'][^>]*>([\s\S]*?)<\/li>/gi)];
  if(!blocks.length&&!/没有找到|未找到|无相关|暂无相关/.test(html))throw new Error('无法识别公众号搜索结果，不能判断为没有会议');
  const earliest=new Date(Date.parse(today+'T00:00:00Z')-maxAgeDays*86400000).toISOString().slice(0,10);
  return blocks.flatMap(([,block])=>{
    const title=plain(block.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1]||'');
    const account=plain(block.match(/<span\b[^>]*class=["']all-time-y2["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]||'');
    const ts=Number(block.match(/timeConvert\(['"](\d{9,11})['"]\)/)?.[1]);
    if(!ts||!title)return [];
    const publicationDate=dayCN(new Date(ts*1000));
    if(publicationDate<earliest||publicationDate>today)return [];
    if(!/论坛|研讨会|学术年会|学术会议|学术大会/.test(title)||/圆满|成功举办|顺利召开|会议纪要|会议报道|会议日程|综述/.test(title))return [];
    if(!/通知|征文|征稿|预告|报名|邀请|启事/.test(title))return [];
    const snippet=plain(block.match(/<p\b[^>]*class=["']txt-info["'][^>]*>([\s\S]*?)<\/p>/i)?.[1]||'');
    return [{title,account,publicationDate,snippet,query,
      url:'https://weixin.sogou.com/weixin?type=2&query='+encodeURIComponent(title+' '+account),
      source:'搜狗微信公开索引（非公众号完整订阅）',reason:'发现公众号会议通知；正文、主办方、地点与投稿截止尚待核实'}];
  });
}
export async function discoverWechat(cfg,today) {
  const queries=[...(cfg.queries||[]).map(q=>q.replaceAll('{year}',today.slice(0,4))),
    ...(cfg.accounts||[]).slice(0,10).map(a=>a+' 会议 通知 '+today.slice(0,4))];
  const result={queries:[],items:[],errors:[]};
  for(const query of queries) {
    try {
      const url='https://weixin.sogou.com/weixin?type=2&query='+encodeURIComponent(query);
      const r=await fetch(url,{signal:AbortSignal.timeout(18000)});if(!r.ok)throw new Error('HTTP '+r.status);
      const items=parseWechatResults(await r.text(),query,today,cfg.maxAgeDays??60);
      result.queries.push({query,count:items.length});
      for(const item of items)if(!result.items.some(i=>i.title===item.title&&i.account===item.account))result.items.push(item);
    }catch(e){result.errors.push({query,error:e.message});if(/验证|HTTP 403|HTTP 429/.test(e.message)){result.errors.push({query:'后续查询',error:'遇到访问限制，停止本轮其余查询'});break;}}
    await new Promise(r=>setTimeout(r,1200));
  }return result;
}
