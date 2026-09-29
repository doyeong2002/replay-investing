import { NextRequest, NextResponse } from "next/server";
import { WATCHLIST_STOCKS } from "@/constants/watchlist";

type Suggestion = { symbol: string; name: string; market: "US" | "KR" };
type TossStock = { symbol?: string; name?: string };

const COMMON: Suggestion[] = [
  { symbol: "NVDA", name: "엔비디아", market: "US" }, { symbol: "NVDL", name: "엔비디아 2배 ETF", market: "US" },
  { symbol: "DIS", name: "월트 디즈니", market: "US" }, { symbol: "DIA", name: "다우존스 ETF", market: "US" },
  { symbol: "DDOG", name: "데이터독", market: "US" }, { symbol: "D-WAVE", name: "디웨이브 퀀텀", market: "US" },
  { symbol: "MSTR", name: "스트래티지", market: "US" }, { symbol: "COIN", name: "코인베이스", market: "US" },
  { symbol: "CRCL", name: "써클 인터넷", market: "US" }, { symbol: "BMNR", name: "비트마인", market: "US" },
  { symbol: "005930", name: "삼성전자", market: "KR" }, { symbol: "000660", name: "SK하이닉스", market: "KR" },
];
let tokenCache: { value: string; expiresAt: number } | null = null;
let catalogCache: { value: Suggestion[]; expiresAt: number } | null = null;

function runtimeVariable(name: string) {
  return process.env[name];
}
function normalize(value: string) { return value.toLowerCase().replace(/\s+/g, ""); }
async function token() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  const clientId = runtimeVariable("TOSSINVEST_CLIENT_ID"); const clientSecret = runtimeVariable("TOSSINVEST_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret });
  const response = await fetch("https://openapi.tossinvest.com/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!response.ok || !data.access_token) return null;
  tokenCache = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return tokenCache.value;
}
async function catalog() {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.value;
  const accessToken = await token(); if (!accessToken) return [];
  const items: Suggestion[] = [];
  for (const market of ["NASDAQ", "NYSE", "AMEX", "US_ETC", "KOSPI", "KOSDAQ"]) {
    try {
      const response = await fetch(`https://openapi.tossinvest.com/api/v1/stocks/all?market=${market}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
      const data = await response.json() as { result?: TossStock[] };
      if (!response.ok) continue;
      for (const item of data.result ?? []) {
        const symbol = item.symbol?.trim().toUpperCase(); const name = item.name?.trim();
        if (symbol && name) items.push({ symbol, name, market: market === "KOSPI" || market === "KOSDAQ" ? "KR" : "US" });
      }
    } catch { /* 일부 거래소 목록 실패는 정적 후보로 보완 */ }
  }
  const unique = items.filter((item, index, all) => all.findIndex((candidate) => candidate.symbol === item.symbol) === index);
  if (unique.length) catalogCache = { value: unique, expiresAt: Date.now() + 24 * 60 * 60_000 };
  return unique;
}

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (!query) return NextResponse.json({ items: [] });
  const key = normalize(query);
  const staticItems: Suggestion[] = [
    ...COMMON,
    ...WATCHLIST_STOCKS.map((item) => ({ symbol: item.ticker, name: item.nameKo, market: "US" as const })),
  ];
  const all = [...staticItems, ...(await catalog())];
  const unique = all.filter((item, index, list) => list.findIndex((candidate) => candidate.symbol === item.symbol) === index);
  const score = (item: Suggestion) => {
    const symbol = item.symbol.toLowerCase(); const name = normalize(item.name);
    if (symbol.startsWith(key) || name.startsWith(key)) return 0;
    if (symbol.includes(key) || name.includes(key)) return 1;
    return 2;
  };
  const items = unique.filter((item) => score(item) < 2).sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name, "ko")).slice(0, 7);
  return NextResponse.json({ items }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=900" } });
}
