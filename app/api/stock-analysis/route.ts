import { NextRequest, NextResponse } from 'next/server';
import { env } from 'cloudflare:workers';

type Candle={timestamp:number;close:number};
type NewsItem={title:string;source:string;publishedAt:string;url:string};
type Verdict='관망'|'분할 접근'|'주의';
type Analysis={verdict:Verdict;summary:string;positives:string[];risks:string[];checklist:string[]};
type ResolvedStock={symbol:string;name:string;market?:string;currency?:'KRW'|'USD'};
type TossListedStock={symbol?:string;name?:string;securityType?:string;isCommonShare?:boolean};
type AnalystTarget={average:number;low:number;high:number;analystCount:number}|null;

const ALIASES:Record<string,ResolvedStock>= {
  '엔비디아':{symbol:'NVDA',name:'엔비디아'},'nvda':{symbol:'NVDA',name:'엔비디아'},
  '테슬라':{symbol:'TSLA',name:'테슬라'},'tsla':{symbol:'TSLA',name:'테슬라'},
  '애플':{symbol:'AAPL',name:'애플'},'aapl':{symbol:'AAPL',name:'애플'},
  '마이크로소프트':{symbol:'MSFT',name:'마이크로소프트'},'msft':{symbol:'MSFT',name:'마이크로소프트'},
  '구글':{symbol:'GOOGL',name:'알파벳'},'알파벳':{symbol:'GOOGL',name:'알파벳'},'googl':{symbol:'GOOGL',name:'알파벳'},
  '아마존':{symbol:'AMZN',name:'아마존'},'amzn':{symbol:'AMZN',name:'아마존'},
  '메타':{symbol:'META',name:'메타'},'meta':{symbol:'META',name:'메타'},
  '스트래티지':{symbol:'MSTR',name:'스트래티지'},'마스':{symbol:'MSTR',name:'스트래티지'},'mstr':{symbol:'MSTR',name:'스트래티지'},
  'bito':{symbol:'BITO',name:'프로셰어즈 비트코인 전략 ETF'},'soxl':{symbol:'SOXL',name:'반도체 3배 ETF'},'bulz':{symbol:'BULZ',name:'FANG+ 3배 ETF'},
  '팔란티어':{symbol:'PLTR',name:'팔란티어'},'pltr':{symbol:'PLTR',name:'팔란티어'},
  '오라클':{symbol:'ORCL',name:'오라클'},'orcl':{symbol:'ORCL',name:'오라클'},
  '로켓랩':{symbol:'RKLB',name:'로켓랩'},'rklb':{symbol:'RKLB',name:'로켓랩'},
  '아이온큐':{symbol:'IONQ',name:'아이온큐'},'ionq':{symbol:'IONQ',name:'아이온큐'},
  '오클로':{symbol:'OKLO',name:'오클로'},'oklo':{symbol:'OKLO',name:'오클로'},
  '마이크론':{symbol:'MU',name:'마이크론'},'mu':{symbol:'MU',name:'마이크론'},
  '브로드컴':{symbol:'AVGO',name:'브로드컴'},'avgo':{symbol:'AVGO',name:'브로드컴'},
  '아이렌':{symbol:'IREN',name:'아이렌'},'iren':{symbol:'IREN',name:'아이렌'},
};
let cache:{key:string;expiresAt:number;value:unknown}|null=null;
let tossTokenCache:{value:string;expiresAt:number}|null=null;
let tossCatalogCache:{value:ResolvedStock[];expiresAt:number}|null=null;

