import { NextRequest, NextResponse } from 'next/server';

type HoldingInput={symbol:string;name?:string;market?:'KR'|'US';weight?:number;returnRate?:number;leveraged?:boolean;cryptoProxy?:boolean};
type Candle={timestamp:number;close:number};
type Signal={symbol:string;name:string;price:number|null;rsi:number|null;sma20:number|null;support:number|null;resistance:number|null;dayChange:number|null;weekChange:number|null};

const CANDIDATE_UNIVERSE=[['NVDA','엔비디아'],['MSFT','마이크로소프트'],['GOOGL','알파벳'],['AMZN','아마존'],['AAPL','애플'],['META','메타'],['TSLA','테슬라'],['AVGO','브로드컴'],['AMD','AMD'],['TSM','TSMC'],['ASML','ASML'],['MU','마이크론'],['PLTR','팔란티어'],['ORCL','오라클'],['NFLX','넷플릭스'],['CRM','세일즈포스'],['LLY','일라이 릴리'],['NVO','노보 노디스크'],['RKLB','로켓랩'],['ASTS','AST 스페이스모바일'],['IONQ','아이온큐'],['OKLO','오클로'],['COHR','코히어런트'],['PANW','팔로알토 네트웍스'],['CRWD','크라우드스트라이크'],['JPM','JP모건'],['V','비자'],['COST','코스트코']] as const;
function sampledCandidates(seed:string){let state=0;for(const char of seed)state=(state*31+char.charCodeAt(0))>>>0;const pool=[...CANDIDATE_UNIVERSE];for(let index=pool.length-1;index>0;index--){state=(state*1664525+1013904223)>>>0;const swap=state%(index+1);[pool[index],pool[swap]]=[pool[swap],pool[index]];}return pool.slice(0,4);}
const koreanSymbol=(symbol:string)=>/^\d{6}$/.test(symbol)?`${symbol}.KS`:symbol;
const n=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;
const pct=(from:number,to:number)=>from?(to-from)/from*100:null;
function rsi(values:number[],period=14){if(values.length<=period)return null;let gains=0,losses=0;for(let i=values.length-period;i<values.length;i++){const delta=values[i]-values[i-1];if(delta>=0)gains+=delta;else losses-=delta;}if(!losses)return 100;return 100-100/(1+gains/losses);}
function mean(values:number[]){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;}
async function signalFor(symbol:string,name:string):Promise<Signal>{
  try{const response=await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(koreanSymbol(symbol))}?range=6mo&interval=1d`,{headers:{'User-Agent':'Mozilla/5.0 Replay-Investing/1.0'},cache:'no-store'});if(!response.ok)throw new Error('CHART_FAILED');const data=await response.json() as {chart?:{result?:Array<{timestamp?:number[];indicators?:{quote?:Array<{close?:Array<number|null>}>}}>}};const result=data.chart?.result?.[0];const timestamps=result?.timestamp??[];const closes=result?.indicators?.quote?.[0]?.close??[];const candles:Candle[]=timestamps.flatMap((timestamp,index)=>{const close=n(closes[index]);return close===null?[]:[{timestamp,close}]});const values=candles.map(candle=>candle.close);const price=values.at(-1)??null;const previous=values.at(-2)??null;const week=values.at(-6)??null;const recent=values.slice(-21,-1);return{symbol,name,price,rsi:rsi(values),sma20:mean(values.slice(-20)),support:recent.length?Math.min(...recent):null,resistance:recent.length?Math.max(...recent):null,dayChange:price!==null&&previous!==null?pct(previous,price):null,weekChange:price!==null&&week!==null?pct(week,price):null};
  }catch{return{symbol,name,price:null,rsi:null,sma20:null,support:null,resistance:null,dayChange:null,weekChange:null};}
}
function actionFor(item:HoldingInput,signal:Signal){
  const price=signal.price;const support=signal.support;const resistance=signal.resistance;const r=signal.rsi;const weight=Math.max(0,Number(item.weight)||0);let action='관망';let reason='가격 데이터가 충분히 쌓일 때까지 기존 계획과 손절 기준을 우선합니다.';
  if(price!==null&&support!==null&&price<support*.98){action='손절·재검토';reason=`최근 20거래일 지지 구간 ${support.toFixed(2)} 아래로 이탈했습니다. 최초 매수 근거와 손절가를 다시 확인하세요.`;}
  else if((r!==null&&r>=68)||(price!==null&&resistance!==null&&price>=resistance*.98)){action='추매 보류';reason=`${r!==null?`RSI ${r.toFixed(0)}${r>=68?'로 과열권에 가깝고 ':''}`:''}최근 저항 구간 ${resistance?.toFixed(2)??'—'} 부근입니다. 돌파 확인 전 추매를 보류합니다.`;}
  else if(r!==null&&r<=36&&price!==null&&support!==null&&price>=support*.98){action='분할 대응';reason=`RSI ${r.toFixed(0)}로 단기 과매도권이며 20거래일 지지 구간 ${support.toFixed(2)} 위입니다. 반등 확인 전에는 한 번에 매수하지 않습니다.`;}
  if((item.leveraged||item.cryptoProxy)&&weight>=18&&action==='관망'){action='현금 확보';reason=`고변동성 노출이 자산의 ${weight.toFixed(1)}%입니다. 신규 추매보다 현금 여력과 손절 기준을 먼저 확보합니다.`;}
  return{...signal,weight,action,reason};
}
function candidateFor(signal:Signal){
  const r=signal.rsi;const supportGap=signal.price!==null&&signal.support!==null?(signal.price-signal.support)/signal.support*100:null;const trend=signal.price!==null&&signal.sma20!==null?signal.price>=signal.sma20:null;const score=(r===null?0:Math.max(0,45-Math.abs(r-40)))+(supportGap!==null&&supportGap>=0&&supportGap<=5?25:0)+(trend?15:0)+(signal.weekChange!==null&&signal.weekChange<0?10:0);const setup=r!==null&&r<=35?'과매도 반등 관찰':supportGap!==null&&supportGap>=0&&supportGap<=5?'지지선 근접 관찰':trend?'20일선 위 추세 관찰':'기술 조건 확인 필요';const reason=[r!==null?`RSI ${r.toFixed(0)}`:'RSI 미확인',supportGap!==null?`지지선 대비 ${supportGap>=0?'+':''}${supportGap.toFixed(1)}%`:'지지선 미확인',trend===true?'20일선 위':trend===false?'20일선 아래':'추세 미확인'].join(' · ');return{...signal,score,setup,reason};}

export async function POST(request:NextRequest){
  let body:{holdings?:HoldingInput[];cashRatio?:number};try{body=await request.json() as {holdings?:HoldingInput[];cashRatio?:number};}catch{return NextResponse.json({message:'분석 입력값이 올바르지 않습니다.'},{status:400});}
  const holdings=(body.holdings??[]).slice(0,12).map(item=>({...item,symbol:String(item.symbol??'').toUpperCase().replace(/[^A-Z0-9.-]/g,'').slice(0,12),name:String(item.name??item.symbol??'')})).filter(item=>item.symbol);
  const holdingSignals=await Promise.all(holdings.map(item=>signalFor(item.symbol,item.name||item.symbol)));const actions=holdings.map((item,index)=>actionFor(item,holdingSignals[index]));
  const refreshSeed=new URL(request.url).searchParams.get('refresh')??new Date().toISOString().slice(0,10);const candidates=(await Promise.all(sampledCandidates(refreshSeed).map(([symbol,name])=>signalFor(symbol,name)))).map(candidateFor).filter(item=>item.price!==null);
  const cashRatio=Math.max(0,Math.min(100,Number(body.cashRatio)||0));const needsCash=actions.filter(item=>item.action==='현금 확보'||item.action==='손절·재검토').length;const summary=needsCash?`다음 주에는 ${needsCash}개 종목의 위험 대응을 먼저 점검하고, 현금 ${cashRatio.toFixed(0)}%를 무리한 추매보다 대응 여력으로 남겨두세요.`:`다음 주에는 보유 종목의 지지·저항 구간을 기준으로 계획 없는 추매를 피하고, 현금 ${cashRatio.toFixed(0)}%를 대응 여력으로 유지하세요.`;
  return NextResponse.json({generatedAt:new Date().toISOString(),method:'RSI(14) · 20거래일 지지/저항 · 20일 이동평균',summary,actions,candidates,disclaimer:'기술지표 기반 관찰 계획이며 매수·매도 권유가 아닙니다. 뉴스, 실적, 본인의 손절 기준을 함께 확인하세요.'},{headers:{'Cache-Control':'no-store'}});
}
