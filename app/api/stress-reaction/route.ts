import { NextRequest, NextResponse } from "next/server";

type YahooChart = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
  };
};

const FACTORS = {
  NASDAQ: { symbol: "^IXIC", name: "나스닥 종합" },
  BTC: { symbol: "BTC-USD", name: "비트코인" },
  DOW: { symbol: "^DJI", name: "다우존스" },
  SOX: { symbol: "^SOX", name: "필라델피아 반도체" },
  VIX: { symbol: "^VIX", name: "VIX 공포지수" },
  OIL: { symbol: "CL=F", name: "WTI 국제유가" },
} as const;

const ALIASES: Record<string, string> = {
  엔비디아: "NVDA", 테슬라: "TSLA", 애플: "AAPL", 마스: "MSTR", 스트래티지: "MSTR",
  마이크로스트래티지: "MSTR", 코인베이스: "COIN", 써클: "CRCL", 써클인터넷: "CRCL",
  비트마인: "BMNR", 비트마인임머전: "BMNR", 소엑스엘: "SOXL", 불즈: "BULZ",
};

type Point = { date: string; close: number; change: number | null };

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function history(symbol: string): Promise<Point[]> {
  const response = await fetch(
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`,
    { headers: { "User-Agent": "Replay-Investing/1.0", Accept: "application/json" }, next: { revalidate: 3600 } },
  );
  if (!response.ok) throw new Error("YAHOO_FETCH_FAILED");
  const data = (await response.json()) as YahooChart;
  const result = data.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const points: Point[] = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const close = closes[index];
    if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) continue;
    const previous = points.at(-1)?.close;
    points.push({
      date: new Date(timestamps[index] * 1000).toISOString().slice(0, 10),
      close,
      change: previous ? ((close - previous) / previous) * 100 : null,
    });
  }
  return points;
}

export async function GET(request: NextRequest) {
  const factorKey = (request.nextUrl.searchParams.get("factor") ?? "NASDAQ").toUpperCase() as keyof typeof FACTORS;
  const factor = FACTORS[factorKey];
  const rawSymbol = (request.nextUrl.searchParams.get("symbol") ?? "NVDA").trim().toUpperCase();
  const symbol = ALIASES[rawSymbol.toLowerCase()] ?? ALIASES[rawSymbol] ?? rawSymbol;
  const threshold = Number(request.nextUrl.searchParams.get("threshold") ?? -3);
  // The threshold sign determines whether we compare a sharp rise or fall.
  const invalidThreshold = threshold === 0 || threshold < -30 || threshold > 100;
  if (!factor || !/^[A-Z0-9.-]{1,12}$/.test(symbol) || !Number.isFinite(threshold) || invalidThreshold) {
    return NextResponse.json({ message: "시장, 티커, 변동률을 확인해 주세요." }, { status: 400 });
  }
  try {
    const [factorHistory, stockHistory] = await Promise.all([history(factor.symbol), history(symbol)]);
    const stockByDate = new Map(stockHistory.map((point) => [point.date, point]));
    const matched = factorHistory.flatMap((marketPoint) => {
      const stockPoint = stockByDate.get(marketPoint.date);
      const matches = marketPoint.change !== null && (threshold > 0 ? marketPoint.change >= threshold : marketPoint.change <= threshold);
      return matches && typeof stockPoint?.change === "number"
        ? [{ date: marketPoint.date, factorChange: marketPoint.change, stockChange: stockPoint.change, stockClose: stockPoint.close }]
        : [];
    });
    const returns = matched.map((point) => point.stockChange);
    const average = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : null;
    const fallingRate = returns.length ? (returns.filter((value) => value < 0).length / returns.length) * 100 : null;
    return NextResponse.json({
      factor: { id: factorKey, name: factor.name, threshold, direction: threshold > 0 ? "up" : "down" },
      symbol,
      period: "최근 2년 일봉",
      samples: matched.length,
      average,
      median: returns.length ? median(returns) : null,
      fallingRate,
      worst: returns.length ? Math.min(...returns) : null,
      best: returns.length ? Math.max(...returns) : null,
      latest: matched.slice(-5).reverse(),
      source: "Yahoo Finance 일봉",
    }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600" } });
  } catch {
    return NextResponse.json({ message: "과거 가격 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 502 });
  }
}
