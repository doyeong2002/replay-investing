import { NextRequest, NextResponse } from 'next/server';
import { env } from 'cloudflare:workers';

const BASE_URL='https://openapi.tossinvest.com';
const SYMBOL_PATTERN=/^[A-Z0-9.-]{1,12}$/;
let tokenCache:{value:string;expiresAt:number}|null=null;

function runtimeVariable(name:string){
  const value=(env as unknown as Record<string,unknown>)[name];
  return typeof value==='string'?value:process.env[name];
}

async function accessToken(){
  if(tokenCache&&tokenCache.expiresAt>Date.now()+60_000)return tokenCache.value;
  const clientId=runtimeVariable('TOSSINVEST_CLIENT_ID');
  const clientSecret=runtimeVariable('TOSSINVEST_CLIENT_SECRET');
  if(!clientId||!clientSecret)throw new Error('TOSS_KEYS_MISSING');
  const body=new URLSearchParams({grant_type:'client_credentials',client_id:clientId,client_secret:clientSecret});
  const response=await fetch(`${BASE_URL}/oauth2/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,cache:'no-store'});
  if(!response.ok)throw new Error(response.status===403?'TOSS_IP_NOT_ALLOWED':'TOSS_TOKEN_FAILED');
  const data=await response.json() as {access_token:string;expires_in?:number};
  tokenCache={value:data.access_token,expiresAt:Date.now()+(data.expires_in??3600)*1000};
  return data.access_token;
}

export async function GET(request:NextRequest){
  if(request.nextUrl.hostname.endsWith('.ts.net')){
    const response=await fetch(`http://127.0.0.1:8000/api/toss/prices${request.nextUrl.search}`,{cache:'no-store'});
    return new NextResponse(await response.arrayBuffer(),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
  }
  try{
    const symbols=(request.nextUrl.searchParams.get('symbols')??'').split(',').map(symbol=>symbol.trim().toUpperCase()).filter(Boolean);
    if(!symbols.length||symbols.length>30||symbols.some(symbol=>!SYMBOL_PATTERN.test(symbol))){
      return NextResponse.json({connected:false,message:'유효한 미국주식 티커를 입력해 주세요.'},{status:400});
    }
    const token=await accessToken();
    const response=await fetch(`${BASE_URL}/api/v1/prices?symbols=${encodeURIComponent(symbols.join(','))}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
    if(!response.ok)throw new Error(`TOSS_READ_FAILED_${response.status}`);
    const data=await response.json() as {result?:Array<{symbol:string;timestamp?:string;lastPrice:string;currency?:string}>};
    return NextResponse.json({connected:true,mode:'READ_ONLY',prices:data.result??[]});
  }catch(error){
    const code=error instanceof Error?error.message:'UNKNOWN';
    if(code==='TOSS_KEYS_MISSING')return NextResponse.json({connected:false,message:'로컬 토스 연결에서 현재가를 확인할 수 있습니다.'},{status:503});
    if(code==='TOSS_IP_NOT_ALLOWED')return NextResponse.json({connected:false,message:'토스증권 허용 IP를 확인해 주세요.'},{status:403});
    return NextResponse.json({connected:false,message:'관심종목 시세 조회에 실패했습니다.'},{status:502});
  }
}
