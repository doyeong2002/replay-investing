import { NextRequest, NextResponse } from 'next/server';

type YahooChart = { chart?:{ result?:Array<{ meta?:{symbol?:string;regularMarketPrice?:number;chartPreviousClose?:number;previousClose?:number;regularMarketTime?:number;currency?:string}; timestamp?:number[]; indicators?:{quote?:Array<{close?:Array<number|null>}>} }>; error?:unknown } };
type TossIndexItem = { symbol:string; price?:{lastPrice?:string;timestamp?:string}|null; candles?:Array<{timestamp:string;closePrice:string}> };
type IndexResponseItem = {id:string;nameKo:string;symbol:string;group:string;unit:string;price:number|null;previousClose:number|null;changeAmount:number|null;changePercent:number|null;history:number[];historyPoints:Array<{timestamp:string;value:number}>;updatedAt:string|null;source:string;delayed:boolean};

const INDEX_CATALOG=[
  {id:'NASDAQ',nameKo:'나스닥 종합',symbol:'^IXIC',group:'미국',unit:'pt'},
  {id:'SP500',nameKo:'S&P 500',symbol:'^GSPC',group:'미국',unit:'pt'},
  {id:'SOX',nameKo:'필라델피아 반도체',symbol:'^SOX',group:'반도체',unit:'pt'},
  {id:'DOW',nameKo:'다우존스',symbol:'^DJI',group:'미국',unit:'pt'},
  {id:'KOSPI',nameKo:'코스피',symbol:'^KS11',group:'한국',unit:'pt'},
  {id:'KOSDAQ',nameKo:'코스닥',symbol:'^KQ11',group:'한국',unit:'pt'},
  {id:'VIX',nameKo:'변동성 지수 VIX',symbol:'^VIX',group:'공포지수',unit:'pt'},
  {id:'BITCOIN',nameKo:'비트코인',symbol:'BTC-USD',group:'크립토',unit:'USD'},
] as const;

async function yahooIndex(entry:typeof INDEX_CATALOG[number]){
  const response=await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(entry.symbol)}?range=3mo&interval=1d`,{headers:{'User-Agent':'Mozilla/5.0 Replay-Investing/1.0','Accept':'application/json'},next:{revalidate:20}});
  if(!response.ok)throw new Error(`YAHOO_${response.status}`);
  const data=await response.json() as YahooChart;const result=data.chart?.result?.[0];const meta=result?.meta;
  const current=Number(meta?.regularMarketPrice??0);const rawCloses=result?.indicators?.quote?.[0]?.close??[];const timestamps=result?.timestamp??[];
  const historyPoints=timestamps.flatMap((timestamp,index)=>{const value=rawCloses[index];return typeof value==='number'&&Number.isFinite(value)?[{timestamp:new Date(timestamp*1000).toISOString(),value}]:[];});
  const closes=historyPoints.map(point=>point.value);const latestClose=closes.at(-1);const currentIsLatest=typeof latestClose==='number'&&Math.abs(current-latestClose)<=Math.max(.0001,current*.00001);const previous=Number(closes.at(currentIsLatest?-2:-1)??0);
  if(!(current>0))throw new Error('YAHOO_EMPTY');
  return {...entry,price:current,previousClose:previous||null,changeAmount:previous?current-previous:null,changePercent:previous?(current-previous)/previous*100:null,history:closes.slice(-22),historyPoints:historyPoints.slice(-70),updatedAt:meta?.regularMarketTime?new Date(meta.regularMarketTime*1000).toISOString():null,source:'Yahoo Finance',delayed:entry.id!=='BITCOIN'};
}

function tossOverride(item:TossIndexItem){
  const candles=item.candles??[];const current=Number(item.price?.lastPrice??0);const priceDate=String(item.price?.timestamp??'').slice(0,10);const latestDate=String(candles[0]?.timestamp??'').slice(0,10);const latestClose=Number(candles[0]?.closePrice??0);
  const currentIsLatest=Math.abs(current-latestClose)<=Math.max(.0001,current*.00001);const previousIndex=(priceDate&&priceDate===latestDate)||currentIsLatest?1:0;const previous=Number(candles[previousIndex]?.closePrice??0);
  const historyPoints=candles.map(candle=>({timestamp:candle.timestamp,value:Number(candle.closePrice)})).filter(point=>point.value>0).reverse().slice(-70);const history=historyPoints.slice(-22).map(point=>point.value);
  return current>0?{price:current,previousClose:previous||null,changeAmount:previous?current-previous:null,changePercent:previous?(current-previous)/previous*100:null,history,historyPoints,updatedAt:item.price?.timestamp??candles[0]?.timestamp??null,source:'Toss Securities Open API',delayed:false}:null;
}

export async function GET(request:NextRequest){
  const yahooResults=await Promise.allSettled(INDEX_CATALOG.map(yahooIndex));
  const items:IndexResponseItem[]=yahooResults.map((result,index):IndexResponseItem=>result.status==='fulfilled'?result.value:{...INDEX_CATALOG[index],price:null,previousClose:null,changeAmount:null,changePercent:null,history:[],historyPoints:[],updatedAt:null,source:'Yahoo Finance',delayed:true});
  if(request.nextUrl.hostname==='localhost'||request.nextUrl.hostname==='127.0.0.1'||request.nextUrl.hostname.endsWith('.ts.net')){
    try{
      const response=await fetch('http://127.0.0.1:8000/api/toss/market-indices',{cache:'no-store'});const data=await response.json() as {connected?:boolean;items?:TossIndexItem[]};
      if(response.ok&&data.connected)for(const domestic of data.items??[]){const override=tossOverride(domestic);const target=items.find(item=>item.id===domestic.symbol);if(target&&override)Object.assign(target,override);}
    }catch{/* 토스 지수 연결 실패 시 무료 피드를 유지 */}
  }
  return NextResponse.json({items,refreshSeconds:30},{headers:{'Cache-Control':'public, max-age=0, s-maxage=20'}});
}
