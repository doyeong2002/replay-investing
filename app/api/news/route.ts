import { NextRequest, NextResponse } from 'next/server';

const SYMBOL_PATTERN=/^[A-Z0-9.-]{1,12}$/;

function decodeXml(value=''){
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
}

function xmlValue(block:string,tag:string){
  const match=block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i'));
  return decodeXml(match?.[1]??'');
}

function newsSignal(title:string){
  if(/earnings|revenue|guidance|실적|매출|가이던스/i.test(title))return {topic:'실적',summary:'실적과 향후 전망 변화가 단기 주가 변동성에 영향을 줄 수 있어요.'};
  if(/bitcoin|crypto|비트코인|크립토/i.test(title))return {topic:'크립토',summary:'기초 자산 가격과 자금조달 이슈가 주가 민감도를 키울 수 있어요.'};
  if(/analyst|rating|price target|목표가|투자의견|매수|매도/i.test(title))return {topic:'증권사',summary:'투자의견과 목표가 변화로 단기 수급이 흔들릴 수 있어요.'};
  if(/SEC|lawsuit|regulation|probe|규제|소송|조사/i.test(title))return {topic:'규제',summary:'규제·소송 이슈가 기업 가치와 투자 심리에 영향을 줄 수 있어요.'};
  if(/launch|contract|partnership|product|계약|파트너|출시|제품/i.test(title))return {topic:'사업',summary:'신규 계약과 제품 소식이 성장 기대에 반영되는지 확인해 보세요.'};
  return {topic:'일반',summary:'새 정보가 기존 투자 근거에 영향을 주는지 원문에서 확인해 보세요.'};
}

export async function GET(request:NextRequest){
  const symbol=(request.nextUrl.searchParams.get('symbol')??'').trim().toUpperCase();
  if(!SYMBOL_PATTERN.test(symbol))return NextResponse.json({items:[],message:'유효한 미국주식 티커를 입력해 주세요.'},{status:400});
  try{
    const query=encodeURIComponent(`"${symbol}" stock when:3d`);
    const response=await fetch(`https://news.google.com/rss/search?q=${query}&hl=ko&gl=KR&ceid=KR:ko`,{headers:{'User-Agent':'Replay-Investing/1.0'},next:{revalidate:3600}});
    if(!response.ok)throw new Error('NEWS_FETCH_FAILED');
    const xml=await response.text();
    const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,5).map(match=>{
      const block=match[1];const rawTitle=xmlValue(block,'title');const source=xmlValue(block,'source')||rawTitle.split(' - ').at(-1)||'출처 미상';
      const title=rawTitle.endsWith(` - ${source}`)?rawTitle.slice(0,-(` - ${source}`).length):rawTitle;
      const published=new Date(xmlValue(block,'pubDate'));const signal=newsSignal(title);
      return {title,link:xmlValue(block,'link'),publishedAt:Number.isNaN(published.getTime())?'':new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}).format(published),source,summary:signal.summary,topic:signal.topic};
    }).filter(item=>item.title&&item.link);
    return NextResponse.json({source:'Google News RSS',items},{headers:{'Cache-Control':'public, max-age=0, s-maxage=3600'}});
  }catch{
    return NextResponse.json({items:[],message:'무료 뉴스 피드를 불러오지 못했습니다.'},{status:502});
  }
}
