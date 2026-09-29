import { NextResponse } from 'next/server';

type SentimentItem={id:'CNN'|'CRYPTO';nameKo:string;market:string;score:number|null;classification:string;previousScore:number|null;updatedAt:string|null;source:string;sourceUrl:string};

const label=(value:string)=>({extreme_fear:'극도의 공포',fear:'공포',neutral:'중립',greed:'탐욕',extreme_greed:'극도의 탐욕'}[value.toLowerCase().replaceAll(' ','_')]??value);

async function cnnSentiment():Promise<SentimentItem>{
  const response=await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata',{headers:{'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36','Accept':'application/json,text/plain,*/*','Accept-Language':'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7','Referer':'https://www.cnn.com/markets/fear-and-greed'},next:{revalidate:300}});
  if(!response.ok)throw new Error('CNN_FAILED');
  const data=await response.json() as {fear_and_greed?:{score?:number;rating?:string;timestamp?:string;previous_close?:number}};const item=data.fear_and_greed;
  const score=Number(item?.score);return{id:'CNN',nameKo:'CNN 공포·탐욕 지수',market:'미국 주식 심리',score:Number.isFinite(score)?score:null,classification:label(item?.rating??''),previousScore:Number.isFinite(Number(item?.previous_close))?Number(item?.previous_close):null,updatedAt:item?.timestamp??null,source:'CNN',sourceUrl:'https://www.cnn.com/markets/fear-and-greed'};
}

async function cryptoSentiment():Promise<SentimentItem>{
  const response=await fetch('https://api.alternative.me/fng/?limit=2&format=json',{headers:{'User-Agent':'Replay-Investing/1.0','Accept':'application/json'},next:{revalidate:900}});
  if(!response.ok)throw new Error('CRYPTO_FAILED');
  const data=await response.json() as {data?:Array<{value?:string;value_classification?:string;timestamp?:string}>};const current=data.data?.[0];const previous=data.data?.[1];const score=Number(current?.value);const timestamp=Number(current?.timestamp);
  return{id:'CRYPTO',nameKo:'크립토 공포·탐욕 지수',market:'비트코인 시장 심리',score:Number.isFinite(score)?score:null,classification:label(current?.value_classification??''),previousScore:Number.isFinite(Number(previous?.value))?Number(previous?.value):null,updatedAt:Number.isFinite(timestamp)?new Date(timestamp*1000).toISOString():null,source:'Alternative.me',sourceUrl:'https://alternative.me/crypto/fear-and-greed-index/'};
}

export async function GET(){
  const results=await Promise.allSettled([cnnSentiment(),cryptoSentiment()]);
  const fallback:[SentimentItem,SentimentItem]=[
    {id:'CNN',nameKo:'CNN 공포·탐욕 지수',market:'미국 주식 심리',score:null,classification:'조회 중',previousScore:null,updatedAt:null,source:'CNN',sourceUrl:'https://www.cnn.com/markets/fear-and-greed'},
    {id:'CRYPTO',nameKo:'크립토 공포·탐욕 지수',market:'비트코인 시장 심리',score:null,classification:'조회 중',previousScore:null,updatedAt:null,source:'Alternative.me',sourceUrl:'https://alternative.me/crypto/fear-and-greed-index/'},
  ];
  const items=results.map((result,index)=>result.status==='fulfilled'?result.value:fallback[index]);
  return NextResponse.json({items},{headers:{'Cache-Control':'public, max-age=0, s-maxage=300'}});
}
