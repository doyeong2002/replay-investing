import { NextRequest, NextResponse } from 'next/server';
import { env } from 'cloudflare:workers';

type RiskInput={
  baseScore:number;
  cashRatio:number;
  maxWeight:number;
  todayChange:number|null;
  previousChange:number|null;
  missingStop:number;
  holdings:Array<{symbol:string;weight:number;returnRate:number;leveraged:boolean;cryptoProxy:boolean}>;
};

type AiRisk={adjustment:number;summary:string;risks:string[];positives:string[];positions:Array<{symbol:string;stance:'positive'|'neutral'|'negative';impact:number;reason:string}>;sources:Array<{title:string;url:string}>;updatedAt:string};
type NewsContext={symbol:string;title:string;url:string;source:string;publishedAt:string};
let cache:{key:string;expiresAt:number;value:AiRisk}|null=null;

function runtimeVariable(name:string){const value=(env as unknown as Record<string,unknown>)[name];return typeof value==='string'?value:process.env[name];}
function cleanText(value:unknown,max=240){return typeof value==='string'?value.trim().slice(0,max):'';}
function stringList(value:unknown){return Array.isArray(value)?value.map(item=>cleanText(item)).filter(Boolean).slice(0,5):[];}
function decodeXml(value=''){return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();}
function xmlValue(block:string,tag:string){const match=block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'i'));return decodeXml(match?.[1]??'');}
async function recentNews(symbols:string[]){
  const groups=await Promise.all(symbols.slice(0,8).map(async symbol=>{try{const query=encodeURIComponent(`"${symbol}" stock when:7d`);const response=await fetch(`https://news.google.com/rss/search?q=${query}&hl=ko&gl=KR&ceid=KR:ko`,{headers:{'User-Agent':'Replay-Investing/1.0'},next:{revalidate:1800}});if(!response.ok)return[];const xml=await response.text();return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,2).flatMap(match=>{const block=match[1];const rawTitle=xmlValue(block,'title');const source=xmlValue(block,'source')||rawTitle.split(' - ').at(-1)||'출처 미상';const title=rawTitle.endsWith(` - ${source}`)?rawTitle.slice(0,-(` - ${source}`).length):rawTitle;const url=xmlValue(block,'link');return title&&url?[{symbol,title:cleanText(title,220),url,source:cleanText(source,80),publishedAt:xmlValue(block,'pubDate')}]:[];});}catch{return[];}}));
  return groups.flat().slice(0,16) as NewsContext[];
}

