import { NextRequest, NextResponse } from 'next/server';
import { env } from 'cloudflare:workers';

const BASE_URL = 'https://openapi.tossinvest.com';
let tokenCache: { value:string; expiresAt:number } | null = null;

function runtimeVariable(name:string) {
  const bindings = env as unknown as Record<string,unknown>;
  const bindingValue = bindings[name];
  if (typeof bindingValue === 'string') return bindingValue;
  return process.env[name];
}

async function accessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  const clientId = runtimeVariable('TOSSINVEST_CLIENT_ID');
  const clientSecret = runtimeVariable('TOSSINVEST_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('TOSS_KEYS_MISSING');

  const body = new URLSearchParams({ grant_type:'client_credentials', client_id:clientId, client_secret:clientSecret });
  const response = await fetch(`${BASE_URL}/oauth2/token`, {
    method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body, cache:'no-store',
  });
  if (!response.ok) {
    throw new Error(response.status === 403 ? 'TOSS_IP_NOT_ALLOWED' : 'TOSS_TOKEN_FAILED');
  }
  const data = await response.json() as { access_token:string; expires_in?:number };
  tokenCache = { value:data.access_token, expiresAt:Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

async function tossGet<T>(path:string, token:string, accountSeq?:string): Promise<T> {
  const headers:Record<string,string> = { Authorization:`Bearer ${token}` };
  if (accountSeq) headers['X-Tossinvest-Account'] = accountSeq;
  const response = await fetch(`${BASE_URL}${path}`, { headers, cache:'no-store' });
  if (!response.ok) throw new Error(`TOSS_READ_FAILED_${response.status}`);
  return response.json() as Promise<T>;
}

export async function GET(request:NextRequest) {
  if(request.nextUrl.hostname.endsWith('.ts.net')){
    const response=await fetch('http://127.0.0.1:8000/api/toss/snapshot',{cache:'no-store'});
    return new NextResponse(await response.arrayBuffer(),{status:response.status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
  }
  try {
    const token = await accessToken();
    const accounts = await tossGet<{ result:Array<{ accountSeq:string|number; accountType:string }> }>('/api/v1/accounts',token);
    const configured = runtimeVariable('TOSSINVEST_ACCOUNT_SEQ')?.trim();
    const selected = configured || String(accounts.result?.find(account=>account.accountType==='BROKERAGE')?.accountSeq ?? accounts.result?.[0]?.accountSeq ?? '');
    if (!selected) return NextResponse.json({ connected:false, message:'사용 가능한 종합매매 계좌를 찾지 못했습니다.' },{status:404});

    const [holdings,krwPower,usdPower,commissions,exchangeRate] = await Promise.all([
      tossGet<{result:{items:unknown[]}}>('/api/v1/holdings',token,selected),
      tossGet<{result:{cashBuyingPower:string}}>('/api/v1/buying-power?currency=KRW',token,selected),
      tossGet<{result:{cashBuyingPower:string}}>('/api/v1/buying-power?currency=USD',token,selected),
      tossGet<{result:unknown[]}>('/api/v1/commissions',token,selected),
      tossGet<{result:{midRate:string}}>('/api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW',token),
    ]);
    return NextResponse.json({
      connected:true,
      mode:'READ_ONLY',
      holdings:holdings.result?.items ?? [],
      buyingPower:{ krw:krwPower.result?.cashBuyingPower ?? '0', usd:usdPower.result?.cashBuyingPower ?? '0' },
      commissions:commissions.result ?? [],
      exchangeRate:exchangeRate.result?.midRate ?? null,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'TOSS_KEYS_MISSING') return NextResponse.json({ connected:false, message:'.env에 토스증권 API 키를 입력하면 조회 전용 연결을 사용할 수 있습니다.' },{status:503});
    if (code === 'TOSS_IP_NOT_ALLOWED') return NextResponse.json({ connected:false, message:'토스증권 WTS에서 현재 공인 IP를 허용 IP로 등록해 주세요.' },{status:403});
    return NextResponse.json({ connected:false, message:'토스증권 조회에 실패했습니다. 키, 허용 IP, 계좌 상태를 확인해 주세요.' },{status:502});
  }
}
