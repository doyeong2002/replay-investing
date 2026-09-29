import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const PORT = 8000;
const BASE_URL = 'https://openapi.tossinvest.com';
const allowedOrigins = new Set(['http://localhost:3000','http://127.0.0.1:3000']);
let tokenCache = null;

function loadLocalEnv() {
  const values = {};
  for (const line of readFileSync(new URL('../.env', import.meta.url),'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0,index).trim();
    let value = line.slice(index+1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
    values[key] = value;
  }
  return values;
}

async function accessToken(localEnv) {
  if (tokenCache && tokenCache.expiresAt > Date.now()+60_000) return tokenCache.value;
  if (!localEnv.TOSSINVEST_CLIENT_ID || !localEnv.TOSSINVEST_CLIENT_SECRET) throw new Error('TOSS_KEYS_MISSING');
  const body = new URLSearchParams({grant_type:'client_credentials',client_id:localEnv.TOSSINVEST_CLIENT_ID,client_secret:localEnv.TOSSINVEST_CLIENT_SECRET});
  const response = await fetch(`${BASE_URL}/oauth2/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if (!response.ok) throw new Error(response.status===403?'TOSS_IP_NOT_ALLOWED':'TOSS_TOKEN_FAILED');
  const data = await response.json();
  tokenCache = {value:data.access_token,expiresAt:Date.now()+(data.expires_in??3600)*1000};
  return tokenCache.value;
}

async function tossGet(path,token,accountSeq) {
  const headers = {Authorization:`Bearer ${token}`};
  if (accountSeq) headers['X-Tossinvest-Account']=accountSeq;
  const response = await fetch(`${BASE_URL}${path}`,{headers});
  if (response.status===401) tokenCache=null;
  if (!response.ok) throw new Error(`TOSS_READ_FAILED_${response.status}`);
  return response.json();
}

function sendJson(response,status,payload,origin) {
  response.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'http://localhost:3000',
    'Vary':'Origin',
  });
  response.end(JSON.stringify(payload));
}

const server = createServer(async(request,response)=>{
  const origin = request.headers.origin??'';
  const requestUrl = new URL(request.url,'http://localhost');
  if (request.method==='OPTIONS') {
    response.writeHead(204,{'Access-Control-Allow-Origin':allowedOrigins.has(origin)?origin:'http://localhost:3000','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});
    response.end();
    return;
  }
  if (request.method!=='GET' || !['/api/toss/snapshot','/api/toss/prices','/api/toss/candles','/api/toss/market-indices'].includes(requestUrl.pathname)) {
    sendJson(response,404,{connected:false,message:'Not found'},origin);
    return;
  }
  try {
    const localEnv = loadLocalEnv();
    const token = await accessToken(localEnv);
    if(requestUrl.pathname==='/api/toss/prices'){
      const symbols=(requestUrl.searchParams.get('symbols')??'').split(',').map(symbol=>symbol.trim().toUpperCase()).filter(Boolean);
      const valid=symbols.length>0&&symbols.length<=30&&symbols.every(symbol=>/^[A-Z0-9.-]{1,12}$/.test(symbol));
      if(!valid)return sendJson(response,400,{connected:false,message:'유효한 미국주식 티커를 입력해 주세요.'},origin);
      const prices=await tossGet(`/api/v1/prices?symbols=${encodeURIComponent(symbols.join(','))}`,token);
      return sendJson(response,200,{connected:true,mode:'READ_ONLY',prices:prices.result??[]},origin);
    }
    if(requestUrl.pathname==='/api/toss/candles'){
      const symbol=(requestUrl.searchParams.get('symbol')??'').trim().toUpperCase();
      const interval=requestUrl.searchParams.get('interval')==='1m'?'1m':'1d';
      const count=Math.min(260,Math.max(2,Number(requestUrl.searchParams.get('count')??20)));
      if(!/^[A-Z0-9.-]{1,12}$/.test(symbol))return sendJson(response,400,{connected:false,message:'유효한 종목 코드를 입력해 주세요.'},origin);
      const candles=[];let before='';
      while(candles.length<count){
        const pageCount=Math.min(200,count-candles.length);const beforeQuery=before?`&before=${encodeURIComponent(before)}`:'';
        const page=await tossGet(`/api/v1/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}&count=${pageCount}${beforeQuery}`,token);const pageCandles=page.result?.candles??[];
        candles.push(...pageCandles);before=page.result?.nextBefore??'';if(pageCandles.length<pageCount||!before)break;
      }
      return sendJson(response,200,{connected:true,mode:'READ_ONLY',candles:candles.slice(0,count)},origin);
    }
    if(requestUrl.pathname==='/api/toss/market-indices'){
      const symbols=['KOSPI','KOSDAQ'];
      const [prices,...chartResults]=await Promise.all([
        tossGet(`/api/v1/market-indicators/prices?symbols=${symbols.join(',')}`,token),
        ...symbols.map(symbol=>tossGet(`/api/v1/market-indicators/${symbol}/candles?interval=1d&count=90`,token)),
      ]);
      const items=symbols.map((symbol,index)=>({symbol,price:(prices.result??[]).find(item=>item.symbol===symbol)??null,candles:chartResults[index]?.result?.candles??[]}));
      return sendJson(response,200,{connected:true,mode:'READ_ONLY',source:'TOSS',items},origin);
    }
    const accounts = await tossGet('/api/v1/accounts',token);
    const selected = localEnv.TOSSINVEST_ACCOUNT_SEQ?.trim() || String(accounts.result?.find(account=>account.accountType==='BROKERAGE')?.accountSeq??accounts.result?.[0]?.accountSeq??'');
    if (!selected) return sendJson(response,404,{connected:false,message:'사용 가능한 종합매매 계좌를 찾지 못했습니다.'},origin);
    const [holdings,krwPower,usdPower,commissions,exchangeRate]=await Promise.all([
      tossGet('/api/v1/holdings',token,selected),
      tossGet('/api/v1/buying-power?currency=KRW',token,selected),
      tossGet('/api/v1/buying-power?currency=USD',token,selected),
      tossGet('/api/v1/commissions',token,selected),
      tossGet('/api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW',token),
    ]);
    sendJson(response,200,{connected:true,mode:'READ_ONLY',holdings:holdings.result?.items??[],buyingPower:{krw:krwPower.result?.cashBuyingPower??'0',usd:usdPower.result?.cashBuyingPower??'0'},commissions:commissions.result??[],exchangeRate:exchangeRate.result?.midRate??null},origin);
  } catch(error) {
    const code = error instanceof Error?error.message:'UNKNOWN';
    if(code==='TOSS_KEYS_MISSING') return sendJson(response,503,{connected:false,message:'.env에 토스증권 API 키를 입력해 주세요.'},origin);
    if(code==='TOSS_IP_NOT_ALLOWED') return sendJson(response,403,{connected:false,message:'토스증권 WTS의 허용 IP를 확인해 주세요.'},origin);
    sendJson(response,502,{connected:false,message:'토스증권 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.'},origin);
  }
});

server.listen(PORT,'127.0.0.1',()=>console.log(`Replay read-only Toss proxy: http://127.0.0.1:${PORT}`));
