import { NextRequest, NextResponse } from 'next/server';

const SYMBOLS:Record<string,string>={
  KOSPI:'^KS11',KOSDAQ:'^KQ11',NASDAQ:'^IXIC',SP500:'^GSPC',SOX:'^SOX',DOW:'^DJI',VIX:'^VIX',BITCOIN:'BTC-USD',
};

const PERIODS={
  '1D':{range:'1d',interval:'5m'},
  '1W':{range:'5d',interval:'15m'},
  '1M':{range:'1mo',interval:'1d'},
  '3M':{range:'3mo',interval:'1d'},
  '1Y':{range:'1y',interval:'1d'},
} as const;

type Period=keyof typeof PERIODS;

export async function GET(request:NextRequest){
  const id=(request.nextUrl.searchParams.get('id')??'').trim().toUpperCase();
  const requested=(request.nextUrl.searchParams.get('period')??'1M').toUpperCase();
  const period=(requested in PERIODS?requested:'1M') as Period;
  const symbol=SYMBOLS[id];
  if(!symbol)return NextResponse.json({message:'지원하지 않는 지수입니다.'},{status:400});
  try{
    const {range,interval}=PERIODS[period];
    const response=await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,{headers:{'User-Agent':'Mozilla/5.0 Replay-Investing/1.0','Accept':'application/json'},next:{revalidate:period==='1D'?20:900}});
    if(!response.ok)throw new Error(`YAHOO_${response.status}`);
    const data=await response.json() as {chart?:{result?:Array<{timestamp?:number[];indicators?:{quote?:Array<{close?:Array<number|null>}>}}>} };
    const result=data.chart?.result?.[0];const timestamps=result?.timestamp??[];const closes=result?.indicators?.quote?.[0]?.close??[];
    const points=timestamps.flatMap((timestamp,index)=>{const value=closes[index];return typeof value==='number'&&Number.isFinite(value)?[{timestamp:new Date(timestamp*1000).toISOString(),value}]:[];});
    return NextResponse.json({id,period,points,source:'Yahoo Finance'},{headers:{'Cache-Control':period==='1D'?'public, s-maxage=20, stale-while-revalidate=40':'public, s-maxage=900, stale-while-revalidate=1800'}});
  }catch{
    return NextResponse.json({message:'지수 차트 데이터를 불러오지 못했습니다.'},{status:502});
  }
}