export async function POST(request:NextRequest){
  const key=runtimeVariable('GEMINI_API_KEY');const model=runtimeVariable('GEMINI_MODEL')||'gemini-3.5-flash-lite';
  let input:RiskInput;
  try{input=await request.json() as RiskInput;}catch{return NextResponse.json({connected:false,message:'리스크 입력값이 올바르지 않습니다.'},{status:400});}
  const holdings=Array.isArray(input.holdings)?input.holdings.slice(0,30).map(item=>({symbol:String(item.symbol).toUpperCase().replace(/[^A-Z0-9.-]/g,'').slice(0,12),weight:Math.max(0,Math.min(100,Number(item.weight)||0)),returnRate:Math.max(-100,Math.min(1000,Number(item.returnRate)||0)),leveraged:Boolean(item.leveraged),cryptoProxy:Boolean(item.cryptoProxy)})).filter(item=>item.symbol):[];
  const safeInput={baseScore:Math.max(0,Math.min(100,Math.round(Number(input.baseScore)||0))),cashRatio:Math.max(0,Math.min(100,Number(input.cashRatio)||0)),maxWeight:Math.max(0,Math.min(100,Number(input.maxWeight)||0)),todayChange:Number.isFinite(input.todayChange)?Number(input.todayChange):null,previousChange:Number.isFinite(input.previousChange)?Number(input.previousChange):null,missingStop:Math.max(0,Math.min(100,Math.round(Number(input.missingStop)||0))),holdings};
  if(!key)return NextResponse.json({connected:false,message:'Gemini API 키를 연결하면 최신 시장 이슈 분석이 추가됩니다.',adjustment:0,summary:'현재는 공개된 고정 계산식으로만 점수를 계산합니다.',risks:[],positives:[],positions:[],sources:[],updatedAt:new Date().toISOString()});
  const cacheKey=JSON.stringify(safeInput);if(cache&&cache.key===cacheKey&&cache.expiresAt>Date.now())return NextResponse.json({connected:true,cached:true,...cache.value});
  const headlines=await recentNews(holdings.map(item=>item.symbol));
  const prompt=`당신은 개인 투자자의 주간 리스크를 설명하는 보수적인 리서치 분석가입니다. 오늘 날짜는 ${new Date().toISOString().slice(0,10)}입니다.
아래에는 금액, 수량, 계좌번호가 제거된 포트폴리오 요약과 앱의 규칙 기반 점수가 있습니다.
${JSON.stringify(safeInput)}

무료 Google News RSS에서 수집한 최근 7일 헤드라인입니다. 이 자료에 없는 최신 사실은 만들지 마세요.
${JSON.stringify(headlines.map(({symbol,title,source,publishedAt})=>({symbol,title,source,publishedAt})))}

각 보유 종목과 직접 관련된 법안, 규제, 자금 유입/유출, 실적, 공급망, 제품 수요, 원자재/메모리 가격, ETF 구조 위험을 우선합니다. MSTR 같은 크립토 프록시는 비트코인 ETF 자금 흐름·규제·비트코인 변동성을, BULZ 같은 레버리지 상품은 레버리지 경로 의존성과 주요 구성 산업의 수요·밸류에이션을 함께 평가하세요. 확인되지 않은 사건이나 확률을 만들지 말고, 확률은 제공된 헤드라인에 신뢰할 수 있는 수치가 있을 때만 언급하세요.

기본 점수는 앱이 이미 계산했습니다. 당신은 최신 외부 위험/호재만 반영해 adjustment를 -10에서 +5 사이 정수로 제시하세요. 부정 근거가 없다고 안전하다고 단정하지 마세요. 투자 권유가 아니라 위험 요인 설명이어야 합니다.
다른 문장 없이 아래 JSON 형식만 출력하세요:
{"adjustment":-3,"summary":"한 문장 요약","risks":["구체적 위험"],"positives":["구체적 호재"],"positions":[{"symbol":"MSTR","stance":"negative","impact":-4,"reason":"최근 근거를 포함한 이유"}]}`;
  try{
    const models=[model,...(model==='gemini-3.5-flash-lite'?[]:['gemini-3.5-flash-lite'])];let response:Response|undefined;
    for(const candidateModel of models){response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidateModel)}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',thinkingConfig:{thinkingLevel:'minimal'},maxOutputTokens:1000}})});if(response.ok||response.status!==429)break;}
    if(!response?.ok)throw new Error(`GEMINI_${response?.status??'FAILED'}`);
    const data=await response.json() as {candidates?:Array<{content?:{parts?:Array<{text?:string}>};groundingMetadata?:{groundingChunks?:Array<{web?:{uri?:string;title?:string}}>} }>};const candidate=data.candidates?.[0];
    const raw=candidate?.content?.parts?.map(part=>part.text??'').join('').trim()??'';const match=raw.match(/\{[\s\S]*\}/);if(!match)throw new Error('GEMINI_FORMAT');
    const parsed=JSON.parse(match[0]) as Record<string,unknown>;const rawPositions=Array.isArray(parsed.positions)?parsed.positions:[];
    const positions=rawPositions.flatMap(value=>{if(!value||typeof value!=='object')return[];const item=value as Record<string,unknown>;const symbol=cleanText(item.symbol,12).toUpperCase();const stance:'positive'|'neutral'|'negative'=item.stance==='positive'||item.stance==='negative'?item.stance:'neutral';return symbol?[{symbol,stance,impact:Math.max(-10,Math.min(5,Math.round(Number(item.impact)||0))),reason:cleanText(item.reason,320)}]:[];}).slice(0,holdings.length);
    const groundedSources=(candidate?.groundingMetadata?.groundingChunks??[]).flatMap(chunk=>chunk.web?.uri?[{title:cleanText(chunk.web.title,120)||'관련 자료',url:chunk.web.uri}]:[]);
    const sources=(groundedSources.length?groundedSources:headlines.map(item=>({title:`${item.symbol} · ${item.source}`,url:item.url}))).filter((source,index,array)=>array.findIndex(item=>item.url===source.url)===index).slice(0,8);
    const value:AiRisk={adjustment:Math.max(-10,Math.min(5,Math.round(Number(parsed.adjustment)||0))),summary:cleanText(parsed.summary,320)||'최신 시장 이슈를 분석했습니다.',risks:stringList(parsed.risks),positives:stringList(parsed.positives),positions,sources,updatedAt:new Date().toISOString()};
    cache={key:cacheKey,expiresAt:Date.now()+30*60_000,value};return NextResponse.json({connected:true,cached:false,...value});
  }catch(error){const code=error instanceof Error?error.message:'UNKNOWN';console.error('[risk-analysis]',code);return NextResponse.json({connected:false,message:code==='GEMINI_429'?'Gemini 무료 한도를 잠시 초과했습니다. 규칙 기반 점수를 유지합니다.':'Gemini 분석을 불러오지 못해 규칙 기반 점수를 유지합니다.',adjustment:0,summary:'최신 시장 이슈 분석을 사용할 수 없습니다.',risks:[],positives:[],positions:[],sources:[],updatedAt:new Date().toISOString()});}
}