function runtimeVariable(name:string){const value=(env as unknown as Record<string,unknown>)[name];return typeof value==='string'?value:process.env[name];}
function clean(value:unknown,max=260){return typeof value==='string'?value.trim().slice(0,max):'';}
function list(value:unknown,max=4){return Array.isArray(value)?value.map(item=>clean(item)).filter(Boolean).slice(0,max):[];}
function pct(from:number,to:number){return from?(to-from)/from*100:null;}
function mean(values:number[]){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;}
function rsi(values:number[],period=14){if(values.length<=period)return null;let gains=0,losses=0;for(let index=values.length-period;index<values.length;index++){const delta=values[index]-values[index-1];if(delta>=0)gains+=delta;else losses-=delta;}if(!losses)return 100;return 100-100/(1+gains/losses);}
function decodeXml(value=''){return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();}
function xmlValue(block:string,tag:string){const match=block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i'));return decodeXml(match?.[1]??'');}

async function tossAccessToken(){
  if(tossTokenCache&&tossTokenCache.expiresAt>Date.now()+60_000)return tossTokenCache.value;
  const clientId=runtimeVariable('TOSSINVEST_CLIENT_ID');const clientSecret=runtimeVariable('TOSSINVEST_CLIENT_SECRET');
  if(!clientId||!clientSecret)return null;
  const body=new URLSearchParams({grant_type:'client_credentials',client_id:clientId,client_secret:clientSecret});
  const response=await fetch('https://openapi.tossinvest.com/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,cache:'no-store'});
  if(!response.ok)return null;
  const data=await response.json() as {access_token?:string;expires_in?:number};if(!data.access_token)return null;
  tossTokenCache={value:data.access_token,expiresAt:Date.now()+(data.expires_in??3600)*1000};return data.access_token;
}

async function tossCatalog(){
  if(tossCatalogCache&&tossCatalogCache.expiresAt>Date.now())return tossCatalogCache.value;
  const token=await tossAccessToken();if(!token)return[];
  const catalog:ResolvedStock[]=[];
  for(const market of ['NASDAQ','NYSE','AMEX','US_ETC','KOSPI','KOSDAQ']){
    try{
      const response=await fetch(`https://openapi.tossinvest.com/api/v1/stocks/all?market=${market}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
      if(!response.ok)continue;
      const data=await response.json() as {result?:TossListedStock[]};
      for(const item of data.result??[]){
        const symbol=clean(item.symbol,12).toUpperCase();const name=clean(item.name,100);
        if(symbol&&name)catalog.push({symbol,name,market,currency:market==='KOSPI'||market==='KOSDAQ'?'KRW':'USD'});
      }
    }catch{/* 다음 거래소 목록은 계속 조회 */}
  }
  const unique=catalog.filter((item,index,array)=>array.findIndex(candidate=>candidate.symbol===item.symbol)===index);
  if(unique.length)tossCatalogCache={value:unique,expiresAt:Date.now()+24*60*60_000};
  return unique;
}

async function yahooSearch(query:string){
  try{
    const response=await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`,{headers:{'User-Agent':'Mozilla/5.0 Replay-Investing/1.0'},next:{revalidate:3600}});if(!response.ok)return null;
    const data=await response.json() as {quotes?:Array<{symbol?:string;shortname?:string;longname?:string;quoteType?:string}>};
    const item=(data.quotes??[]).find(value=>value.quoteType==='EQUITY'||value.quoteType==='ETF'||value.quoteType==='MUTUALFUND');const symbol=clean(item?.symbol,12).toUpperCase();
    return symbol?{symbol,name:clean(item?.shortname??item?.longname,100)||symbol,currency:'USD' as const}:null;
  }catch{return null;}
}

async function resolveQuery(query:string):Promise<ResolvedStock|null>{
  const normalized=query.trim().toLowerCase().replace(/\s+/g,'');
  if(ALIASES[normalized])return ALIASES[normalized];
  const symbol=query.trim().toUpperCase();
  if(/^[A-Z0-9.-]{1,12}$/.test(symbol))return {symbol,name:symbol,currency:/^\d{6}$/.test(symbol)?'KRW':'USD'};
  const catalog=await tossCatalog();
  const exact=catalog.find(item=>item.name.toLowerCase().replace(/\s+/g,'')===normalized);
  const partial=catalog.find(item=>item.name.toLowerCase().replace(/\s+/g,'').includes(normalized));
  return exact??partial??await yahooSearch(query);
}

async function loadNews(symbol:string){
  try{const response=await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(`"${symbol}" stock when:7d`)}&hl=ko&gl=KR&ceid=KR:ko`,{headers:{'User-Agent':'Replay-Investing/1.0'},next:{revalidate:900}});if(!response.ok)return[];const xml=await response.text();return[...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,4).flatMap(match=>{const block=match[1];const raw=xmlValue(block,'title');const source=xmlValue(block,'source')||raw.split(' - ').at(-1)||'출처 미상';const title=raw.endsWith(` - ${source}`)?raw.slice(0,-(` - ${source}`).length):raw;const url=xmlValue(block,'link');return title&&url?[{title:clean(title,180),source:clean(source,60),publishedAt:xmlValue(block,'pubDate'),url}]:[];}) as NewsItem[];}catch{return[];}
}

async function loadAnalystTarget(symbol:string,currency:'KRW'|'USD'):Promise<AnalystTarget>{
  if(currency!=='USD')return null;
  try{
    const response=await fetch(`https://stockanalysis.com/stocks/${encodeURIComponent(symbol.toLowerCase())}/forecast/`,{headers:{'User-Agent':'Mozilla/5.0 Replay-Investing/1.0',Accept:'text/html'},next:{revalidate:21_600}});
    if(!response.ok)return null;
    const html=await response.text();
    const match=html.match(/priceTargets:\{[^}]*?avg:([0-9.]+)[^}]*?low:([0-9.]+)[^}]*?high:([0-9.]+)[^}]*?numPriceTargets:(\d+)/i);
    if(!match)return null;
    const [average,low,high,analystCount]=match.slice(1).map(Number);
    return [average,low,high,analystCount].every(Number.isFinite)&&average>0?{average,low,high,analystCount}:null;
  }catch{return null;}
}

