import { NextRequest, NextResponse } from 'next/server';

const QUERIES:Record<string,string>={KOSPI:'코스피 증시',KOSDAQ:'코스닥 증시',NASDAQ:'나스닥 증시 OR Nasdaq',SP500:'"S&P 500" 증시',SOX:'필라델피아 반도체 지수 OR SOX',DOW:'다우존스 증시',VIX:'VIX 변동성 지수',BITCOIN:'비트코인 OR Bitcoin'};

function decodeXml(value=''){return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim()}
function xmlValue(block:string,tag:string){const match=block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i'));return decodeXml(match?.[1]??'')}
function impact(title:string){
  if(/금리|연준|Fed|물가|CPI/i.test(title))return '금리·물가 기대 변화가 지수 밸류에이션에 반영될 수 있어요.';
  if(/반도체|AI|엔비디아|chip/i.test(title))return '반도체·AI 종목의 수급이 기술주 지수 변동성을 키울 수 있어요.';
  if(/비트코인|Bitcoin|크립토|ETF/i.test(title))return '현물 수급과 규제·ETF 이슈가 크립토 투자 심리에 영향을 줄 수 있어요.';
  if(/환율|달러|원화/i.test(title))return '환율 변화가 외국인 수급과 국내 지수에 영향을 줄 수 있어요.';
  return '새로운 시장 정보가 지수 흐름에 어떤 영향을 주는지 원문을 확인해 보세요.';
}

export async function GET(request:NextRequest){
  const id=(request.nextUrl.searchParams.get('id')??'').toUpperCase();const query=QUERIES[id];
  if(!query)return NextResponse.json({items:[],message:'지원하지 않는 지수입니다.'},{status:400});
  try{
    const response=await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:3d`)}&hl=ko&gl=KR&ceid=KR:ko`,{headers:{'User-Agent':'Replay-Investing/1.0'},next:{revalidate:1800}});if(!response.ok)throw new Error('NEWS_FAILED');
    const xml=await response.text();const items=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,5).map(match=>{const rawTitle=xmlValue(match[1],'title');const source=xmlValue(match[1],'source')||rawTitle.split(' - ').at(-1)||'출처 미상';const title=rawTitle.endsWith(` - ${source}`)?rawTitle.slice(0,-(` - ${source}`).length):rawTitle;const date=new Date(xmlValue(match[1],'pubDate'));return{title,link:xmlValue(match[1],'link'),source,publishedAt:Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}).format(date),summary:impact(title)}}).filter(item=>item.title&&item.link);
    return NextResponse.json({items},{headers:{'Cache-Control':'public, max-age=0, s-maxage=1800'}});
  }catch{return NextResponse.json({items:[],message:'지수 뉴스를 불러오지 못했습니다.'},{status:502})}
}
