import { NextRequest, NextResponse } from "next/server";

type YahooChart = {
  chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
};
type YahooFundamentals = { timeseries?: { result?: Array<Record<string, unknown>> } };

type PricePoint = { date: string; close: number };
type EarningsRow = { date: string; estimated: boolean; quarter: string; consensus: number | null; actual: number | null; surprise: number | null; revenueEstimate: string | null; revenueActual: string | null; reaction: number | null; reportClose: number | null; nextClose: number | null };
type NasdaqEpsItem = { type?: string; period?: string; consensus?: number; earnings?: number };

const ALIASES: Record<string, string> = {
  엔비디아: "NVDA", 테슬라: "TSLA", 애플: "AAPL", 마이크로스트래티지: "MSTR", 스트래티지: "MSTR", 마스: "MSTR",
  코인베이스: "COIN", 써클: "CRCL", 팔란티어: "PLTR", 아이렌: "IREN",
};

async function yahooHistory(symbol: string) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`, {
    headers: { "User-Agent": "Mozilla/5.0 Replay-Investing/1.0", Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error("PRICE_UNAVAILABLE");
  const data = (await response.json()) as YahooChart;
  const result = data.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const prices = timestamps.flatMap((timestamp, index) => {
    const close = closes[index];
    return typeof close === "number" && Number.isFinite(close) && close > 0
      ? [{ date: new Date(timestamp * 1000).toISOString().slice(0, 10), close }]
      : [];
  });
  return prices;
}

async function nasdaqEps(symbol: string): Promise<NasdaqEpsItem[]> {
  try {
    const response = await fetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/eps`, {
      headers: { Accept: "application/json, text/plain, */*", "User-Agent": "Mozilla/5.0 Replay-Investing/1.0", Referer: "https://www.nasdaq.com/" },
      next: { revalidate: 21600 },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { data?: { earningsPerShare?: NasdaqEpsItem[] } };
    return data.data?.earningsPerShare ?? [];
  } catch { return []; }
}

function compactUsd(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return value >= 1_000_000_000 ? `$${(value / 1_000_000_000).toFixed(2)}B` : `$${(value / 1_000_000).toFixed(1)}M`;
}

async function latestFinancials(symbol: string) {
  try {
    const response = await fetch(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&type=quarterlyTotalRevenue,quarterlyOperatingIncome,quarterlyGrossProfit&period1=1609459200&period2=1800000000`, {
      headers: { "User-Agent": "Mozilla/5.0 Replay-Investing/1.0", Accept: "application/json" }, next: { revalidate: 21600 },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as YahooFundamentals;
    const latest = (key: string) => {
      const group = data.timeseries?.result?.find((item) => Array.isArray(item[key]));
      const values = group?.[key] as Array<{ asOfDate?: string; reportedValue?: { raw?: number } }> | undefined;
      const value = values?.at(-1);
      return typeof value?.reportedValue?.raw === "number" ? { date: value.asOfDate ?? null, value: value.reportedValue.raw } : null;
    };
    const revenue = latest("quarterlyTotalRevenue");
    const operatingIncome = latest("quarterlyOperatingIncome");
    const grossProfit = latest("quarterlyGrossProfit");
    return {
      period: revenue?.date ?? operatingIncome?.date ?? grossProfit?.date ?? null,
      revenue: compactUsd(revenue?.value ?? null),
      operatingIncome: compactUsd(operatingIncome?.value ?? null),
      grossMargin: revenue && grossProfit ? (grossProfit.value / revenue.value) * 100 : null,
    };
  } catch { return null; }
}

function volatility(prices: PricePoint[]) {
  const returns = prices.slice(-61).flatMap((point, index, list) => index === 0 ? [] : [((point.close - list[index - 1].close) / list[index - 1].close) * 100]);
  if (returns.length < 2) return { daily: null, annual: null };
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const daily = Math.sqrt(returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1));
  return { daily, annual: daily * Math.sqrt(252) };
}

export async function GET(request: NextRequest) {
  const raw = (request.nextUrl.searchParams.get("symbol") ?? "").trim();
  const symbol = ALIASES[raw.toLowerCase()] ?? ALIASES[raw] ?? raw.toUpperCase();
  if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return NextResponse.json({ message: "미국 주식 티커를 입력해 주세요." }, { status: 400 });
  try {
    const [prices, nasdaqRows, financials] = await Promise.all([yahooHistory(symbol).catch((): PricePoint[] => []), nasdaqEps(symbol), latestFinancials(symbol)]);
    const past = nasdaqRows.filter((item) => item.type === "PreviousQuarter" && typeof item.earnings === "number" && Number.isFinite(item.earnings))
      .slice(-4).reverse().map((item): EarningsRow => ({
        date: item.period ?? "분기 확인 중", estimated: false, quarter: item.period ?? "분기 확인 중",
        consensus: typeof item.consensus === "number" && Number.isFinite(item.consensus) ? item.consensus : null,
        actual: item.earnings ?? null,
        surprise: typeof item.consensus === "number" && Number.isFinite(item.consensus) ? item.earnings! - item.consensus : null,
        revenueEstimate: null, revenueActual: null, reaction: null, reportClose: null, nextClose: null,
      }));
    const next = nasdaqRows.find((item) => item.type === "UpcomingQuarter" && typeof item.consensus === "number" && Number.isFinite(item.consensus));
    const upcoming: EarningsRow | null = next ? { date: "일정 확인 중", estimated: true, quarter: next.period ?? "다음 분기", consensus: next.consensus ?? null, actual: null, surprise: null, revenueEstimate: null, revenueActual: null, reaction: null, reportClose: null, nextClose: null } : null;
    const stats = volatility(prices);
    return NextResponse.json({
      symbol,
      status: past.length || upcoming || financials ? "available" : "unavailable",
      message: past.length ? "Nasdaq는 분기별 EPS를 제공하지만 정확한 발표일과 발표 후 가격 반응은 제공하지 않습니다." : upcoming || financials ? "과거 EPS는 확인되지 않아 조회 가능한 예상치와 재무 수치만 표시합니다." : "이 종목은 무료 실적 데이터에서 발표 이력을 찾지 못했습니다. ETF·ETN·펀드 등은 실적 발표 대상이 아닐 수 있습니다.",
      upcoming,
      history: past,
      financials: financials ? {
        ...financials,
        // Free sources expose a consensus for sales, but normally not for
        // operating income or gross margin. Keep unavailable estimates explicit
        // instead of presenting a derived number as analyst consensus.
        revenueEstimate: null,
        operatingIncomeEstimate: null,
        grossMarginEstimate: null,
      } : null,
      volatility: { daily: stats.daily, annual: stats.annual, earningsMove: null },
      source: [nasdaqRows.length ? "Nasdaq 분기별 EPS" : null, financials ? "Yahoo Finance 재무" : null, prices.length ? "Yahoo Finance 가격" : null].filter(Boolean).join(" · "),
    }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=21600" } });
  } catch {
    return NextResponse.json({ message: "실적 또는 가격 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
