import { NextRequest, NextResponse } from "next/server";

type NasdaqRow = { time?: string; symbol?: string; name?: string; marketCap?: string; fiscalQuarterEnding?: string; epsForecast?: string; noOfEsts?: string };
type NasdaqCalendar = { data?: { rows?: NasdaqRow[] } };
type ForexFactoryEvent = { title?: string; country?: string; date?: string; impact?: string; forecast?: string; previous?: string };

function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
function marketCap(value: string | undefined) {
  const raw = value ?? "";
  const amount = Number(raw.replace(/[^0-9.]/g, "")) || 0;
  if (/T/i.test(raw)) return amount * 1_000_000_000_000;
  if (/B/i.test(raw)) return amount * 1_000_000_000;
  if (/M/i.test(raw)) return amount * 1_000_000;
  return amount;
}
function marketTime(value: string | undefined) {
  if (value === "time-before-market" || value === "time-pre-market") return "장 시작 전";
  if (value === "time-after-hours" || value === "time-after-market") return "장 마감 후";
  if (value === "time-during-market" || value === "time-during-hours") return "장중";
  return "발표 시간 미공개";
}

const MACRO_NAMES: Record<string, string> = {
  "CPI m/m": "소비자물가(CPI) 전월비", "CPI y/y": "소비자물가(CPI) 전년비", "Core CPI m/m": "근원 CPI 전월비", "Core CPI y/y": "근원 CPI 전년비",
  "PPI m/m": "생산자물가(PPI) 전월비", "Core PPI m/m": "근원 PPI 전월비", "Main Refinancing Rate": "ECB 기준금리 결정", "Monetary Policy Statement": "ECB 통화정책 성명", "ECB Press Conference": "ECB 기자회견",
  "Unemployment Claims": "신규 실업수당 청구건수", "Existing Home Sales": "기존주택판매", "Natural Gas Storage": "EIA 천연가스 재고", "Crude Oil Inventories": "EIA 원유 재고",
  "ADP Weekly Employment Change": "ADP 주간 고용변화", "Prelim UoM Consumer Sentiment": "소비자심리지수", "Prelim UoM Inflation Expectations": "기대인플레이션",
  "10-y Bond Auction": "미국채 10년물 입찰", "3-y Bond Auction": "미국채 3년물 입찰", "30-y Bond Auction": "미국채 30년물 입찰",
};

function macroEvent(event: ForexFactoryEvent) {
  const title = event.title ?? "";
  const matched = MACRO_NAMES[title] ?? (title.includes("Bond Auction") ? title.replace("Bond Auction", "국채 입찰") : null);
  if (!matched || !event.date) return null;
  const instant = new Date(event.date);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const time = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(instant);
  return { date, time, title: matched, country: event.country === "EUR" ? "유럽" : "미국", forecast: event.forecast || "—", previous: event.previous || "—", impact: event.impact ?? "Low" };
}

function weeklyCoreMacro(start: Date) {
  const day = (offset: number) => {
    const value = new Date(start);
    value.setUTCDate(value.getUTCDate() + offset);
    return isoDate(value);
  };
  // The free source can temporarily rate-limit. These recurring releases keep
  // the weekly planner useful without pretending that forecast values are live.
  return [
    { date: day(2), time: "23:30", title: "EIA 원유 재고", country: "미국", forecast: "발표 대기", previous: "원본 연결 후 표시", impact: "High" },
    { date: day(3), time: "22:30", title: "신규 실업수당 청구건수", country: "미국", forecast: "발표 대기", previous: "원본 연결 후 표시", impact: "High" },
    { date: day(3), time: "23:30", title: "EIA 천연가스 재고", country: "미국", forecast: "발표 대기", previous: "원본 연결 후 표시", impact: "Medium" },
  ];
}

export async function GET(request: NextRequest) {
  const rawStart = request.nextUrl.searchParams.get("start") ?? isoDate(new Date());
  const start = new Date(`${rawStart}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return NextResponse.json({ message: "일정을 확인할 날짜가 올바르지 않습니다." }, { status: 400 });
  const mondayOffset = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - mondayOffset);
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setUTCDate(start.getUTCDate() + index); return date; });
  const responses = await Promise.allSettled(days.map(async (date) => {
    const response = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${isoDate(date)}`, {
      headers: { Accept: "application/json, text/plain, */*", "User-Agent": "Mozilla/5.0 Replay-Investing/1.0", Referer: "https://www.nasdaq.com/" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) throw new Error("CALENDAR_UNAVAILABLE");
    const data = (await response.json()) as NasdaqCalendar;
    const items = (data.data?.rows ?? []).map((row) => ({
      date: isoDate(date), symbol: row.symbol ?? "", name: row.name ?? "이름 미상", time: marketTime(row.time),
      estimate: row.epsForecast ?? "—", fiscalQuarter: row.fiscalQuarterEnding ?? "—", estimateCount: row.noOfEsts ?? "—", marketCap: marketCap(row.marketCap),
    })).filter((item) => item.symbol).sort((a, b) => b.marketCap - a.marketCap).slice(0, 40);
    return { date: isoDate(date), items };
  }));
  const calendar = responses.flatMap((item, index) => item.status === "fulfilled" ? [item.value] : [{ date: isoDate(days[index]), items: [] }]);
  const now = new Date(); const currentMonday = new Date(now); currentMonday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  let macro: NonNullable<ReturnType<typeof macroEvent>>[] = [];
  if (isoDate(currentMonday) === isoDate(start)) {
    try {
      const response = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", { headers: { "User-Agent": "Mozilla/5.0 Replay-Investing/1.0", Accept: "application/json" }, next: { revalidate: 900 } });
      if (response.ok) macro = ((await response.json()) as ForexFactoryEvent[]).flatMap((event) => { const item = macroEvent(event); return item ? [item] : []; });
    } catch { /* Earnings calendar remains usable when the free macro feed is unavailable. */ }
    if (!macro.length) macro = weeklyCoreMacro(start);
  }
  return NextResponse.json({ start: isoDate(start), end: isoDate(days.at(-1)!), days: calendar, macro, source: "Nasdaq 실적 캘린더 · Forex Factory 경제 캘린더" }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=900" } });
}
