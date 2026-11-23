import { NextRequest, NextResponse } from "next/server";

type YahooChart = {
  chart?: { result?: Array<{ meta?: { exchangeName?: string }; timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
};
type YahooFundamentals = { timeseries?: { result?: Array<Record<string, unknown>> } };

type PricePoint = { date: string; close: number };
type EarningsRow = { date: string; estimated: boolean; quarter: string; consensus: number | null; actual: number | null; surprise: number | null; revenueEstimate: string | null; revenueActual: string | null; reaction: number | null; reportClose: number | null; nextClose: number | null };

const ALIASES: Record<string, string> = {
  엔비디아: "NVDA", 테슬라: "TSLA", 애플: "AAPL", 마이크로스트래티지: "MSTR", 스트래티지: "MSTR", 마스: "MSTR",
  코인베이스: "COIN", 써클: "CRCL", 팔란티어: "PLTR", 아이렌: "IREN",
};

function text(value: string) {
  return value.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function number(value: string) {
  const normalized = text(value).replace(/[$,]/g, "");
  if (!normalized || normalized === "-" || normalized === "N/A") return null;
  const match = normalized.match(/[+-]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function dateFromSort(value: string) {
  const digits = value.match(/(\d{4})(\d{2})(\d{2})/)?.slice(1);
  return digits ? `${digits[0]}-${digits[1]}-${digits[2]}` : null;
}

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
  return { prices, exchange: result?.meta?.exchangeName ?? "" };
}

function exchanges(exchange: string) {
  const preferred = /NYSE|NYQ/i.test(exchange) ? "NYSE" : /AMEX|ASE/i.test(exchange) ? "AMEX" : "NASDAQ";
  return [preferred, "NASDAQ", "NYSE", "AMEX"].filter((value, index, list) => list.indexOf(value) === index);
}

async function marketBeatPage(symbol: string, exchange: string) {
  for (const market of exchanges(exchange)) {
    try {
      const response = await fetch(`https://www.marketbeat.com/stocks/${market}/${encodeURIComponent(symbol)}/earnings/`, {
        headers: { "User-Agent": "Mozilla/5.0 Replay-Investing/1.0", Accept: "text/html" },
        next: { revalidate: 21600 },
      });
      const html = await response.text();
      if (response.ok && /id=["']earnings-history["']/i.test(html)) return html;
    } catch { /* Try the next exchange. */ }
  }
  return null;
}

async function nasdaqUpcomingEps(symbol: string) {
  try {
    const response = await fetch(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/eps`, {
      headers: { Accept: "application/json, text/plain, */*", "User-Agent": "Mozilla/5.0 Replay-Investing/1.0", Referer: "https://www.nasdaq.com/" },
      next: { revalidate: 21600 },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { data?: { earningsPerShare?: Array<{ type?: string; period?: string; consensus?: number }> } };
    const item = data.data?.earningsPerShare?.find((entry) => entry.type === "UpcomingQuarter" && typeof entry.consensus === "number");
    return item ? { period: item.period ?? "다음 분기", consensus: item.consensus } : null;
  } catch { return null; }
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

function earningsFromPage(html: string, prices: PricePoint[]) {
  const table = html.match(/<table[^>]*id=["']earnings-history["'][^>]*>([\s\S]*?)<\/table>/i)?.[1] ?? "";
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap((match) => {
    const cells = [...match[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)];
    if (cells.length < 5) return [];
    const date = dateFromSort(cells[0][1]);
    if (!date) return [];
    const values = cells.map((cell) => text(cell[2]));
    const estimated = /estimated/i.test(values[0]);
    const actual = number(values[3]);
    const consensus = number(values[2]);
    const surprise = actual !== null && consensus !== null ? actual - consensus : null;
    return [{ date, estimated, quarter: values[1] || "예정 분기", consensus, actual, surprise, revenueEstimate: values[6] && values[6] !== "-" ? values[6] : null, revenueActual: values[7] && values[7] !== "-" ? values[7] : null, reaction: null, reportClose: null, nextClose: null }];
  }) as EarningsRow[];
  const sortedPrices = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  for (const row of rows.filter((item) => !item.estimated && item.actual !== null)) {
    const index = sortedPrices.findIndex((point) => point.date >= row.date);
    const reportClose = sortedPrices[index]?.close;
    const nextClose = sortedPrices[index + 1]?.close;
    if (reportClose && nextClose) {
      row.reportClose = reportClose;
      row.nextClose = nextClose;
      row.reaction = ((nextClose - reportClose) / reportClose) * 100;
    }
  }
  return rows;
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
    const [{ prices, exchange }, nasdaqUpcoming, financials] = await Promise.all([yahooHistory(symbol), nasdaqUpcomingEps(symbol), latestFinancials(symbol)]);
    const page = await marketBeatPage(symbol, exchange);
    const rows = page ? earningsFromPage(page, prices) : [];
    const past = rows.filter((item) => !item.estimated && item.actual !== null).slice(0, 4);
    const scheduled = rows.find((item) => item.estimated) ?? null;
    const upcoming = scheduled ? { ...scheduled, quarter: scheduled.quarter === "-" ? nasdaqUpcoming?.period ?? "예정 분기" : scheduled.quarter, consensus: scheduled.consensus ?? nasdaqUpcoming?.consensus ?? null } : nasdaqUpcoming ? { date: "일정 확인 중", estimated: true, quarter: nasdaqUpcoming.period, consensus: nasdaqUpcoming.consensus, actual: null, surprise: null, revenueEstimate: null, revenueActual: null, reaction: null, reportClose: null, nextClose: null } : null;
    const reactions = past.flatMap((item) => item.reaction === null ? [] : [Math.abs(item.reaction)]);
    const averageReaction = reactions.length ? reactions.reduce((sum, value) => sum + value, 0) / reactions.length : null;
    const stats = volatility(prices);
    const reportedRevenueEstimate = past[0]?.revenueEstimate ?? null;
    return NextResponse.json({
      symbol,
      status: rows.length || upcoming || financials ? "available" : "unavailable",
      message: rows.length ? null : upcoming || financials ? "과거 발표 이력은 확인되지 않아 조회 가능한 예상치와 재무 수치만 표시합니다." : "이 종목은 무료 실적 데이터에서 발표 이력을 찾지 못했습니다. ETF·ETN·펀드 등은 실적 발표 대상이 아닐 수 있습니다.",
      upcoming,
      history: past,
      financials: financials ? {
        ...financials,
        // Free sources expose a consensus for sales, but normally not for
        // operating income or gross margin. Keep unavailable estimates explicit
        // instead of presenting a derived number as analyst consensus.
        revenueEstimate: reportedRevenueEstimate,
        operatingIncomeEstimate: null,
        grossMarginEstimate: null,
      } : null,
      volatility: { daily: stats.daily, annual: stats.annual, earningsMove: averageReaction },
      source: rows.length ? "MarketBeat 실적 이력 · Yahoo Finance 가격" : upcoming ? "Nasdaq 예상 EPS · Yahoo Finance 재무·가격" : "Yahoo Finance 재무·가격",
    }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=21600" } });
  } catch {
    return NextResponse.json({ message: "실적 또는 가격 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