function ruleAnalysis(data:{rsi:number|null;price:number;support:number;resistance:number;sma20:number|null;dayChange:number|null}):Analysis{
  const nearSupport=data.price<=data.support*1.03;const nearResistance=data.price>=data.resistance*.97;const aboveAverage=data.sma20!==null&&data.price>=data.sma20;let verdict:Verdict='관망';
  if(data.price<data.support*.98||(data.rsi!==null&&data.rsi>=72)||nearResistance)verdict='주의';
  else if(data.rsi!==null&&data.rsi<=38&&nearSupport)verdict='분할 접근';
  const technical=`RSI ${data.rsi?.toFixed(0)??'—'} · 20일선 ${data.sma20?.toFixed(2)??'—'} · 지지 ${data.support.toFixed(2)} · 저항 ${data.resistance.toFixed(2)}`;
  return {verdict,summary:`기술 기준상 ${verdict} 구간입니다. ${technical}`,positives:[aboveAverage?'현재가가 20일 이동평균 위에 있습니다.':'20일 이동평균 아래라 추세 회복 확인이 필요합니다.',nearSupport?'최근 20거래일 지지 구간에 가깝습니다.':'지지 구간과의 거리를 함께 확인하세요.'],risks:[nearResistance?'최근 20거래일 저항 구간에 가까워 추격 진입 위험이 있습니다.':'단기 변동으로 지지 구간이 다시 시험될 수 있습니다.',data.rsi!==null&&data.rsi>=68?`RSI ${data.rsi.toFixed(0)}로 단기 과열 구간에 가깝습니다.`:'뉴스·실적 같은 비기술 요인은 별도로 확인해야 합니다.'],checklist:['최근 뉴스 원문에서 실적·가이던스·규제 변화를 확인','진입 전 손절 기준과 최대 비중을 먼저 기록','한 번에 진입하지 않고 본인 기준 충족 여부를 재확인']};
}

export async function POST(request:NextRequest){
  let body:{query?:string};try{body=await request.json() as {query?:string};}catch{return NextResponse.json({message:'검색어를 확인해 주세요.'},{status:400});}
  const resolved=await resolveQuery(clean(body.query,40));if(!resolved)return NextResponse.json({message:'토스증권에 등록된 티커 또는 종목명으로 검색해 주세요. 예: IREN, 아이렌, 엔비디아'},{status:400});
  const cacheKey=resolved.symbol;if(cache&&cache.key===cacheKey&&cache.expiresAt>Date.now())return NextResponse.json(cache.value);
  try{
    const yahooSymbol=resolved.market==='KOSPI'?`${resolved.symbol}.KS`:resolved.market==='KOSDAQ'?`${resolved.symbol}.KQ`:resolved.symbol;
    const response=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=3mo&interval=1d`,{headers:{'User-Agent':'Mozilla/5.0 Replay-Investing/1.0'},cache:'no-store'});if(!response.ok)throw new Error('PRICE_UNAVAILABLE');
    const data=await response.json() as {chart?:{result?:Array<{timestamp?:number[];indicators?:{quote?:Array<{close?:Array<number|null>}>}}>} };const result=data.chart?.result?.[0];const timestamps=result?.timestamp??[];const closes=result?.indicators?.quote?.[0]?.close??[];const candles:Candle[]=timestamps.flatMap((timestamp,index)=>typeof closes[index]==='number'&&Number.isFinite(closes[index])?[{timestamp,close:closes[index] as number}]:[]);const values=candles.map(candle=>candle.close);const price=values.at(-1);if(!price||values.length<22)throw new Error('PRICE_UNAVAILABLE');
    const previous=values.at(-2)??price;const recent=values.slice(-21,-1);const signal={price,dayChange:pct(previous,price),rsi:rsi(values),sma20:mean(values.slice(-20)),support:Math.min(...recent),resistance:Math.max(...recent)};const [news,analystTarget]=await Promise.all([loadNews(resolved.symbol),loadAnalystTarget(resolved.symbol,resolved.currency??'USD')]);const fallback=ruleAnalysis(signal);const key=runtimeVariable('GEMINI_API_KEY');const model=runtimeVariable('GEMINI_MODEL')||'gemini-3.5-flash-lite';let analysis=fallback;let connected=false;
    if(key){
      const prompt=`당신은 보수적인 개인 투자 리서치 보조자입니다. 매수·매도 권유를 하지 말고 확인 가능한 근거만 요약하세요. 오늘은 ${new Date().toISOString().slice(0,10)}입니다.\n종목: ${resolved.name} (${resolved.symbol})\n기술 데이터: ${JSON.stringify(signal)}\n최근 7일 뉴스: ${JSON.stringify(news.map(item=>({title:item.title,source:item.source,publishedAt:item.publishedAt})))}\n뉴스에 없는 사실, 목표가, 확률을 만들지 마세요. 아래 JSON만 출력하세요:\n{"verdict":"관망 또는 분할 접근 또는 주의","summary":"두 문장 이내","positives":["확인된 긍정 근거"],"risks":["확인할 위험"],"checklist":["다음 확인 항목"]}`;
      const candidates=[model,'gemini-3.5-flash-lite','gemini-2.5-flash-lite'].filter((candidate,index,array)=>array.indexOf(candidate)===index);
      for(const candidateModel of candidates){
        try{
          const ai=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidateModel)}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:700}})});
          if(!ai.ok)continue;
          const rawData=await ai.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>};const raw=rawData.candidates?.[0]?.content?.parts?.map(part=>part.text??'').join('')??'';const match=raw.match(/\{[\s\S]*\}/);if(!match)continue;
          const parsed=JSON.parse(match[0]) as Record<string,unknown>;const verdict=parsed.verdict==='분할 접근'||parsed.verdict==='주의'?parsed.verdict:'관망';analysis={verdict,summary:clean(parsed.summary,360)||fallback.summary,positives:list(parsed.positives).length?list(parsed.positives):fallback.positives,risks:list(parsed.risks).length?list(parsed.risks):fallback.risks,checklist:list(parsed.checklist,3).length?list(parsed.checklist,3):fallback.checklist};connected=true;break;
        }catch{/* 다음 무료 모델로 재시도 */}
      }
    }
    const value={connected,symbol:resolved.symbol,name:resolved.name,currency:resolved.currency??'USD',updatedAt:new Date().toISOString(),price:signal.price,dayChange:signal.dayChange,rsi:signal.rsi,sma20:signal.sma20,support:signal.support,resistance:signal.resistance,analystTarget,analysis,news,source:'토스증권 종목 마스터 · Yahoo Finance · StockAnalysis · Google News RSS'};cache={key:cacheKey,expiresAt:Date.now()+20*60_000,value};return NextResponse.json(value,{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({message:'해당 종목의 가격 데이터를 불러오지 못했습니다. 미국주식 티커를 확인해 주세요.'},{status:502});}
}
