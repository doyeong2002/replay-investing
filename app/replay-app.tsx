"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  WATCHLIST_CATEGORY_LABELS,
  WATCHLIST_CATEGORY_ORDER,
} from "@/constants/watchlist";
import { useWatchlist } from "@/hooks/use-watchlist";
import type {
  StockCandle,
  WatchlistCategory,
  WatchlistItem,
} from "@/types/watchlist";

type Market = "KR" | "US";
type Holding = {
  symbol: string;
  name: string;
  market: Market;
  currency: "KRW" | "USD";
  quantity: number;
  averagePrice: number;
  lastPrice: number;
  valueNative: number;
  valueKrw: number;
  profitLossKrw: number;
  returnRate: number;
};
type View =
  | "dashboard"
  | "indices"
  | "watchlist"
  | "rehearsal"
  | "review"
  | "analysis"
  | "radar"
  | "calendar";
type CurrencyDisplay = "USD" | "KRW";
type ChartPeriod = "1D" | "1W" | "1M" | "3M" | "1Y";
type StockNewsItem = {
  title: string;
  link: string;
  publishedAt: string;
  source: string;
  summary: string;
  topic: string;
};
type CloseReference = { previousClose: number; dayBeforeClose: number };
type AccountMove = {
  amountKrw: number;
  percent: number;
  available: boolean;
  coverage: number;
};
type AccountTrendPoint = { timestamp: string; value: number };
type IndexItem = {
  id: string;
  nameKo: string;
  symbol: string;
  group: string;
  unit: string;
  price: number | null;
  previousClose: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  history: number[];
  historyPoints: Array<{ timestamp: string; value: number }>;
  updatedAt: string | null;
  source: string;
  delayed: boolean;
};
type SentimentItem = {
  id: "CNN" | "CRYPTO";
  nameKo: string;
  market: string;
  score: number | null;
  classification: string;
  previousScore: number | null;
  updatedAt: string | null;
  source: string;
  sourceUrl: string;
};
type IndexNewsItem = {
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  summary: string;
};
type EarningsEntry = {
  date: string;
  estimated: boolean;
  quarter: string;
  consensus: number | null;
  actual: number | null;
  surprise: number | null;
  revenueEstimate: string | null;
  revenueActual: string | null;
  reaction: number | null;
  reportClose: number | null;
  nextClose: number | null;
};
type EarningsResult = {
  symbol: string;
  status: "available" | "unavailable";
  message: string | null;
  upcoming: EarningsEntry | null;
  history: EarningsEntry[];
  financials: {
    period: string | null; revenue: string | null; revenueEstimate: string | null;
    operatingIncome: string | null; operatingIncomeEstimate: string | null;
    grossMargin: number | null; grossMarginEstimate: number | null;
  } | null;
  volatility: { daily: number | null; annual: number | null; earningsMove: number | null };
  source: string;
};
type CalendarEvent = { date: string; symbol: string; name: string; time: string; estimate: string; fiscalQuarter: string; estimateCount: string; marketCap: number };
type CalendarDay = { date: string; items: CalendarEvent[] };
type MacroEvent = { date: string; time: string; title: string; country: string; forecast: string; previous: string; impact: string };
type WeekCalendarResult = { start: string; end: string; days: CalendarDay[]; macro: MacroEvent[]; source: string };
type StockAnalysisResult = {
  connected: boolean;
  symbol: string;
  name: string;
  currency: "KRW" | "USD";
  updatedAt: string;
  price: number;
  dayChange: number | null;
  rsi: number | null;
  sma20: number | null;
  support: number;
  resistance: number;
  analystTarget: { average: number; low: number; high: number; analystCount: number } | null;
  source: string;
  news: StockNewsItem[];
  analysis: {
    verdict: "관망" | "분할 접근" | "주의";
    summary: string;
    positives: string[];
    risks: string[];
    checklist: string[];
  };
};
type RiskFactor = {
  key: string;
  label: string;
  value: string;
  impact: number;
  explanation: string;
};
type AiRiskAnalysis = {
  connected: boolean;
  message?: string;
  adjustment: number;
  summary: string;
  risks: string[];
  positives: string[];
  positions: Array<{
    symbol: string;
    stance: "positive" | "neutral" | "negative";
    impact: number;
    reason: string;
  }>;
  sources: Array<{ title: string; url: string }>;
  updatedAt: string;
};
type WeeklyPlan = {
  generatedAt: string;
  method: string;
  summary: string;
  disclaimer: string;
  actions: Array<{
    symbol: string;
    name: string;
    price: number | null;
    rsi: number | null;
    sma20: number | null;
    support: number | null;
    resistance: number | null;
    weight: number;
    action: string;
    reason: string;
  }>;
  candidates: Array<{
    symbol: string;
    name: string;
    price: number | null;
    rsi: number | null;
    support: number | null;
    resistance: number | null;
    setup: string;
    reason: string;
  }>;
};

const KRW_PER_USD = 1385;
const LEVERAGED_SYMBOLS = new Set([
  "BULZ",
  "SOXL",
  "SOXS",
  "TQQQ",
  "SQQQ",
  "UPRO",
  "SPXU",
  "TECL",
  "TECS",
  "FNGU",
  "FNGD",
  "TSLL",
  "TSLQ",
  "MSTU",
  "MSTX",
  "BITX",
]);
const CRYPTO_PROXY_SYMBOLS = new Set([
  "MSTR",
  "BITO",
  "IBIT",
  "FBTC",
  "GBTC",
  "ARKB",
  "MARA",
  "RIOT",
  "COIN",
  "CLSK",
  "HUT",
  "BITX",
  "MSTU",
  "MSTX",
]);
const won = (value: number) => `₩${Math.round(value).toLocaleString("ko-KR")}`;
const nativeMoney = (value: number, market: Market) =>
  market === "KR"
    ? won(value)
    : `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const portfolioMoney = (
  valueKrw: number,
  exchangeRate: number,
  display: CurrencyDisplay,
) => {
  const usd = `$${(valueKrw / exchangeRate).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return display === "KRW" ? won(valueKrw) : usd;
};
const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
const isPrivateAppHost = (hostname: string) =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname.endsWith(".ts.net") ||
  (() => {
    const parts = hostname.split(".").map(Number);
    return (
      parts.length === 4 &&
      parts[0] === 100 &&
      parts[1] >= 64 &&
      parts[1] <= 127
    );
  })();

function StockLogo({
  ticker,
  name,
  size = "normal",
}: {
  ticker: string;
  name: string;
  size?: "normal" | "large";
}) {
  const [failed, setFailed] = useState(false);
  const symbol = ticker.trim().toUpperCase();
  // 외부 종목도 즉시 표시해야 하므로 티커 기반 원격 로고를 그대로 사용하고 실패 시 이니셜로 대체한다.
  return (
    <span className={`stock-logo ${size}`} aria-hidden="true">
      {failed || /^\d+$/.test(symbol) ? (
        <b>{name.trim().slice(0, 1) || symbol.slice(0, 1)}</b>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol)}.png`}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

function SwipeToCloseHandle({ onClose }: { onClose: () => void }) {
  const startY = useRef<number | null>(null);
  const lastY = useRef(0);
  const startedAt = useRef(0);
  const drawerFor = (target: HTMLElement) =>
    target.closest("aside") as HTMLElement | null;
  const reset = (drawer: HTMLElement | null) => {
    if (!drawer) return;
    drawer.style.transition = "transform .2s ease";
    drawer.style.transform = "translateY(0)";
    window.setTimeout(() => {
      drawer.style.transition = "";
      drawer.style.transform = "";
    }, 210);
  };
  const finish = (target: HTMLElement) => {
    if (startY.current === null) return;
    const distance = Math.max(0, lastY.current - startY.current);
    const quickSwipe = distance >= 28 && Date.now() - startedAt.current < 260;
    startY.current = null;
    if (distance >= 56 || quickSwipe) onClose();
    else reset(drawerFor(target));
  };
  return (
    <button
      type="button"
      className="drawer-handle"
      aria-label="아래로 끌어 상세 화면 닫기"
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClose();
        }
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "touch") return;
        startY.current = event.clientY;
        lastY.current = event.clientY;
        startedAt.current = Date.now();
        event.currentTarget.setPointerCapture(event.pointerId);
        const drawer = drawerFor(event.currentTarget);
        if (drawer) drawer.style.transition = "none";
      }}
      onPointerMove={(event) => {
        if (event.pointerType === "touch" || startY.current === null) return;
        lastY.current = event.clientY;
        const distance = Math.max(0, event.clientY - startY.current);
        const drawer = drawerFor(event.currentTarget);
        if (drawer) drawer.style.transform = `translateY(${distance}px)`;
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "touch") return;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        finish(event.currentTarget);
      }}
      onPointerCancel={(event) => {
        if (event.pointerType === "touch") return;
        startY.current = null;
        reset(drawerFor(event.currentTarget));
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (!touch) return;
        startY.current = touch.clientY;
        lastY.current = touch.clientY;
        startedAt.current = Date.now();
        const drawer = drawerFor(event.currentTarget);
        if (drawer) drawer.style.transition = "none";
      }}
      onTouchMove={(event) => {
        if (startY.current === null) return;
        const touch = event.touches[0];
        if (!touch) return;
        event.preventDefault();
        lastY.current = touch.clientY;
        const distance = Math.max(0, touch.clientY - startY.current);
        const drawer = drawerFor(event.currentTarget);
        if (drawer) drawer.style.transform = `translateY(${distance}px)`;
      }}
      onTouchEnd={(event) => finish(event.currentTarget)}
      onTouchCancel={(event) => {
        startY.current = null;
        reset(drawerFor(event.currentTarget));
      }}
    >
      <span />
    </button>
  );
}

export default function ReplayApp() {
  const [view, setView] = useState<View>("dashboard");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [apiState, setApiState] = useState<
    "demo" | "loading" | "connected" | "error"
  >("demo");
  const [apiMessage, setApiMessage] = useState(
    "토스 계좌를 연결하면 실제 보유 종목을 표시합니다",
  );
  const [buyingPower, setBuyingPower] = useState(0);
  const [buyingPowerKrw, setBuyingPowerKrw] = useState(0);
  const [buyingPowerUsd, setBuyingPowerUsd] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(KRW_PER_USD);
  const [currencyDisplay, setCurrencyDisplay] =
    useState<CurrencyDisplay>("KRW");
  const [toast, setToast] = useState("");
  const [closeReferences, setCloseReferences] = useState<
    Record<string, CloseReference>
  >({});

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [view]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem("replay:theme");
        setTheme(saved === "dark" ? "dark" : "light");
      } catch {}
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("replay:theme", theme); } catch {}
  }, [theme]);

  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 2600);
      return () => clearTimeout(id);
    }
  }, [toast]);
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const saved = localStorage.getItem("replay:currency-display");
        if (saved === "USD" || saved === "KRW") setCurrencyDisplay(saved);
      } catch {}
    }, 0);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("replay:currency-display", currencyDisplay);
    } catch {}
  }, [currencyDisplay]);
  useEffect(() => {
    if (!isPrivateAppHost(window.location.hostname)) return;
    const refresh = () => {
      if (document.visibilityState === "visible")
        void connectToss({ silent: true });
    };
    const initial = setTimeout(refresh, 500);
    const interval = setInterval(refresh, 10_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const holdingSymbols = useMemo(
    () =>
      [
        ...new Set(
          holdings.map((holding) => holding.symbol.trim().toUpperCase()),
        ),
      ]
        .sort()
        .join(","),
    [holdings],
  );
  useEffect(() => {
    if (!holdingSymbols) return;
    let active = true;
    const loadReferences = async () => {
      const symbols = holdingSymbols.split(",");
      const isLocal = ["localhost", "127.0.0.1"].includes(
        window.location.hostname,
      );
      const priceBase = isLocal
        ? "http://127.0.0.1:8000/api/toss/prices"
        : "/api/toss/prices";
      const candleBase = isLocal
        ? "http://127.0.0.1:8000/api/toss/candles"
        : "/api/toss/candles";
      const batches = Array.from(
        { length: Math.ceil(symbols.length / 25) },
        (_, index) => symbols.slice(index * 25, index * 25 + 25),
      );
      const priceGroups = await Promise.all(
        batches.map(async (batch) => {
          const response = await fetch(
            `${priceBase}?symbols=${encodeURIComponent(batch.join(","))}&refresh=${Date.now()}`,
            { cache: "no-store" },
          );
          const data = (await response.json()) as {
            connected: boolean;
            prices?: Array<{
              symbol: string;
              timestamp?: string;
              lastPrice: string;
            }>;
          };
          if (!response.ok || !data.connected)
            throw new Error("PRICE_REFERENCE_FAILED");
          return data.prices ?? [];
        }),
      );
      const prices = priceGroups.flat();
      const entries: Array<[string, CloseReference]> = [];
      for (let index = 0; index < symbols.length; index += 6) {
        const group = symbols.slice(index, index + 6);
        const groupEntries = await Promise.all(
          group.map(async (symbol) => {
            const response = await fetch(
              `${candleBase}?symbol=${encodeURIComponent(symbol)}&interval=1d&count=4`,
              { cache: "no-store" },
            );
            const data = (await response.json()) as {
              connected: boolean;
              candles?: Array<{ timestamp: string; closePrice: string }>;
            };
            if (!response.ok || !data.connected) return null;
            const candles = data.candles ?? [];
            const quote = prices.find(
              (price) => price.symbol.trim().toUpperCase() === symbol,
            );
            const quoteDate = String(quote?.timestamp ?? "").slice(0, 10);
            const latestDate = String(candles[0]?.timestamp ?? "").slice(0, 10);
            const previousIndex = quoteDate && quoteDate === latestDate ? 1 : 0;
            const previousClose = Number(
              candles[previousIndex]?.closePrice ?? 0,
            );
            const dayBeforeClose = Number(
              candles[previousIndex + 1]?.closePrice ?? 0,
            );
            return previousClose > 0 && dayBeforeClose > 0
              ? ([symbol, { previousClose, dayBeforeClose }] as [
                  string,
                  CloseReference,
                ])
              : null;
          }),
        );
        entries.push(
          ...groupEntries.filter(
            (entry): entry is [string, CloseReference] => entry !== null,
          ),
        );
      }
      if (active) setCloseReferences(Object.fromEntries(entries));
    };
    void loadReferences().catch(() => {
      if (active) setCloseReferences({});
    });
    return () => {
      active = false;
    };
  }, [holdingSymbols]);

  const holdingsValue = holdings.reduce((sum, h) => sum + h.valueKrw, 0);
  const totalAssets = holdingsValue + buyingPower;
  const totalProfitLoss = holdings.reduce((sum, h) => sum + h.profitLossKrw, 0);
  const investedCost = holdingsValue - totalProfitLoss;
  const portfolioReturn = investedCost
    ? (totalProfitLoss / investedCost) * 100
    : 0;
  const biggestWeight = holdingsValue
    ? Math.max(...holdings.map((h) => (h.valueKrw / totalAssets) * 100))
    : 0;
  const accountMoves = useMemo(() => {
    const covered = holdings.filter(
      (holding) => closeReferences[holding.symbol.toUpperCase()],
    );
    const coveredValue = covered.reduce(
      (sum, holding) => sum + holding.valueKrw,
      0,
    );
    const coverage = holdingsValue ? (coveredValue / holdingsValue) * 100 : 0;
    const calculate = (period: "today" | "previous"): AccountMove => {
      const amountKrw = covered.reduce((sum, holding) => {
        const reference = closeReferences[holding.symbol.toUpperCase()];
        const rate = holding.currency === "USD" ? exchangeRate : 1;
        const change =
          period === "today"
            ? holding.lastPrice - reference.previousClose
            : reference.previousClose - reference.dayBeforeClose;
        return sum + change * holding.quantity * rate;
      }, 0);
      const baseHoldings = covered.reduce((sum, holding) => {
        const reference = closeReferences[holding.symbol.toUpperCase()];
        const rate = holding.currency === "USD" ? exchangeRate : 1;
        const base =
          period === "today"
            ? reference.previousClose
            : reference.dayBeforeClose;
        return sum + base * holding.quantity * rate;
      }, 0);
      const baseAccount = baseHoldings + buyingPower;
      return {
        amountKrw,
        percent: baseAccount ? (amountKrw / baseAccount) * 100 : 0,
        available: covered.length > 0,
        coverage,
      };
    };
    return { previous: calculate("previous"), today: calculate("today") };
  }, [holdings, closeReferences, exchangeRate, holdingsValue, buyingPower]);

  async function connectToss(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      setApiState("loading");
      setApiMessage("토스증권 조회 전용 연결 확인 중…");
    }
    try {
      const isLoopback = ["localhost", "127.0.0.1"].includes(
        window.location.hostname,
      );
      const endpoint = isLoopback
        ? "http://127.0.0.1:8000/api/toss/snapshot"
        : "/api/toss/snapshot";
      const res = await fetch(`${endpoint}?refresh=${Date.now()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        connected: boolean;
        message?: string;
        holdings?: Array<Record<string, unknown>>;
        buyingPower?: { krw?: string; usd?: string };
        exchangeRate?: string;
      };
      if (!res.ok || !data.connected)
        throw new Error(data.message || "연결에 실패했습니다.");
      const liveExchangeRate = Number(data.exchangeRate) || KRW_PER_USD;
      setExchangeRate(liveExchangeRate);
      setHoldings(
        Array.isArray(data.holdings)
          ? data.holdings.map((h: Record<string, unknown>) => {
              const marketValue = h.marketValue as
                { amount?: string } | undefined;
              const profitLoss = h.profitLoss as
                { amount?: string; rate?: string } | undefined;
              const currency = h.currency === "USD" ? "USD" : "KRW";
              const valueNative = Number(marketValue?.amount || 0);
              const returnRate = Number(profitLoss?.rate || 0) * 100;
              const reportedProfit = Number(profitLoss?.amount);
              const derivedProfit =
                returnRate > -100
                  ? valueNative - valueNative / (1 + returnRate / 100)
                  : 0;
              const profitNative = Number.isFinite(reportedProfit)
                ? reportedProfit
                : derivedProfit;
              return {
                symbol: String(h.symbol),
                name: String(h.name),
                market: h.marketCountry === "KR" ? "KR" : "US",
                currency,
                quantity: Number(h.quantity),
                averagePrice: Number(h.averagePurchasePrice),
                lastPrice: Number(h.lastPrice),
                valueNative,
                valueKrw:
                  valueNative * (currency === "USD" ? liveExchangeRate : 1),
                profitLossKrw:
                  profitNative * (currency === "USD" ? liveExchangeRate : 1),
                returnRate,
              };
            })
          : [],
      );
      const availableKrw = Number(data.buyingPower?.krw ?? 0);
      const availableUsd = Number(data.buyingPower?.usd ?? 0);
      setBuyingPowerKrw(availableKrw);
      setBuyingPowerUsd(availableUsd);
      setBuyingPower(availableKrw + availableUsd * liveExchangeRate);
      const refreshedAt = new Intl.DateTimeFormat("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date());
      setApiState("connected");
      setApiMessage(
        `토스 API 연결 · 10초 자동 갱신 · ${refreshedAt} 갱신 · 실거래 잠금`,
      );
      if (!options.silent) setToast("계좌 조회가 완료됐습니다.");
    } catch (error) {
      setApiState("error");
      setApiMessage(
        error instanceof Error ? error.message : "연결 설정을 확인해 주세요.",
      );
      if (!options.silent)
        setToast("연결되지 않아 마지막 데이터를 유지합니다.");
    }
  }
  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("dashboard")}>
          <span className="brand-mark">R</span>
          <span>Replay</span>
        </button>
        <nav className="nav-links" aria-label="주요 메뉴">
          <button
            className={view === "dashboard" ? "active" : ""}
            onClick={() => setView("dashboard")}
          >
            포트폴리오
          </button>
          <button
            className={view === "indices" ? "active" : ""}
            onClick={() => setView("indices")}
          >
            지수
          </button>
          <button
            className={view === "watchlist" ? "active" : ""}
            onClick={() => setView("watchlist")}
          >
            관심종목
          </button>
          <button
            className={view === "review" ? "active" : ""}
            onClick={() => setView("review")}
          >
            점검
          </button>
          <button
            className={view === "analysis" ? "active" : ""}
            onClick={() => setView("analysis")}
          >
            AI 종목 분석
          </button>
          <button
            className={view === "rehearsal" ? "active" : ""}
            onClick={() => setView("rehearsal")}
          >
            리스크 리허설
          </button>
          <button
            className={view === "radar" ? "active" : ""}
            onClick={() => setView("radar")}
          >
            실적
          </button>
          <button
            className={view === "calendar" ? "active" : ""}
            onClick={() => setView("calendar")}
          >
            일정
          </button>
        </nav>
        <div className="top-actions">
          <button className="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "라이트 모드로 변경" : "다크 모드로 변경"}>
            {theme === "dark" ? "☀ 라이트" : "◐ 다크"}
          </button>
          <button
            className={`connection ${apiState}`}
            onClick={() => void connectToss()}
            disabled={apiState === "loading"}
          >
            <i />{" "}
            {apiState === "loading"
              ? "연결 중"
              : apiState === "connected"
                ? "10초 자동 갱신"
                : "토스 조회 연결"}
          </button>
          <button className="avatar" aria-label="사용자 메뉴">
            DS
          </button>
        </div>
      </header>
      <div className="safety-strip">
        <div className="safety-summary">
          <span className="safety-mode">
            <i>✓</i> 조회·분석 전용
          </span>
          <span className="safety-lock">🔒 실거래 차단</span>
        </div>
        <span className={`api-note ${apiState}`}>{apiMessage}</span>
      </div>
      <div className="page">
        {view === "dashboard" && (
          <Dashboard
            holdings={holdings}
            totalAssets={totalAssets}
            holdingsValue={holdingsValue}
            investedCost={investedCost}
            totalProfitLoss={totalProfitLoss}
            buyingPower={buyingPower}
            buyingPowerKrw={buyingPowerKrw}
            buyingPowerUsd={buyingPowerUsd}
            exchangeRate={exchangeRate}
            currencyDisplay={currencyDisplay}
            onCurrencyDisplay={setCurrencyDisplay}
            portfolioReturn={portfolioReturn}
            accountMoves={accountMoves}
            biggestWeight={biggestWeight}
          />
        )}
        {view === "indices" && <IndicesView />}
        {view === "watchlist" && (
          <WatchlistView
            holdings={holdings}
            exchangeRate={exchangeRate}
          />
        )}
        {view === "rehearsal" && <RiskRehearsalView />}
        {view === "review" && (
          <ReviewView
            holdings={holdings}
            totalAssets={totalAssets}
            cashRatio={totalAssets ? (buyingPower / totalAssets) * 100 : 0}
            biggestWeight={biggestWeight}
            accountMove={accountMoves.today}
          />
        )}
        {view === "analysis" && <AiAnalysisView />}
        {view === "radar" && <EarningsView />}
        {view === "calendar" && <WeeklyCalendarView holdings={holdings} />}
      </div>
      {toast && (
        <div className="toast" role="status">
          ✓ {toast}
        </div>
      )}
      <nav className="mobile-nav" aria-label="모바일 주요 메뉴">
        {(
          [
            ["dashboard", "포트폴리오", "◫"],
            ["indices", "지수", "⌑"],
            ["watchlist", "관심종목", "☆"],
            ["review", "점검", "✓"],
            ["analysis", "AI 분석", "✦"],
            ["rehearsal", "리허설", "◌"],
            ["radar", "실적", "◫"],
            ["calendar", "일정", "◷"],
          ] as const
        ).map(([value, label, icon]) => (
          <button
            key={value}
            className={view === value ? "active" : ""}
            onClick={() => setView(value)}
          >
            <span>{icon}</span>
            <b>{label}</b>
          </button>
        ))}
      </nav>
    </main>
  );
}

function useTouchChartCursor(length: number) {
  const [cursor, setCursor] = useState<number | null>(null);
  const chartRef = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (cursor === null) return;
    const clearOutsideChart = (event: PointerEvent) => {
      if (!chartRef.current?.contains(event.target as Node)) setCursor(null);
    };
    const clearOnScroll = () => setCursor(null);
    document.addEventListener("pointerdown", clearOutsideChart, true);
    document.addEventListener("scroll", clearOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", clearOutsideChart, true);
      document.removeEventListener("scroll", clearOnScroll, true);
    };
  }, [cursor]);
  const updateCursor = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (length < 2) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    setCursor(Math.round(ratio * (length - 1)));
  };
  return {
    cursor,
    chartRef,
    handlers: {
      onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        updateCursor(event);
      },
      onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => {
        if (!event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
        event.stopPropagation();
        updateCursor(event);
      },
      onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      },
      onPointerCancel: () => setCursor(null),
      onClick: (event: ReactMouseEvent<SVGSVGElement>) => {
        event.stopPropagation();
      },
    },
  };
}

function chartMoment(value: string, withTime = false) {
  return new Intl.DateTimeFormat(
    "ko-KR",
    withTime
      ? { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }
      : { month: "numeric", day: "numeric" },
  ).format(new Date(value));
}

function ChartCursorCard({
  x,
  y,
  width,
  date,
  value,
}: {
  x: number;
  y: number;
  width: number;
  date: string;
  value: string;
}) {
  return (
    <g className="chart-cursor-card">
      <rect x={x} y={y} width={width} height="32" rx="6" />
      <text className="chart-cursor-date" x={x + 8} y={y + 12}>
        {date}
      </text>
      <text className="chart-cursor-value" x={x + 8} y={y + 25}>
        {value}
      </text>
    </g>
  );
}

function IndexSparkline({
  points: historyPoints,
  positive,
}: {
  points: Array<{ timestamp: string; value: number }>;
  positive: boolean;
}) {
  const { cursor, handlers, chartRef } = useTouchChartCursor(historyPoints.length);
  const values = historyPoints.map((point) => point.value);
  if (values.length < 2)
    return <div className="index-chart-empty">차트 준비 중</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map(
      (value, index) =>
        `${(index / (values.length - 1)) * 220},${74 - ((value - min) / range) * 62}`,
    )
    .join(" ");
  const area = `0,78 ${points} 220,78`;
  const selected = cursor === null ? null : {
    value: values[cursor],
    timestamp: historyPoints[cursor].timestamp,
    x: (cursor / (values.length - 1)) * 220,
    y: 74 - ((values[cursor] - min) / range) * 62,
  };
  return (
    <svg
      ref={chartRef}
      className={`index-sparkline ${positive ? "up" : "down"}`}
      viewBox="0 0 220 82"
      preserveAspectRatio="none"
      role="img"
      aria-label="최근 1개월 지수 흐름"
      {...handlers}
    >
      <polygon points={area} />
      <polyline points={points} />
      {selected && (
        <g className="chart-cursor">
          <line x1={selected.x} x2={selected.x} y1="39" y2="78" />
          <circle cx={selected.x} cy={selected.y} r="3" />
          <ChartCursorCard
            x={Math.min(124, Math.max(4, selected.x - 46))}
            y={3}
            width={92}
            date={chartMoment(selected.timestamp)}
            value={selected.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          />
        </g>
      )}
    </svg>
  );
}

function AccountTrendChart({ points: trendPoints }: { points: AccountTrendPoint[] }) {
  const { cursor, handlers, chartRef } = useTouchChartCursor(trendPoints.length);
  const values = trendPoints.map((point) => point.value);
  if (values.length < 2)
    return <div className="account-trend-empty">계좌 추이를 계산하는 중…</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map(
      (value, index) =>
        `${(index / (values.length - 1)) * 420},${112 - ((value - min) / range) * 90}`,
    )
    .join(" ");
  const positive = values.at(-1)! >= values[0];
  const selected = cursor === null ? null : {
    value: values[cursor],
    timestamp: trendPoints[cursor].timestamp,
    x: (cursor / (values.length - 1)) * 420,
    y: 112 - ((values[cursor] - min) / range) * 90,
  };
  return (
    <svg
      ref={chartRef}
      className={`account-trend-chart ${positive ? "up" : "down"}`}
      viewBox="0 0 420 118"
      preserveAspectRatio="none"
      role="img"
      aria-label="최근 20거래일 추정 계좌 흐름"
      {...handlers}
    >
      <line x1="0" x2="420" y1="28" y2="28" />
      <line x1="0" x2="420" y1="70" y2="70" />
      <polygon points={`0,116 ${points} 420,116`} />
      <polyline points={points} />
      {selected && (
        <g className="chart-cursor">
          <line x1={selected.x} x2={selected.x} y1="42" y2="112" />
          <circle cx={selected.x} cy={selected.y} r="3.2" />
          <ChartCursorCard
            x={Math.min(294, Math.max(4, selected.x - 59))}
            y={4}
            width={122}
            date={chartMoment(selected.timestamp)}
            value={won(selected.value)}
          />
        </g>
      )}
    </svg>
  );
}

function DetailedIndexChart({
  points,
  positive,
  period,
}: {
  points: Array<{ timestamp: string; value: number }>;
  positive: boolean;
  period: ChartPeriod;
}) {
  const { cursor, handlers, chartRef } = useTouchChartCursor(points.length);
  if (points.length < 2)
    return <div className="index-detail-empty">차트 데이터가 부족합니다.</div>;
  const width = 390;
  const height = 220;
  const left = 9;
  const right = 67;
  const top = 14;
  const bottom = 30;
  const values = points.map((point) => point.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = (rawMax - rawMin) * 0.08 || rawMax * 0.01;
  const min = rawMin - padding;
  const max = rawMax + padding;
  const range = max - min || 1;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const coordinates = values.map((value, index) => ({
    x: left + (index / (values.length - 1)) * plotWidth,
    y: top + ((max - value) / range) * plotHeight,
  }));
  const polyline = coordinates
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
  const area = `M ${left} ${height - bottom} L ${coordinates.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${width - right} ${height - bottom} Z`;
  const levels = [max, (max + min) / 2, min];
  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat(
      "ko-KR",
      period === "1D"
        ? { hour: "2-digit", minute: "2-digit" }
        : { month: "numeric", day: "numeric" },
    ).format(new Date(value));
  const selected = cursor === null ? null : {
    ...coordinates[cursor],
    value: points[cursor].value,
    timestamp: points[cursor].timestamp,
  };
  return (
    <svg
      ref={chartRef}
      className={`index-detail-chart ${positive ? "up" : "down"}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${points.length}거래일 상세 차트`}
      {...handlers}
    >
      <defs>
        <linearGradient id="index-detail-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".28" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {levels.map((value, index) => {
        const y = top + (index * plotHeight) / 2;
        return (
          <g key={value}>
            <line x1={left} x2={width - right + 4} y1={y} y2={y} />
            <text x={width - right + 9} y={y + 3}>
              {value.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </text>
          </g>
        );
      })}
      <path d={area} fill="url(#index-detail-area)" />
      <polyline points={polyline} />
      <circle cx={coordinates.at(-1)!.x} cy={coordinates.at(-1)!.y} r="3.5" />
      {selected && (
        <g className="chart-cursor">
          <line x1={selected.x} x2={selected.x} y1={top + 39} y2={height - bottom} />
          <circle cx={selected.x} cy={selected.y} r="3.5" />
          <ChartCursorCard
            x={Math.min(width - right - 116, Math.max(left + 4, selected.x - 58))}
            y={top + 3}
            width={116}
            date={chartMoment(selected.timestamp, period === "1D")}
            value={`${selected.value.toLocaleString("en-US", { maximumFractionDigits: 2 })} pt`}
          />
        </g>
      )}
      <text className="date-label" x={left} y={height - 6}>
        {dateLabel(points[0].timestamp)}
      </text>
      <text className="date-label end" x={width - right} y={height - 6}>
        {dateLabel(points.at(-1)!.timestamp)}
      </text>
    </svg>
  );
}

function IndexDetailDrawer({
  item,
  onClose,
}: {
  item: IndexItem;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState<ChartPeriod>("1M");
  const [points, setPoints] = useState(item.historyPoints.slice(-22));
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState("");
  const [news, setNews] = useState<IndexNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch(`/api/index-news?id=${encodeURIComponent(item.id)}`)
      .then(async (response) => {
        const data = (await response.json()) as {
          items?: IndexNewsItem[];
          message?: string;
        };
        if (!response.ok)
          throw new Error(data.message || "뉴스를 불러오지 못했습니다.");
        if (active) setNews(data.items ?? []);
      })
      .catch((reason) => {
        if (active)
          setNewsError(
            reason instanceof Error
              ? reason.message
              : "뉴스를 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (active) setNewsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [item.id]);
  useEffect(() => {
    let active = true;
    void fetch(
      `/api/index-history?id=${encodeURIComponent(item.id)}&period=${period}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const data = (await response.json()) as {
          points?: Array<{ timestamp: string; value: number }>;
          message?: string;
        };
        if (!response.ok)
          throw new Error(data.message || "차트를 불러오지 못했습니다.");
        if (active) setPoints(data.points ?? []);
      })
      .catch((reason) => {
        if (active)
          setChartError(
            reason instanceof Error
              ? reason.message
              : "차트를 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (active) setChartLoading(false);
      });
    return () => {
      active = false;
    };
  }, [item.id, period]);
  const values = points.map((point) => point.value);
  const first = values[0];
  const last = values.at(-1);
  const periodChange = first && last ? ((last - first) / first) * 100 : null;
  const high = values.length ? Math.max(...values) : null;
  const low = values.length ? Math.min(...values) : null;
  const positive = (periodChange ?? item.changePercent ?? 0) >= 0;
  const price =
    item.price === null
      ? "—"
      : item.unit === "USD"
        ? `$${item.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
        : item.price.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
  const periodLabel =
    period === "1D"
      ? "일봉"
      : period === "1W"
        ? "1주"
        : period === "1M"
          ? "1개월"
          : period === "3M"
            ? "3개월"
            : "1년";
  const dayAmount =
    item.changeAmount === null
      ? null
      : `${item.changeAmount >= 0 ? "+" : ""}${item.changeAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })}${item.unit === "USD" ? "달러" : "포인트"}`;
  const selectPeriod = (value: ChartPeriod) => {
    setChartLoading(true);
    setChartError("");
    setPeriod(value);
  };
  return (
    <div
      className="drawer-backdrop index-detail-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="index-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${item.nameKo} 상세`}
      >
        <SwipeToCloseHandle onClose={onClose} />
        <header>
          <div>
            <span>{item.group}</span>
            <h2>{item.nameKo}</h2>
            <small>{item.symbol}</small>
          </div>
          <button onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <section className="index-detail-price">
          <div>
            <small>현재 지수</small>
            <strong>{price}</strong>
          </div>
          <span
            className={
              item.changePercent === null
                ? ""
                : item.changePercent >= 0
                  ? "positive"
                  : "negative"
            }
          >
            {item.changePercent === null ? (
              "전일 대비 확인 중"
            ) : (
              <>
                <b>전일 대비 {pct(item.changePercent)}</b>
                <small>{dayAmount}</small>
              </>
            )}
          </span>
        </section>
        <section className="index-detail-chart-wrap">
          <div className="index-period">
            <b>가격 흐름</b>
            <div className="portfolio-value-block">
              {(
                [
                  ["1D", "일봉"],
                  ["1W", "1주"],
                  ["1M", "1개월"],
                  ["3M", "3개월"],
                  ["1Y", "1년"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={period === value ? "active" : ""}
                  onClick={() => selectPeriod(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {chartLoading ? (
            <div className="index-detail-empty">
              {periodLabel} 차트를 불러오는 중…
            </div>
          ) : chartError ? (
            <div className="index-detail-empty error">{chartError}</div>
          ) : (
            <DetailedIndexChart
              points={points}
              positive={positive}
              period={period}
            />
          )}
          <div className="index-detail-stats">
            <span>
              <small>{periodLabel} 등락</small>
              <b
                className={
                  periodChange === null
                    ? ""
                    : positive
                      ? "positive"
                      : "negative"
                }
              >
                {periodChange === null ? "—" : pct(periodChange)}
              </b>
            </span>
            <span>
              <small>{periodLabel} 최고</small>
              <b>
                {high?.toLocaleString("en-US", { maximumFractionDigits: 2 }) ??
                  "—"}
              </b>
            </span>
            <span>
              <small>{periodLabel} 최저</small>
              <b>
                {low?.toLocaleString("en-US", { maximumFractionDigits: 2 }) ??
                  "—"}
              </b>
            </span>
          </div>
        </section>
        <section className="index-detail-source">
          <span>{item.source} · 차트 Yahoo Finance</span>
          <b>{item.delayed ? "지연 가능" : "실시간"}</b>
        </section>
        <section className="drawer-news index-news">
          <div className="drawer-section-title">
            <div>
              <small>MARKET NEWS</small>
              <h3>{item.nameKo} 최근 뉴스</h3>
            </div>
            <span>최근 3일</span>
          </div>
          {newsLoading ? (
            <div className="news-state">관련 뉴스를 모으는 중…</div>
          ) : newsError ? (
            <div className="news-state error">{newsError}</div>
          ) : news.length ? (
            <div className="news-list">
              {news.map((article) => (
                <a
                  href={article.link}
                  target="_blank"
                  rel="noreferrer"
                  key={`${article.link}-${article.publishedAt}`}
                >
                  <div>
                    <span>시장</span>
                    <time>{article.publishedAt}</time>
                  </div>
                  <b>{article.title}</b>
                  <p>{article.summary}</p>
                  <small>{article.source} · 원문 보기 ↗</small>
                </a>
              ))}
            </div>
          ) : (
            <div className="news-state">최근 관련 뉴스가 없습니다.</div>
          )}
          <p className="news-disclaimer">
            헤드라인 기반 영향 요약입니다. 투자 판단 전 원문을 확인하세요.
          </p>
        </section>
      </aside>
    </div>
  );
}

function IndicesView() {
  const [items, setItems] = useState<IndexItem[]>([]);
  const [sentiment, setSentiment] = useState<SentimentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<IndexItem | null>(null);
  useEffect(() => {
    let active = true;
    void fetch(`/api/indices?refresh=${Date.now()}`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { items?: IndexItem[] };
        if (!response.ok) throw new Error("지수를 불러오지 못했습니다.");
        if (active) {
          setItems(data.items ?? []);
          setError("");
        }
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "지수를 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    void fetch(`/api/market-sentiment?refresh=${Date.now()}`, {
      cache: "no-store",
    })
      .then(
        (response) => response.json() as Promise<{ items?: SentimentItem[] }>,
      )
      .then((data) => {
        if (active) setSentiment(data.items ?? []);
      })
      .catch(() => {
        if (active) setSentiment([]);
      });
    const timer = window.setTimeout(
      () => setRefreshKey((value) => value + 1),
      30_000,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [refreshKey]);
  const refresh = () => {
    setLoading(true);
    setRefreshKey((value) => value + 1);
  };
  const formatIndex = (item: IndexItem) =>
    item.price === null
      ? "—"
      : item.unit === "USD"
        ? `$${item.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
        : item.price.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
  const updated = items
    .map((item) => item.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  return (
    <section className="full-view indices-view">
      <div className="indices-head">
        <div>
          <p className="eyebrow">MARKET PULSE</p>
          <h1>주요 시장 지수</h1>
          <p>가격 흐름과 시장 참여자의 심리를 함께 확인하세요.</p>
        </div>
        <button
          className="indices-refresh"
          onClick={refresh}
          disabled={loading}
        >
          <span className={loading ? "spinning" : ""}>↻</span>
          {loading ? "갱신 중" : "지금 갱신"}
        </button>
      </div>
      {error && (
        <div className="indices-error">{error} 마지막 값을 유지합니다.</div>
      )}
      <div className="indices-status">
        <span>
          <i />
          {updated
            ? `${new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date(updated))} 기준`
            : "시세 연결 중"}
        </span>
        <b>30초 자동 갱신 · 카드를 눌러 상세 보기</b>
      </div>
      <section className="sentiment-section">
        <div className="sentiment-head">
          <div>
            <span>MARKET SENTIMENT</span>
            <h2>시장 심리</h2>
          </div>
          <small>0은 극도의 공포 · 100은 극도의 탐욕</small>
        </div>
        <div className="sentiment-grid">
          {sentiment.length ? (
            sentiment.map((item) => {
              const score = item.score;
              const delta =
                score !== null && item.previousScore !== null
                  ? score - item.previousScore
                  : null;
              return (
                <a
                  className="sentiment-card card"
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  key={item.id}
                >
                  <div>
                    <span>{item.market}</span>
                    <h3>{item.nameKo}</h3>
                    <small>{item.source} · 원문 보기 ↗</small>
                  </div>
                  <div className="sentiment-score">
                    <strong>{score === null ? "—" : Math.round(score)}</strong>
                    <b>{item.classification}</b>
                    {delta !== null && (
                      <small className={delta >= 0 ? "positive" : "negative"}>
                        전일 대비 {delta >= 0 ? "+" : ""}
                        {delta.toFixed(1)}점
                      </small>
                    )}
                  </div>
                  <div className="sentiment-scale">
                    <i
                      style={{
                        left: `${Math.max(0, Math.min(100, score ?? 50))}%`,
                      }}
                    />
                    <span>공포</span>
                    <span>중립</span>
                    <span>탐욕</span>
                  </div>
                </a>
              );
            })
          ) : (
            <div className="sentiment-loading card">
              CNN·크립토 시장 심리를 불러오는 중…
            </div>
          )}
        </div>
      </section>
      <div className="index-grid">
        {items.length ? (
          items.map((item) => {
            const positive = (item.changePercent ?? 0) >= 0;
            const amount =
              item.changeAmount === null
                ? ""
                : `${item.changeAmount >= 0 ? "+" : ""}${item.changeAmount.toLocaleString("en-US", { maximumFractionDigits: 2 })}${item.unit === "USD" ? "달러" : "pt"}`;
            return (
              <button
                type="button"
                className="index-card card"
                key={item.id}
                onClick={() => setSelected(item)}
              >
                <header>
                  <div>
                    <span>{item.group}</span>
                    <h2>
                      {item.nameKo}
                      {item.changePercent !== null && (
                        <b
                          className={
                            positive ? "positive" : "negative"
                          }
                        >
                          ({pct(item.changePercent)})
                        </b>
                      )}
                    </h2>
                    <small>{item.symbol}</small>
                  </div>
                  <div
                    className={`index-change ${item.changePercent === null ? "" : positive ? "positive" : "negative"}`}
                  >
                    {item.changePercent === null ? (
                      "전일 대비 확인 중"
                    ) : (
                      <>
                        <b>{amount}</b>
                        <small>전일 종가 대비</small>
                      </>
                    )}
                  </div>
                </header>
                <strong>{formatIndex(item)}</strong>
                <IndexSparkline points={item.historyPoints} positive={positive} />
                <footer>
                  <span>최근 1개월</span>
                  <span>
                    {item.source}
                    {item.delayed ? " · 지연 가능" : " · 실시간"}
                  </span>
                </footer>
              </button>
            );
          })
        ) : (
          <div className="indices-loading">주요 지수와 차트를 불러오는 중…</div>
        )}
      </div>
      <p className="indices-note">
        코스피·코스닥은 연결된 맥에서 토스증권 Open API를 우선 사용합니다. 해외
        지수는 거래소 정책에 따라 지연될 수 있어요. 공포·탐욕 지수는 투자 신호가
        아닌 심리 참고값입니다.
      </p>
      {selected && (
        <IndexDetailDrawer item={selected} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}

type StockSuggestion = { symbol: string; name: string; market: "US" | "KR" };

function StockAutocomplete({
  id,
  value,
  onChange,
  onPick,
  placeholder,
  market,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onPick: (symbol: string) => void;
  placeholder: string;
  market?: "US" | "KR";
}) {
  const [items, setItems] = useState<StockSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const lookupVersion = useRef(0);
  const skipNextLookup = useRef(false);
  useEffect(() => {
    const keyword = value.trim();
    if (!keyword) {
      lookupVersion.current += 1;
      const timer = window.setTimeout(() => { setItems([]); setOpen(false); }, 0);
      return () => window.clearTimeout(timer);
    }
    if (skipNextLookup.current) {
      skipNextLookup.current = false;
      const timer = window.setTimeout(() => setItems([]), 0);
      return () => window.clearTimeout(timer);
    }
    const version = ++lookupVersion.current;
    const timer = window.setTimeout(() => {
      void fetch(`/api/stock-suggest?q=${encodeURIComponent(keyword)}`, { cache: "no-store" })
        .then(async (response) => (await response.json()) as { items?: StockSuggestion[] })
        .then((data) => {
          if (version !== lookupVersion.current) return;
          setItems(market ? (data.items ?? []).filter((item) => item.market === market) : (data.items ?? []));
          setOpen(true);
        })
        .catch(() => { if (version === lookupVersion.current) setItems([]); });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [value, market]);
  return (
    <div className="stock-autocomplete">
      <input id={id} value={value} onChange={(event) => onChange(event.target.value)} onFocus={() => value.trim() && setOpen(true)} placeholder={placeholder} autoComplete="off" autoCapitalize="characters" aria-autocomplete="list" aria-expanded={open && items.length > 0} />
      {open && items.length > 0 && <div className="stock-suggestion-list" role="listbox">{items.map((item) => <button type="button" key={item.symbol} role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => { lookupVersion.current += 1; skipNextLookup.current = true; setItems([]); setOpen(false); onChange(item.symbol); onPick(item.symbol); }}><StockLogo ticker={item.symbol} name={item.name} /><span><b>{item.name}</b><small>{item.symbol} · {item.market === "US" ? "미국" : "국내"}</small></span></button>)}</div>}
    </div>
  );
}

function AiAnalysisView() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<StockAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const analyze = (nextQuery = query) => {
    const trimmed = nextQuery.trim();
    if (!trimmed || loading) return;
    setQuery(trimmed);
    setLoading(true);
    setError("");
    void fetch("/api/stock-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: trimmed }),
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json()) as StockAnalysisResult & {
          message?: string;
        };
        if (!response.ok)
          throw new Error(data.message || "종목 분석을 불러오지 못했습니다.");
        setResult(data);
      })
      .catch((reason) => {
        setResult(null);
        setError(
          reason instanceof Error
            ? reason.message
            : "종목 분석을 불러오지 못했습니다.",
        );
      })
      .finally(() => setLoading(false));
  };
  const price = (value: number | null) =>
    value === null
      ? "—"
      : result?.currency === "KRW"
        ? won(value)
        : `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return (
    <section className="full-view ai-analysis-view">
      <div className="view-header ai-analysis-header">
        <div>
          <p className="eyebrow">AI RESEARCH COPILOT</p>
          <h1>AI 종목 분석</h1>
          <p>현재가·기술 구간·최근 뉴스를 바탕으로 확인할 근거를 정리합니다.</p>
        </div>
        <span className="ai-analysis-safety">조회·분석 전용</span>
      </div>
      <form
        className="ai-analysis-search card"
        onSubmit={(event) => {
          event.preventDefault();
          analyze();
        }}
      >
        <label htmlFor="ai-stock-query">종목 검색</label>
        <div>
          <StockAutocomplete id="ai-stock-query" value={query} onChange={setQuery} onPick={analyze} placeholder="한글명 또는 티커" />
          <button className="primary-button" type="submit" disabled={loading || !query.trim()}>
            {loading ? "분석 중…" : "분석하기"}
          </button>
        </div>
        <section className="ai-analysis-examples" aria-label="빠른 종목 검색">
          <span>빠른 검색</span>
          {["아이렌", "MSTR", "BULZ", "NVDA", "엔비디아"].map((item) => (
            <button key={item} type="button" onClick={() => analyze(item)}>
              {item}
            </button>
          ))}
        </section>
      </form>
      {error && <div className="ai-analysis-error">{error}</div>}
      {!result && !loading && !error && (
        <div className="ai-analysis-empty card">
          <b>종목을 검색해 보세요</b>
          <p>현재 가격, RSI·지지/저항, 최근 뉴스와 함께 다음에 확인할 항목을 보여줍니다.</p>
        </div>
      )}
      {loading && (
        <div className="ai-analysis-empty card">
          <b>가격과 최근 뉴스를 확인하고 있어요</b>
          <p>Gemini 분석은 검색할 때만 실행됩니다.</p>
        </div>
      )}
      {result && (
        <div className="ai-analysis-result">
          <article className="ai-analysis-summary card">
            <header>
              <div>
                <StockLogo ticker={result.symbol} name={result.name} size="large" />
                <div>
                  <span>{result.symbol}</span>
                  <h2>{result.name}</h2>
                </div>
              </div>
              <b className={`ai-verdict ${result.analysis.verdict === "주의" ? "danger" : result.analysis.verdict === "분할 접근" ? "good" : "watch"}`}>
                {result.analysis.verdict}
              </b>
            </header>
            <div className="ai-analysis-price">
              <div>
                <small>현재가</small>
                <strong>{price(result.price)}</strong>
              </div>
              <span className={result.dayChange === null ? "" : result.dayChange >= 0 ? "positive" : "negative"}>
                {result.dayChange === null ? "전일 대비 확인 중" : `전일 대비 ${pct(result.dayChange)}`}
              </span>
            </div>
            <p>{result.analysis.summary}</p>
            <small className={result.connected ? "ai-source connected" : "ai-source"}>
              {result.connected ? "Gemini + 시장 데이터 분석" : "기술·뉴스 기반 분석"} · {result.source}
            </small>
          </article>
          <div className="ai-metric-grid">
            <article className="card"><span>RSI(14)</span><strong>{result.rsi?.toFixed(0) ?? "—"}</strong><small>70 이상 과열 · 30 이하 과매도 참고</small></article>
            <article className="card"><span>20일선</span><strong>{price(result.sma20)}</strong><small>현재가와 추세 위치를 비교</small></article>
            <article className="card"><span>20일 지지</span><strong>{price(result.support)}</strong><small>이탈 시 최초 근거 재점검</small></article>
            <article className="card"><span>20일 저항</span><strong>{price(result.resistance)}</strong><small>돌파 전 추격 진입 주의</small></article>
          </div>
          <section className="card ai-target-plan">
            <header><div><p className="eyebrow">ANALYST CONSENSUS</p><h2>애널리스트 목표가</h2></div><small>조회 전용</small></header>
            <div className="target-consensus">
              <article><span>시장 평균 목표가</span><strong>{result.analystTarget ? price(result.analystTarget.average) : "—"}</strong><small>{result.analystTarget ? `현재가 대비 ${pct(((result.analystTarget.average - result.price) / result.price) * 100)}` : "미국주식 컨센서스 확인 중"}</small></article>
              <article><span>목표가 범위</span><strong>{result.analystTarget ? `${price(result.analystTarget.low)} — ${price(result.analystTarget.high)}` : "—"}</strong><small>{result.analystTarget ? `${result.analystTarget.analystCount}명 애널리스트 기준` : "국내·ETF는 제공되지 않을 수 있음"}</small></article>
            </div>
            <p>시장 목표가는 애널리스트 컨센서스일 뿐 예측이나 매수 권유가 아닙니다.</p>
          </section>
          <div className="ai-analysis-columns">
            <article className="card ai-reason-card positive-card">
              <span>확인된 긍정 요인</span>
              <ul>{result.analysis.positives.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
            <article className="card ai-reason-card risk-card">
              <span>확인할 위험</span>
              <ul>{result.analysis.risks.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
          </div>
          <article className="card ai-checklist">
            <span>다음 행동 전에 확인</span>
            <ol>{result.analysis.checklist.map((item) => <li key={item}>{item}</li>)}</ol>
          </article>
          <section className="ai-analysis-news">
            <div className="section-heading"><div><p className="eyebrow">RECENT NEWS</p><h2>{result.symbol} 최근 뉴스</h2></div><span>최근 7일</span></div>
            {result.news.length ? <div className="news-list">{result.news.map((item) => <a key={item.link} href={item.link} target="_blank" rel="noreferrer"><div><span>뉴스</span><time>{item.publishedAt}</time></div><b>{item.title}</b><small>{item.source} · 원문 보기 ↗</small></a>)}</div> : <div className="ai-analysis-empty card"><b>최근 뉴스를 불러오지 못했습니다.</b><p>기술 구간과 본인의 투자 근거를 우선 확인하세요.</p></div>}
          </section>
          <p className="ai-analysis-disclaimer">이 분석은 매수·매도 추천이나 수익 보장이 아닙니다. 뉴스 원문, 실적, 비중과 손절 기준을 함께 확인하세요.</p>
        </div>
      )}
    </section>
  );
}

type StressFactor = "NASDAQ" | "BTC" | "DOW" | "SOX" | "VIX" | "OIL";
type StressReaction = {
  factor: { id: StressFactor; name: string; threshold: number; direction: "up" | "down" };
  symbol: string; period: string; samples: number; average: number | null; median: number | null;
  fallingRate: number | null; worst: number | null; best: number | null;
  latest: Array<{ date: string; factorChange: number; stockChange: number; stockClose: number }>;
  source: string;
};
const STRESS_FACTORS: Array<{ id: StressFactor; label: string; defaultThreshold: number }> = [
  { id: "NASDAQ", label: "나스닥", defaultThreshold: -3 },
  { id: "BTC", label: "비트코인", defaultThreshold: -3 },
  { id: "DOW", label: "다우존스", defaultThreshold: -3 },
  { id: "SOX", label: "필라델피아 반도체", defaultThreshold: -3 },
  { id: "VIX", label: "VIX 공포지수", defaultThreshold: 15 },
  { id: "OIL", label: "국제유가", defaultThreshold: -5 },
];
const QUICK_REHEARSAL_STOCKS: Record<StressFactor, string[]> = {
  NASDAQ: ["NVDA", "TSLA", "AAPL", "MSFT", "AMZN", "META"],
  BTC: ["MSTR", "COIN", "CRCL", "IREN", "MARA", "RIOT"],
  DOW: ["AAPL", "MSFT", "JPM", "V", "WMT", "JNJ"],
  SOX: ["NVDA", "AMD", "AVGO", "TSM", "MU", "ASML"],
  VIX: ["NVDA", "TSLA", "MSTR", "COIN", "SOXL", "TQQQ"],
  OIL: ["XOM", "CVX", "OXY", "SLB", "COP", "HAL"],
};

function RiskRehearsalView() {
  const [factor, setFactor] = useState<StressFactor>("NASDAQ");
  const [thresholdInput, setThresholdInput] = useState("0");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [result, setResult] = useState<StressReaction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const reactionRequestId = useRef(0);
  const selected = STRESS_FACTORS.find((item) => item.id === factor)!;
  const threshold = Number(thresholdInput);
  const load = (
    requestedQuery = query,
    requestedFactor = factor,
    requestedThreshold = threshold,
  ) => {
    const requestId = ++reactionRequestId.current;
    setLoading(true); setError("");
    setResult(null);
    void fetch(`/api/stress-reaction?factor=${requestedFactor}&threshold=${requestedThreshold}&symbol=${encodeURIComponent(requestedQuery.trim())}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as StressReaction & { message?: string };
        if (!response.ok) throw new Error(data.message || "과거 반응을 불러오지 못했습니다.");
        if (requestId === reactionRequestId.current) {
          setResult(data); setSubmittedQuery(data.symbol);
        }
      })
      .catch((reason) => {
        if (requestId === reactionRequestId.current)
          setError(reason instanceof Error ? reason.message : "과거 반응을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (requestId === reactionRequestId.current) setLoading(false);
      });
  };
  return (
    <section className="full-view rehearsal-view">
      <div className="view-header rehearsal-header"><div><p className="eyebrow">HISTORICAL REACTION · READ ONLY</p><h1>리스크 리허설</h1><p>“시장이 이만큼 움직였던 날, 이 종목은 평균 어떻게 반응했나”를 과거 일봉으로 확인합니다.</p></div></div>
      <article className="rehearsal-hero card">
        <div className="factor-tabs">{STRESS_FACTORS.map((item) => <button key={item.id} className={factor === item.id ? "active" : ""} onClick={() => { setFactor(item.id); setResult(null); }}><b>{item.label}</b></button>)}</div>
        <form className="reaction-search" onSubmit={(event) => { event.preventDefault(); const valid = threshold !== 0 && threshold >= -30 && threshold <= 100; if (!valid || !thresholdInput.trim()) { setError("변동률을 -30%~+100% 범위에서 0이 아니게 입력해 주세요."); return; } load(); }}>
          <label>시장 변동 기준 <div><input type="number" min="-30" max="100" step="0.1" value={thresholdInput} onChange={(event) => setThresholdInput(event.target.value)} /><b>% {threshold > 0 ? "상승" : threshold < 0 ? "하락" : "입력"}</b></div></label>
          <label>확인할 종목 <StockAutocomplete id="rehearsal-stock-query" value={query} onChange={setQuery} onPick={setQuery} placeholder="한글명 또는 티커" /></label>
          <button className="reaction-run" type="submit" disabled={loading || !query.trim()}>{loading ? "분석 중" : "분석하기"}</button>
        </form>
        <div className="reaction-examples"><span>많이 보는 종목</span>{QUICK_REHEARSAL_STOCKS[factor].map((symbol) => <button type="button" key={symbol} onClick={() => setQuery(symbol)}>{symbol}</button>)}</div>
      </article>
      {error && <div className="ai-analysis-error">{error}</div>}
      {loading && <div className="rehearsal-empty card"><b>{selected.label}와 {query || "종목"}의 과거 일봉을 비교하고 있어요.</b></div>}
      {result && !loading && <>
        <article className="reaction-hero card"><div><span>조건</span><b>{result.factor.name}가 하루 {Math.abs(result.factor.threshold)}% 이상 {result.factor.direction === "up" ? "상승" : "하락"}</b><small>{result.period} · 같은 거래일만 비교</small></div><div><span>{submittedQuery} 평균 반응</span><strong className={(result.average ?? 0) < 0 ? "negative" : "positive"}>{result.average === null ? "—" : pct(result.average)}</strong><small>{result.samples}회 발생</small></div></article>
        <section className="reaction-detail-grid"><article className="card"><span>중간값</span><strong className={(result.median ?? 0) < 0 ? "negative" : "positive"}>{result.median === null ? "—" : pct(result.median)}</strong><small>극단값 영향을 줄인 대표 반응</small></article><article className="card"><span>가장 크게 하락</span><strong className="negative">{result.worst === null ? "—" : pct(result.worst)}</strong><small>조건 충족일 중 최저 반응</small></article><article className="card"><span>반대로 상승한 날</span><strong className="positive">{result.best === null ? "—" : pct(result.best)}</strong><small>같은 시장 충격에도 항상 같이 움직이진 않음</small></article></section>
        <section className="reaction-history card"><header><div><p className="eyebrow">RECENT MATCHES</p><h2>최근 조건 충족일</h2></div><small>{result.source}</small></header>{result.latest.length ? <div>{result.latest.map((item) => <article key={item.date}><span>{item.date}</span><b>{result.factor.name} {pct(item.factorChange)}</b><strong className={item.stockChange < 0 ? "negative" : "positive"}>{submittedQuery} {pct(item.stockChange)}</strong></article>)}</div> : <p>최근 2년에서 같은 변동 조건의 거래일을 찾지 못했습니다. 변동률 범위를 조금 조정해 보세요.</p>}</section>
        <p className="rehearsal-disclaimer">과거 평균은 예측이나 손실 한도가 아닙니다. 표본 수가 적거나 레버리지·크립토 관련 종목일수록 개별 뉴스와 장중 변동이 더 크게 작용할 수 있습니다.</p>
      </>}
    </section>
  );
}

function EarningsView() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [result, setResult] = useState<EarningsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const load = (symbol = query) => {
    if (!symbol.trim()) return;
    setLoading(true); setError(""); setResult(null);
    void fetch(`/api/earnings?symbol=${encodeURIComponent(symbol.trim())}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as EarningsResult & { message?: string };
        if (!response.ok) throw new Error(data.message || "실적 데이터를 불러오지 못했습니다.");
        setResult(data); setSubmitted(data.symbol);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "실적 데이터를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  };
  const eps = (value: number | null) => value === null ? "—" : `$${value.toFixed(2)}`;
  const price = (value: number | null) => value === null ? "—" : `$${value.toFixed(2)}`;
  return (
    <section className="full-view earnings-view">
      <div className="view-header earnings-header"><div><p className="eyebrow">EARNINGS REVIEW · READ ONLY</p><h1>실적 분석</h1><p>시장 예상과 발표 수치, 실적 발표 뒤 가격 반응, 다음 분기 기대치를 확인합니다.</p></div></div>
      <form className="earnings-search card" onSubmit={(event) => { event.preventDefault(); load(); }}>
        <label htmlFor="earnings-stock-query">종목 검색</label>
        <div className="earnings-search-row"><StockAutocomplete id="earnings-stock-query" value={query} onChange={setQuery} onPick={setQuery} placeholder="한글명 또는 티커" /><button className="primary-button" type="submit" disabled={loading || !query.trim()}>{loading ? "조회 중" : "실적 보기"}</button></div>
        <div className="earnings-quick"><span>빠른 선택</span>{["NVDA", "TSLA", "AAPL", "MSFT", "MSTR", "PLTR", "IREN"].map((symbol) => <button key={symbol} type="button" onClick={() => { setQuery(symbol); load(symbol); }}>{symbol}</button>)}</div>
      </form>
      {error && <div className="ai-analysis-error">{error}</div>}
      {loading && <article className="rehearsal-empty card"><b>{query.toUpperCase()} 실적 이력과 가격 반응을 불러오고 있어요.</b></article>}
      {result && !loading && <>
        {result.status === "unavailable" ? <article className="earnings-empty card"><b>{submitted} 실적 데이터를 찾지 못했습니다.</b><p>{result.message}</p></article> : <>
          <section className="earnings-overview">
            <article className="card"><span>다음 실적 예정</span><strong>{result.upcoming?.date ?? "일정 확인 중"}</strong><small>{result.upcoming ? `${result.upcoming.quarter} · 예상 EPS ${eps(result.upcoming.consensus)} · 예상 매출 ${result.upcoming.revenueEstimate ?? "집계 없음"}` : "공식 일정은 회사 공시를 함께 확인하세요."}</small></article>
            <article className="card"><span>직전 실적</span><strong className={result.history[0]?.surprise !== null && (result.history[0]?.surprise ?? 0) >= 0 ? "positive" : "negative"}>{result.history[0]?.surprise === null ? "—" : `${result.history[0].surprise! >= 0 ? "상회" : "하회"} ${eps(Math.abs(result.history[0].surprise!))}`}</strong><small>{result.history[0] ? `예상 ${eps(result.history[0].consensus)} · 실제 ${eps(result.history[0].actual)}` : "최근 발표 자료 확인 중"}</small></article>
            <article className="card"><span>실적 다음 거래일 평균 변동</span><strong className="accent">{result.volatility.earningsMove === null ? "—" : `±${result.volatility.earningsMove.toFixed(1)}%`}</strong><small>최근 실적 발표 다음 거래일의 절대 변동 평균</small></article>
          </section>
          <section className="earnings-history card">
            <header><div><p className="eyebrow">EARNINGS HISTORY</p><h2>{submitted} 최근 실적</h2></div><small>시장 컨센서스 · 발표 수치 · 다음 거래일 반응</small></header>
            <div className="earnings-table">
              <div className="earnings-table-head"><span>발표일 / 분기</span><span>시장 예상 EPS</span><span>발표 EPS</span><span>예상 대비</span><span>발표 후 가격</span><span>등락</span></div>
              {result.history.map((item) => <article key={`${item.date}-${item.quarter}`}><div><b>{item.date}</b><small>{item.quarter} · 매출 예상 {item.revenueEstimate ?? "—"} → 발표 {item.revenueActual ?? "—"}</small></div><span><small>시장 예상 EPS</small>{eps(item.consensus)}</span><span><small>발표 EPS</small>{eps(item.actual)}</span><strong className={(item.surprise ?? 0) >= 0 ? "positive" : "negative"}>{item.surprise === null ? "—" : `${item.surprise >= 0 ? "상회" : "하회"} ${eps(Math.abs(item.surprise))}`}</strong><span className="earnings-price-move"><small>발표일 → 다음 거래일</small><b>{price(item.reportClose)} → {price(item.nextClose)}</b></span><strong className={item.reaction === null ? "" : item.reaction >= 0 ? "positive" : "negative"}>{item.reaction === null ? "—" : pct(item.reaction)}</strong></article>)}
            </div>
          </section>
          <section className="earnings-financials card"><header><div><p className="eyebrow">LATEST QUARTER</p><h2>최근 보고 분기 핵심</h2></div><small>{result.financials?.period ?? "분기 확인 중"}</small></header><div><article><span>매출</span><strong>실제 {result.financials?.revenue ?? "—"}</strong><small>예상 {result.financials?.revenueEstimate ?? "컨센서스 없음"}</small></article><article><span>영업이익</span><strong>실제 {result.financials?.operatingIncome ?? "—"}</strong><small>예상 {result.financials?.operatingIncomeEstimate ?? "컨센서스 없음"}</small></article><article><span>매출총이익률</span><strong>실제 {result.financials?.grossMargin === null || result.financials?.grossMargin === undefined ? "—" : `${result.financials.grossMargin.toFixed(1)}%`}</strong><small>예상 {result.financials?.grossMarginEstimate === null || result.financials?.grossMarginEstimate === undefined ? "컨센서스 없음" : `${result.financials.grossMarginEstimate.toFixed(1)}%`}</small></article></div></section>
          <section className="earnings-volatility card">
            <div><p className="eyebrow">VOLATILITY OUTLOOK</p><h2>다가올 실적 전 변동성 참고</h2><p>과거 가격 움직임을 이용한 범위이며, 실적 결과나 매수·매도 신호는 아닙니다.</p></div>
            <div className="volatility-stat"><span>최근 60일 일간 변동성</span><strong>{result.volatility.daily === null ? "—" : `±${result.volatility.daily.toFixed(2)}%`}</strong><small>통계적 일일 변동 폭</small></div>
            <div className="volatility-stat"><span>연환산 변동성</span><strong>{result.volatility.annual === null ? "—" : `${result.volatility.annual.toFixed(0)}%`}</strong><small>최근 60거래일 기준</small></div>
          </section>
        </>}
        <small className="earnings-source">{result.source} · 예상치는 수시로 바뀌며, 발표 일정은 추정치일 수 있습니다.</small>
      </>}
    </section>
  );
}

function seoulIsoDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function mondayOf(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function WeeklyCalendarView({ holdings }: { holdings: Holding[] }) {
  const [weekStart, setWeekStart] = useState(() => seoulIsoDate());
  const [result, setResult] = useState<WeekCalendarResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const heldSymbols = useMemo(() => new Set(holdings.filter((item) => item.market === "US").map((item) => item.symbol.toUpperCase())), [holdings]);
  const load = () => {
    setLoading(true); setError("");
    void fetch(`/api/week-calendar?start=${weekStart}`, { cache: "no-store" })
      .then(async (response) => { const data = await response.json() as WeekCalendarResult & { message?: string }; if (!response.ok) throw new Error(data.message || "일정을 불러오지 못했습니다."); setResult(data); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "일정을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [weekStart]);
  const shiftWeek = (offset: number) => { const date = new Date(`${weekStart}T00:00:00`); date.setDate(date.getDate() + offset * 7); setWeekStart(date.toISOString().slice(0, 10)); };
  const dateLabel = (value: string) => new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${value}T00:00:00`));
  const currentMonday = mondayOf(seoulIsoDate()); const selectedMonday = mondayOf(weekStart);
  const calendarTitle = selectedMonday < currentMonday ? "지난 주 시장 일정" : selectedMonday > currentMonday ? "다음 주 시장 일정" : "이번 주 시장 일정";
  const impactStars = (impact: string) => impact === "High" ? "★★★" : impact === "Medium" ? "★★" : "★";
  const earningsStars = (marketCap: number) => marketCap >= 1_000_000_000_000 ? "★★★" : marketCap >= 100_000_000_000 ? "★★" : "★";
  return <section className="full-view weekly-calendar-view">
    <div className="view-header calendar-header"><div><p className="eyebrow">MARKET CALENDAR · READ ONLY</p><h1>{calendarTitle}</h1><p>거시 지표와 기업 실적을 날짜순으로 확인합니다. 보유 종목은 먼저 표시됩니다.</p></div><button className="secondary-button calendar-refresh" onClick={load} disabled={loading}>{loading ? "불러오는 중" : "↻ 갱신"}</button></div>
    <section className="calendar-week-controls card"><button onClick={() => shiftWeek(-1)} aria-label="이전 주">‹</button><div><span>{selectedMonday < currentMonday ? "지난 기간" : selectedMonday > currentMonday ? "다음 기간" : "현재 기간"}</span><strong>{result ? `${result.start.slice(5).replace("-", ".")} — ${result.end.slice(5).replace("-", ".")}` : "일정 확인 중"}</strong></div><button onClick={() => shiftWeek(1)} aria-label="다음 주">›</button></section>
    {error && <div className="ai-analysis-error">{error}</div>}
    {loading && <article className="rehearsal-empty card"><b>선택한 기간의 시장 일정을 불러오고 있어요.</b></article>}
    {result && !loading && <section className="calendar-days">{result.days.map((day) => {
      const macro = result.macro.filter((item) => item.date === day.date);
      const held = day.items.filter((item) => heldSymbols.has(item.symbol));
      const notable = day.items.filter((item) => !heldSymbols.has(item.symbol)).slice(0, 6);
      const events = [...held, ...notable];
      return <article className="calendar-day card" key={day.date}><header><div><span>{dateLabel(day.date)}</span><h2>{macro.length || events.length ? `매크로 ${macro.length} · 실적 ${events.length}` : "주요 일정 없음"}</h2></div>{held.length > 0 && <b>내 보유 {held.length}</b>}</header>{macro.length > 0 && <div className="calendar-macro">{macro.map((item) => <div key={`${item.title}-${item.time}`}><span>{item.time} · {item.country}</span><b>{item.title}</b><small>영향도 <em>{impactStars(item.impact)}</em> · 예상 {item.forecast} · 이전 {item.previous}</small></div>)}</div>}{events.length ? <div className="calendar-events">{events.map((item) => <div className={heldSymbols.has(item.symbol) ? "held" : ""} key={`${item.symbol}-${item.date}`}><span>{heldSymbols.has(item.symbol) ? "보유" : item.time}</span><b>{item.symbol}</b><strong>{item.name}</strong><small>{item.fiscalQuarter} · 영향도 <em>{earningsStars(item.marketCap)}</em> · 시장 예상 EPS {item.estimate}</small></div>)}</div> : !macro.length && <p>현재 확인된 주요 일정이 없습니다.</p>}</article>;
    })}</section>}
    {result && <small className="calendar-source">{result.source} · 장 시작 전·장중·장 마감 후는 공개된 발표 구분이며, 미공개 기업은 별도로 표시됩니다.</small>}
  </section>;
}

function MarketRadarView({ holdings, totalAssets, accountMove }: { holdings: Holding[]; totalAssets: number; accountMove: AccountMove }) {
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [news, setNews] = useState<Record<string, IndexNewsItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState("");
  const exposureIds = useMemo(() => {
    const symbols = new Set(holdings.map((holding) => holding.symbol.toUpperCase()));
    const ids = new Set<string>();
    if ([...symbols].some((symbol) => CRYPTO_PROXY_SYMBOLS.has(symbol))) ids.add("BITCOIN");
    if (symbols.has("SOXL") || [...symbols].some((symbol) => ["NVDA", "AMD", "AVGO", "TSM", "MU", "QCOM", "ASML", "ARM", "MRVL", "INTC"].includes(symbol))) ids.add("SOX");
    if (holdings.some((holding) => holding.market === "US")) ids.add("NASDAQ");
    if (holdings.some((holding) => holding.market === "KR")) ids.add("KOSPI");
    return ids.size ? [...ids].slice(0, 3) : ["NASDAQ", "SOX", "BITCOIN"];
  }, [holdings]);
  const load = () => {
    setLoading(true);
    void fetch(`/api/indices?refresh=${Date.now()}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { items?: IndexItem[] };
        if (!response.ok) throw new Error("RADAR_INDEX_FAILED");
        const selected = (data.items ?? []).filter((item) => exposureIds.includes(item.id));
        setIndices(selected);
        setUpdatedAt(new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(new Date()));
        return Promise.all(selected.map(async (item) => {
          const newsResponse = await fetch(`/api/index-news?id=${item.id}`, { cache: "no-store" });
          const newsData = await newsResponse.json() as { items?: IndexNewsItem[] };
          return [item.id, newsData.items ?? []] as const;
        }));
      })
      .then((entries) => setNews(Object.fromEntries(entries)))
      .catch(() => { setIndices([]); setNews({}); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [exposureIds.join(",")]);
  const keyIndex = [...indices].sort((a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0))[0];
  const mostExposed = [...holdings].sort((a, b) => b.valueKrw - a.valueKrw)[0];
  return (
    <section className="full-view radar-view">
      <div className="view-header radar-header"><div><p className="eyebrow">MARKET CONTEXT · READ ONLY</p><h1>시장 레이더</h1><p>내 보유 종목과 연결된 시장 흐름, 뉴스, 오늘의 계좌 변동을 한곳에서 봅니다.</p></div><button className="secondary-button radar-refresh" onClick={load} disabled={loading}>{loading ? "불러오는 중" : "↻ 새로고침"}</button></div>
      <article className="radar-brief card">
        <div><span>오늘 계좌 변동</span><strong className={accountMove.percent >= 0 ? "positive" : "negative"}>{accountMove.available ? pct(accountMove.percent) : "확인 중"}</strong><small>{accountMove.available ? `${accountMove.coverage.toFixed(0)}% 보유 종목 기준` : "토스 현재가 조회 후 계산"}</small></div>
        <div><span>가장 민감한 시장</span><strong>{keyIndex?.nameKo ?? "시장 데이터 확인 중"}</strong><small className={keyIndex?.changePercent && keyIndex.changePercent >= 0 ? "positive" : "negative"}>{keyIndex?.changePercent === null || keyIndex?.changePercent === undefined ? "—" : `전일 대비 ${pct(keyIndex.changePercent)}`}</small></div>
        <div><span>가장 큰 보유 비중</span><strong>{mostExposed ? mostExposed.symbol : "—"}</strong><small>{mostExposed && totalAssets ? `계좌의 ${((mostExposed.valueKrw / totalAssets) * 100).toFixed(1)}%` : "보유 종목 조회 후 표시"}</small></div>
      </article>
      <div className="radar-context"><span>내 포트폴리오는</span>{exposureIds.map((id) => <b key={id}>{({ BITCOIN: "비트코인", SOX: "반도체", NASDAQ: "미국 기술주", KOSPI: "국내 증시" } as Record<string, string>)[id]}</b>)}<span>흐름을 우선 확인합니다.</span></div>
      <section className="radar-grid">
        {loading && <div className="rehearsal-empty card"><b>연결된 시장 신호를 불러오고 있어요.</b></div>}
        {!loading && indices.map((item) => <article className="radar-market-card card" key={item.id}><header><div><span>{item.group}</span><h2>{item.nameKo}</h2></div><b className={item.changePercent !== null && item.changePercent >= 0 ? "positive" : "negative"}>{item.changePercent === null ? "—" : pct(item.changePercent)}</b></header><strong>{item.price === null ? "—" : item.unit === "USD" ? `$${item.price.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : item.price.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}</strong><small>{item.changeAmount === null ? "" : `${item.changeAmount >= 0 ? "+" : ""}${item.changeAmount.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${item.unit === "pt" ? "pt" : ""}`} · {item.source}</small><div className="radar-news-list">{(news[item.id] ?? []).slice(0, 2).map((story) => <a href={story.link} key={story.link} target="_blank" rel="noreferrer"><b>{story.title}</b><span>{story.source} · {story.publishedAt}</span></a>)}{!(news[item.id] ?? []).length && <span>관련 뉴스를 확인하고 있어요.</span>}</div></article>)}
      </section>
      <small className="radar-updated">{updatedAt ? `${updatedAt} 기준 · 가격은 자동 갱신, 뉴스는 무료 피드 캐시를 사용합니다.` : ""}</small>
    </section>
  );
}

function WatchlistView({
  holdings,
  exchangeRate,
}: {
  holdings: Holding[];
  exchangeRate: number;
}) {
  const heldStocks = useMemo(
    () =>
      holdings
        .filter((holding) => holding.market === "US")
        .map((holding) => ({
          ticker: holding.symbol,
          nameKo: holding.name,
          category: "HOLDINGS" as const,
        })),
    [holdings],
  );
  const { items, grouped, loading, error, refresh, addTicker, removeTicker } =
    useWatchlist(heldStocks);
  const [selectedCategory, setSelectedCategory] = useState<
    "ALL" | WatchlistCategory
  >("ALL");
  const [selectedItem, setSelectedItem] = useState<WatchlistItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newTicker, setNewTicker] = useState("");
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");
  const [adding, setAdding] = useState(false);
  const submitNewTicker = async () => {
    if (adding || !newTicker.trim()) return;
    setAdding(true);
    setAddError("");
    setAddSuccess("");
    try {
      const stock = await addTicker(newTicker);
      setSelectedCategory(stock.category);
      setNewTicker("");
      setAddSuccess(
        `${stock.ticker} ${stock.alreadyExists ? "기존 종목으로 이동" : "추가 완료"} · ${WATCHLIST_CATEGORY_LABELS[stock.category]}`,
      );
      window.setTimeout(() => setAddOpen(false), 650);
    } catch (cause) {
      setAddError(
        cause instanceof Error ? cause.message : "종목을 추가하지 못했습니다.",
      );
    } finally {
      setAdding(false);
    }
  };
  const categoryOrder = WATCHLIST_CATEGORY_ORDER.filter(
    (category) => category !== "CUSTOM" || grouped.CUSTOM.length > 0,
  );
  const visibleCategories =
    selectedCategory === "ALL" ? categoryOrder : [selectedCategory];
  const pricedCount = items.filter((item) => item.quote).length;
  return (
    <section className="full-view watchlist-view">
      <div className="watchlist-hero card">
        <div className="watchlist-glow" />
        <div className="watchlist-hero-copy">
          <p className="eyebrow">US MARKET RADAR</p>
          <h1>관심종목</h1>
          <p>
            내가 보유한 종목부터 시장의 주요 테마까지, 한 화면에서 빠르게
            훑어보세요.
          </p>
        </div>
        <div className="watchlist-hero-stats">
          <div>
            <strong>{items.length}</strong>
            <span>추적 종목</span>
          </div>
          <div>
            <strong>{categoryOrder.length}</strong>
            <span>카테고리</span>
          </div>
          <div>
            <strong>{pricedCount}</strong>
            <span>현재가 연결</span>
          </div>
        </div>
        <div className="watchlist-actions">
          <button className="watchlist-add" onClick={() => setAddOpen(true)}>
            ＋ 종목 추가
          </button>
          <button
            className="watchlist-refresh"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <span className={loading ? "spinning" : ""}>↻</span>
            {loading ? "조회 중" : "현재가 갱신"}
          </button>
        </div>
      </div>
      {error && (
        <div className="watchlist-notice">
          <i /> <span>{error} 종목 구성은 그대로 확인할 수 있습니다.</span>
        </div>
      )}
      <div
        className="watchlist-filter"
        role="tablist"
        aria-label="관심종목 카테고리"
      >
        <button
          className={selectedCategory === "ALL" ? "active" : ""}
          onClick={() => setSelectedCategory("ALL")}
        >
          전체 <b>{items.length}</b>
        </button>
        {categoryOrder.map((category) => (
          <button
            key={category}
            className={selectedCategory === category ? "active" : ""}
            onClick={() => setSelectedCategory(category)}
          >
            {WATCHLIST_CATEGORY_LABELS[category]}{" "}
            <b>{grouped[category].length}</b>
          </button>
        ))}
      </div>
      <div
        className={`watchlist-categories ${selectedCategory === "ALL" ? "" : "single"}`}
      >
        {visibleCategories.map((category, index) => {
          const categoryItems = grouped[category];
          const changedItems = categoryItems.filter(
            (item) => item.quote?.dayChange !== null && item.quote?.dayChange !== undefined,
          );
          const averageChange = changedItems.length
            ? changedItems.reduce((sum, item) => sum + (item.quote?.dayChange ?? 0), 0) /
              changedItems.length
            : null;
          const gainers = changedItems.filter(
            (item) => (item.quote?.dayChange ?? 0) > 0,
          ).length;
          const losers = changedItems.filter(
            (item) => (item.quote?.dayChange ?? 0) < 0,
          ).length;
          return (
          <article
            className="card watchlist-category"
            data-category={category}
            key={category}
          >
            <div className="watchlist-category-head">
              <div>
                <span>RADAR {String(index + 1).padStart(2, "0")}</span>
                <h2>{WATCHLIST_CATEGORY_LABELS[category]}</h2>
                <small className="category-market-stats">
                  {averageChange === null ? (
                    "전일 대비 수집 중"
                  ) : (
                    <>
                      평균{" "}
                      <b className={averageChange >= 0 ? "positive" : "negative"}>
                        {pct(averageChange)}
                      </b>
                      <i>상승 {gainers} · 하락 {losers}</i>
                    </>
                  )}
                </small>
              </div>
              <b>{categoryItems.length}</b>
            </div>
            <div className="watchlist-items">
              {categoryItems.length === 0 ? (
                <div className="watchlist-empty">
                  {category === "HOLDINGS"
                    ? "토스 계좌를 연결하면 실제 보유 미국주식이 표시됩니다."
                    : "등록된 종목이 없습니다."}
                </div>
              ) : (
                categoryItems.map((item) => {
                  const dayChange = item.quote?.dayChange ?? null;
                  const dayAmount = item.quote?.dayChangeAmount ?? null;
                  return (
                    <button
                      key={item.ticker}
                      className="watchlist-item"
                      onClick={() => setSelectedItem(item)}
                    >
                      <StockLogo ticker={item.ticker} name={item.nameKo} />
                      <div className="watchlist-company">
                        <strong>{item.ticker}</strong>
                        <span>{item.nameKo}</span>
                      </div>
                      <MiniSparkline values={item.priceHistory} />
                      <div className="watchlist-price">
                        <strong>
                          {formatUsPrice(item.quote?.lastPrice)}
                        </strong>
                        <span
                          className={
                            dayChange === null
                              ? ""
                              : dayChange >= 0
                                ? "positive"
                                : "negative"
                          }
                        >
                          {item.quote
                            ? dayChange === null
                              ? "전일 종가 확인 중"
                              : `전일 대비 ${pct(dayChange)}`
                            : "시세 연결 전"}
                        </span>
                        {dayAmount !== null && (
                          <small
                            className={dayAmount >= 0 ? "positive" : "negative"}
                          >
                            {dayAmount >= 0 ? "+" : ""}
                            {nativeMoney(dayAmount, "US")}
                          </small>
                        )}
                      </div>
                      <span className="watchlist-arrow">›</span>
                    </button>
                  );
                })
              )}
            </div>
          </article>
          );
        })}
      </div>
      {selectedItem && (
        <StockDetailDrawer
          item={selectedItem}
          holding={holdings.find(
            (holding) => holding.symbol.toUpperCase() === selectedItem.ticker,
          )}
          exchangeRate={exchangeRate}
          onClose={() => setSelectedItem(null)}
          onRemove={() => {
            if (removeTicker(selectedItem.ticker)) setSelectedItem(null);
          }}
        />
      )}
      {addOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAddOpen(false);
          }}
        >
          <form
            className="add-stock-modal card"
            onSubmit={(event) => {
              event.preventDefault();
              void submitNewTicker();
            }}
          >
            <div>
              <span className="eyebrow">TOSS SYMBOL CHECK</span>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <h2>관심종목 추가</h2>
            <p>
              한글명 또는 티커를 입력하면 후보를 보여주고, 토스 시세로 검증한 뒤 자동 분류합니다.
            </p>
            <label>
              미국주식 검색
              <StockAutocomplete id="watchlist-stock-query" value={newTicker} onChange={setNewTicker} onPick={setNewTicker} placeholder="한글명 또는 티커" market="US" />
            </label>
            {addError && <span className="add-stock-error">{addError}</span>}
            {addSuccess && (
              <span className="add-stock-success">✓ {addSuccess}</span>
            )}
            <button
              type="button"
              className="primary-button"
              onClick={() => void submitNewTicker()}
              disabled={adding || !newTicker.trim()}
            >
              {adding ? "확인 중…" : "토스에서 확인하고 추가"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function formatUsPrice(value: number | undefined) {
  if (value === undefined) return "—";
  return nativeMoney(value, "US");
}

function splitUsPrice(value: number | undefined, exchangeRate: number) {
  if (value === undefined) return { primary: "—", secondary: "" };
  return {
    primary: nativeMoney(value, "US"),
    secondary: `약 ${won(value * exchangeRate)}`,
  };
}

function MiniSparkline({ values }: { values: number[] }) {
  const { cursor, handlers, chartRef } = useTouchChartCursor(values.length);
  if (values.length < 2)
    return (
      <span className="spark-placeholder">
        <i />
      </span>
    );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map(
      (value, index) =>
        `${(index / (values.length - 1)) * 100},${24 - ((value - min) / range) * 20}`,
    )
    .join(" ");
  const rising = values.at(-1)! >= values[0];
  const selected = cursor === null ? null : {
    value: values[cursor],
    x: (cursor / (values.length - 1)) * 100,
    y: 24 - ((values[cursor] - min) / range) * 20,
  };
  return (
    <svg
      ref={chartRef}
      className={`mini-sparkline ${rising ? "rising" : "falling"}`}
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      aria-label={`이 화면에서 관찰한 가격 흐름 ${rising ? "상승" : "하락"}`}
      {...handlers}
    >
      <polyline points={points} />
      {selected && (
        <g className="chart-cursor">
          <line x1={selected.x} x2={selected.x} y1="2" y2="26" />
          <circle cx={selected.x} cy={selected.y} r="2.3" />
        </g>
      )}
    </svg>
  );
}

function DetailPriceChart({
  candles,
  period,
  market = "US",
}: {
  candles: StockCandle[];
  period: ChartPeriod;
  market?: Market;
}) {
  const { cursor, handlers, chartRef } = useTouchChartCursor(candles.length);
  if (candles.length < 2)
    return <div className="chart-state">표시할 일봉이 부족합니다.</div>;
  const width = 360;
  const height = 174;
  const left = 8;
  const right = market === "KR" ? 78 : 57;
  const top = 12;
  const bottom = 26;
  const lows = candles.map((candle) => candle.lowPrice);
  const highs = candles.map((candle) => candle.highPrice);
  const closes = candles.map((candle) => candle.closePrice);
  const rawMin = Math.min(...lows);
  const rawMax = Math.max(...highs);
  const padding = (rawMax - rawMin) * 0.08 || rawMax * 0.01;
  const min = rawMin - padding;
  const max = rawMax + padding;
  const range = max - min || 1;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const coordinates = closes.map((value, index) => ({
    x: left + (index / (closes.length - 1)) * plotWidth,
    y: top + ((max - value) / range) * plotHeight,
  }));
  const points = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const first = coordinates[0];
  const last = coordinates.at(-1)!;
  const area = `M ${left} ${height - bottom} L ${points.replaceAll(",", " ")} L ${width - right} ${height - bottom} Z`;
  const rising = closes.at(-1)! >= closes[0];
  const color = rising ? "#45d2a2" : "#ff6275";
  const labels = [max, (max + min) / 2, min];
  const shortDate = (value: string) =>
    new Intl.DateTimeFormat(
      "ko-KR",
      period === "1D"
        ? { hour: "2-digit", minute: "2-digit" }
        : { month: "2-digit", day: "2-digit" },
    ).format(new Date(value));
  const periodLabel =
    period === "1D"
      ? "일봉"
      : period === "1W"
        ? "1주"
      : period === "1M"
        ? "1개월"
        : period === "3M"
          ? "3개월"
          : "1년";
  const selected = cursor === null ? null : {
    ...coordinates[cursor],
    value: closes[cursor],
    timestamp: candles[cursor].timestamp,
  };
  return (
    <div className={`detail-price-chart ${rising ? "rising" : "falling"}`}>
      <svg
        ref={chartRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`최근 ${candles.length}거래일 일봉 차트`}
        {...handlers}
      >
        <defs>
          <linearGradient id="detail-chart-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".26" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {labels.map((value, index) => {
          const y = top + index * (plotHeight / 2);
          return (
            <g key={value}>
              <line x1={left} x2={width - right + 4} y1={y} y2={y} />
              <text x={width - right + 9} y={y + 3}>
                {nativeMoney(value, market)}
              </text>
            </g>
          );
        })}
        <path d={area} fill="url(#detail-chart-area)" />
        <polyline points={points} />
        <circle cx={first.x} cy={first.y} r="2.5" />
        <circle className="current-dot" cx={last.x} cy={last.y} r="3.5" />
        {selected && (
          <g className="chart-cursor">
            <line x1={selected.x} x2={selected.x} y1={top + 39} y2={height - bottom} />
            <circle cx={selected.x} cy={selected.y} r="3.5" />
            <ChartCursorCard
              x={Math.min(width - right - 106, Math.max(left + 4, selected.x - 53))}
              y={top + 3}
              width={106}
              date={chartMoment(selected.timestamp, period === "1D")}
              value={nativeMoney(selected.value, market)}
            />
          </g>
        )}
        <text className="date-label" x={left} y={height - 5}>
          {shortDate(candles[0].timestamp)}
        </text>
        <text className="date-label end" x={width - right} y={height - 5}>
          {shortDate(candles.at(-1)!.timestamp)}
        </text>
      </svg>
      <div className="chart-range">
        <span>
          <small>{periodLabel} 최저</small>
          <b>{nativeMoney(rawMin, market)}</b>
        </span>
        <span>
          <small>{periodLabel} 최고</small>
          <b>{nativeMoney(rawMax, market)}</b>
        </span>
      </div>
    </div>
  );
}

function StockDetailDrawer({
  item,
  holding,
  exchangeRate,
  onClose,
  onRemove,
}: {
  item: WatchlistItem;
  holding?: Holding;
  exchangeRate: number;
  onClose: () => void;
  onRemove?: () => void;
}) {
  const [period, setPeriod] = useState<ChartPeriod>("1D");
  const [candles, setCandles] = useState<StockCandle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [news, setNews] = useState<StockNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState("");
  useEffect(() => {
    let active = true;
    const isLocal = ["localhost", "127.0.0.1"].includes(
      window.location.hostname,
    );
    const base = isLocal
      ? "http://127.0.0.1:8000/api/toss/candles"
      : "/api/toss/candles";
    const config =
      period === "1D"
        ? { interval: "1m", count: 60 }
        : period === "1W"
          ? { interval: "1d", count: 6 }
          : period === "1M"
            ? { interval: "1d", count: 22 }
            : period === "3M"
              ? { interval: "1d", count: 66 }
              : { interval: "1d", count: 250 };
    void fetch(
      `${base}?symbol=${encodeURIComponent(item.ticker)}&interval=${config.interval}&count=${config.count}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        const data = (await response.json()) as {
          connected: boolean;
          message?: string;
          candles?: Array<Record<string, string>>;
        };
        if (!response.ok || !data.connected)
          throw new Error(data.message || "차트를 불러오지 못했습니다.");
        const parsed = (data.candles ?? [])
          .map((candle) => ({
            timestamp: candle.timestamp,
            openPrice: Number(candle.openPrice),
            highPrice: Number(candle.highPrice),
            lowPrice: Number(candle.lowPrice),
            closePrice: Number(candle.closePrice),
            volume: Number(candle.volume),
          }))
          .reverse();
        if (active) setCandles(parsed);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "차트를 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [item.ticker, period]);
  useEffect(() => {
    let active = true;
    void fetch(
      `/api/news?symbol=${encodeURIComponent(item.ticker)}&name=${encodeURIComponent(item.nameKo)}`,
    )
      .then(async (response) => {
        const data = (await response.json()) as {
          items?: StockNewsItem[];
          message?: string;
        };
        if (!response.ok)
          throw new Error(data.message || "뉴스를 불러오지 못했습니다.");
        if (active) setNews(data.items ?? []);
      })
      .catch((reason) => {
        if (active)
          setNewsError(
            reason instanceof Error
              ? reason.message
              : "뉴스를 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (active) setNewsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [item.ticker, item.nameKo]);
  const closes = candles.map((candle) => candle.closePrice);
  const periodChange =
    closes.length > 1 ? ((closes.at(-1)! - closes[0]) / closes[0]) * 100 : null;
  const currentPrice = [
    item.quote?.lastPrice,
    holding?.lastPrice,
    closes.at(-1),
  ].find((value) => typeof value === "number" && value > 0);
  const market = holding?.market ?? "US";
  const shownPrice = market === "KR"
    ? { primary: currentPrice === undefined ? "—" : nativeMoney(currentPrice, market), secondary: "" }
    : splitUsPrice(currentPrice, exchangeRate);
  const periodLabel =
    period === "1D"
      ? "일봉"
      : period === "1W"
        ? "1주"
        : period === "1M"
          ? "1개월"
          : period === "3M"
            ? "3개월"
            : "1년";
  const selectPeriod = (value: ChartPeriod) => {
    setLoading(true);
    setError("");
    setPeriod(value);
  };
  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="stock-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${item.nameKo} 상세`}
      >
        <SwipeToCloseHandle onClose={onClose} />
        <header>
          <div>
            <StockLogo ticker={item.ticker} name={item.nameKo} size="large" />
            <span>
              <b>{item.ticker}</b>
              <small>{item.nameKo} · {market}</small>
            </span>
          </div>
          <button onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <section className="drawer-price">
          <small>현재가</small>
          <div className="drawer-price-values">
            <strong>{shownPrice.primary}</strong>
            {shownPrice.secondary && <b>{shownPrice.secondary}</b>}
          </div>
          <span
            className={
              periodChange === null
                ? ""
                : periodChange >= 0
                  ? "positive"
                  : "negative"
            }
          >
            {periodChange === null
              ? `${periodLabel} 변화 확인 중`
              : `${periodLabel} ${pct(periodChange)}`}
          </span>
        </section>
        <section className="drawer-chart">
          <div className="drawer-chart-head">
            <b>가격 흐름</b>
            <div className="chart-period-tabs">
              {(
                [
                  ["1D", "일봉"],
                  ["1W", "1주"],
                  ["1M", "1개월"],
                  ["3M", "3개월"],
                  ["1Y", "1년"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={period === value ? "active" : ""}
                  onClick={() => selectPeriod(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="chart-state">
              {periodLabel} 데이터를 불러오는 중…
            </div>
          ) : error ? (
            <div className="chart-state error">{error}</div>
          ) : (
            <DetailPriceChart candles={candles} period={period} market={market} />
          )}
        </section>
        <section className="drawer-metrics">
          <div>
            <span>보유 수량</span>
            <strong>
              {holding
                ? `${holding.quantity.toLocaleString("ko-KR")}주`
                : "미보유"}
            </strong>
          </div>
          <div>
            <span>평균 단가</span>
            <strong>
              {holding ? nativeMoney(holding.averagePrice, market) : "—"}
            </strong>
          </div>
          <div>
            <span>평가 금액</span>
            <strong>
              {holding ? nativeMoney(holding.valueNative, market) : "—"}
            </strong>
          </div>
          <div>
            <span>수익률</span>
            <strong
              className={
                holding
                  ? holding.returnRate >= 0
                    ? "positive"
                    : "negative"
                  : ""
              }
            >
              {holding ? pct(holding.returnRate) : "—"}
            </strong>
          </div>
        </section>
        <section className="drawer-news">
          <div className="drawer-section-title">
            <div>
              <small>NEWS SIGNAL</small>
              <h3>최근 뉴스 핵심</h3>
            </div>
            <span>최근 3일</span>
          </div>
          {newsLoading ? (
            <div className="news-state">최근 뉴스를 모으는 중…</div>
          ) : newsError ? (
            <div className="news-state error">{newsError}</div>
          ) : news.length ? (
            <div className="news-list">
              {news.map((article) => (
                <a
                  href={article.link}
                  target="_blank"
                  rel="noreferrer"
                  key={`${article.link}-${article.publishedAt}`}
                >
                  <div>
                    <span>{article.topic}</span>
                    <time>{article.publishedAt}</time>
                  </div>
                  <b>{article.title}</b>
                  <p>{article.summary}</p>
                  <small>{article.source} · 원문 보기 ↗</small>
                </a>
              ))}
            </div>
          ) : (
            <div className="news-state">최근 3일 뉴스가 없습니다.</div>
          )}
          <p className="news-disclaimer">
            헤드라인 기반 자동 요약이에요. 투자 판단 전 원문을 확인하세요.
          </p>
        </section>
        <div className="drawer-note">
          <b>리스크 먼저 확인하세요</b>
          <p>
            고변동성 종목은 보유 비중과 가격 변동폭을 함께 확인하세요.
            과거 차트와 뉴스만으로 미래 가격을 확정할 수는 없습니다.
          </p>
        </div>
        {!holding && onRemove && <button className="drawer-remove" onClick={onRemove}>관심종목에서 삭제</button>}
      </aside>
    </div>
  );
}

function RiskDetailDrawer({
  baseScore,
  finalScore,
  factors,
  analysis,
  loading,
  onRefresh,
  onClose,
}: {
  baseScore: number;
  finalScore: number;
  factors: RiskFactor[];
  analysis: AiRiskAnalysis | null;
  loading: boolean;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const status =
    finalScore >= 85
      ? "안정 구간"
      : finalScore >= 70
        ? "주의 구간"
        : "고위험 구간";
  return (
    <div
      className="drawer-backdrop risk-detail-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="risk-detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="주간 리스크 상세"
      >
        <div className="drawer-handle" />
        <header>
          <div>
            <span>WEEKLY RISK EXPLAINER</span>
            <h2>이번 주 리스크 상세</h2>
          </div>
          <button onClick={onClose} aria-label="닫기">
            ×
          </button>
        </header>
        <section className="risk-detail-score">
          <div>
            <strong>{finalScore}</strong>
            <span>/ 100</span>
          </div>
          <div>
            <b>{status}</b>
            <p>
              규칙 점수 {baseScore}점{" "}
              {analysis?.connected
                ? `· Gemini ${analysis.adjustment >= 0 ? "+" : ""}${analysis.adjustment}점`
                : "· Gemini 미반영"}
            </p>
          </div>
        </section>
        <section className="risk-formula">
          <div className="risk-section-title">
            <div>
              <small>FIXED FORMULA</small>
              <h3>점수 계산 근거</h3>
            </div>
            <span>중립 60점 + 보호 − 위험</span>
          </div>
          {factors.map((factor) => (
            <div className="risk-factor" key={factor.key}>
              <div>
                <b>{factor.label}</b>
                <p>{factor.explanation}</p>
              </div>
              <span>{factor.value}</span>
              <strong
                className={
                  factor.impact < 0
                    ? "negative"
                    : factor.impact > 0
                      ? "positive"
                      : "neutral"
                }
              >
                {factor.impact > 0 ? "+" : ""}
                {factor.impact}점
              </strong>
            </div>
          ))}
        </section>
        <section className="risk-ai-section">
          <div className="risk-section-title">
            <div>
              <small>GEMINI + FREE NEWS</small>
              <h3>최신 시장 맥락</h3>
            </div>
            <button onClick={onRefresh} disabled={loading}>
              {loading ? "분석 중…" : "다시 분석"}
            </button>
          </div>
          {analysis?.connected ? (
            <>
              <p className="risk-ai-summary">{analysis.summary}</p>
              {analysis.positions.length > 0 && (
                <div className="risk-position-list">
                  {analysis.positions.map((position) => (
                    <article key={position.symbol}>
                      <header>
                        <b>{position.symbol}</b>
                        <span
                          className={
                            position.stance === "positive"
                              ? "positive"
                              : position.stance === "negative"
                                ? "negative"
                                : ""
                          }
                        >
                          {position.stance === "positive"
                            ? "긍정"
                            : position.stance === "negative"
                              ? "위험"
                              : "중립"}{" "}
                          · {position.impact >= 0 ? "+" : ""}
                          {position.impact}
                        </span>
                      </header>
                      <p>{position.reason}</p>
                    </article>
                  ))}
                </div>
              )}
              {analysis.risks.length > 0 && (
                <div className="risk-signal-block danger">
                  <b>확인할 위험</b>
                  {analysis.risks.map((item) => (
                    <p key={item}>• {item}</p>
                  ))}
                </div>
              )}
              {analysis.positives.length > 0 && (
                <div className="risk-signal-block good">
                  <b>긍정 요인</b>
                  {analysis.positives.map((item) => (
                    <p key={item}>• {item}</p>
                  ))}
                </div>
              )}
              {analysis.sources.length > 0 && (
                <div className="risk-sources">
                  <b>뉴스 근거</b>
                  {analysis.sources.map((source) => (
                    <a
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.title} ↗
                    </a>
                  ))}
                </div>
              )}
              <small className="risk-updated">
                {new Intl.DateTimeFormat("ko-KR", {
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(analysis.updatedAt))}{" "}
                분석 · 투자 권유가 아닌 위험 점검용
              </small>
            </>
          ) : (
            <div className="risk-ai-empty">
              <b>
                {loading
                  ? "최신 이슈를 분석하고 있습니다."
                  : "Gemini 분석이 아직 연결되지 않았습니다."}
              </b>
              <p>
                {analysis?.message ??
                  "API 키 연결 전에는 공개된 고정 계산식만 사용합니다."}
              </p>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

function Dashboard({
  holdings,
  totalAssets,
  holdingsValue,
  investedCost,
  totalProfitLoss,
  buyingPower,
  buyingPowerKrw,
  buyingPowerUsd,
  exchangeRate,
  currencyDisplay,
  onCurrencyDisplay,
  portfolioReturn,
  accountMoves,
  biggestWeight,
}: {
  holdings: Holding[];
  totalAssets: number;
  holdingsValue: number;
  investedCost: number;
  totalProfitLoss: number;
  buyingPower: number;
  buyingPowerKrw: number;
  buyingPowerUsd: number;
  exchangeRate: number;
  currencyDisplay: CurrencyDisplay;
  onCurrencyDisplay: (display: CurrencyDisplay) => void;
  portfolioReturn: number;
  accountMoves: { previous: AccountMove; today: AccountMove };
  biggestWeight: number;
}) {
  const [moveCurrency, setMoveCurrency] = useState<"KRW" | "USD">("KRW");
  const [riskOpen, setRiskOpen] = useState(false);
  const [aiRisk, setAiRisk] = useState<AiRiskAnalysis | null>(null);
  const [riskLoading, setRiskLoading] = useState(true);
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [accountTrend, setAccountTrend] = useState<AccountTrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const kr = totalAssets
    ? (holdings
        .filter((h) => h.market === "KR")
        .reduce((s, h) => s + h.valueKrw, 0) /
        totalAssets) *
      100
    : 0;
  const us = totalAssets
    ? (holdings
        .filter((h) => h.market === "US")
        .reduce((s, h) => s + h.valueKrw, 0) /
        totalAssets) *
      100
    : 0;
  const cash = totalAssets ? (buyingPower / totalAssets) * 100 : 0;
  const sortedHoldings = [...holdings].sort(
    (a, b) => b.valueKrw - a.valueKrw || a.symbol.localeCompare(b.symbol),
  );
  const trendSignature = holdings
    .map((holding) =>
      [holding.symbol, holding.market, holding.currency, holding.quantity].join(":"),
    )
    .sort()
    .join(",");
  const trendSnapshotRef = useRef({ holdings, buyingPower, exchangeRate });
  trendSnapshotRef.current = { holdings, buyingPower, exchangeRate };
  useEffect(() => {
    let active = true;
    const loadTrend = async () => {
      const snapshot = trendSnapshotRef.current;
      const trendHoldings = snapshot.holdings;
      if (!trendHoldings.length) {
        if (active) {
          setAccountTrend([]);
          setTrendLoading(false);
        }
        return;
      }
      setTrendLoading(true);
      const isLocal = ["localhost", "127.0.0.1"].includes(
        window.location.hostname,
      );
      const base = isLocal
        ? "http://127.0.0.1:8000/api/toss/candles"
        : "/api/toss/candles";
      try {
        const candleSets = await Promise.all(
          trendHoldings.slice(0, 12).map(async (holding) => {
            const response = await fetch(
              `${base}?symbol=${encodeURIComponent(holding.symbol)}&interval=1d&count=22`,
              { cache: "no-store" },
            );
            const data = (await response.json()) as {
              connected?: boolean;
              candles?: Array<{
                closePrice?: string | number;
                timestamp?: string;
              }>;
            };
            const closes = (data.connected ? data.candles ?? [] : [])
              .map((candle) => ({
                value: Number(candle.closePrice ?? 0),
                timestamp: candle.timestamp ?? "",
              }))
              .filter((close) => close.value > 0)
              .reverse();
            return { holding, closes };
          }),
        );
        const usable = candleSets.filter((item) => item.closes.length >= 2);
        const length = Math.min(20, ...usable.map((item) => item.closes.length));
        if (!usable.length || !Number.isFinite(length) || length < 2)
          throw new Error("TREND_UNAVAILABLE");
        const reference = usable[0].closes;
        const trendPoints = Array.from({ length }, (_, index) => ({
          timestamp:
            reference[reference.length - length + index].timestamp ||
            new Date().toISOString(),
          value:
            snapshot.buyingPower +
            usable.reduce((sum, { holding, closes }) => {
              const close = closes[closes.length - length + index].value;
              const multiplier =
                holding.currency === "USD" ? snapshot.exchangeRate : 1;
              return sum + close * holding.quantity * multiplier;
            }, 0),
        }));
        if (active) setAccountTrend(trendPoints);
      } catch {
        if (active) setAccountTrend([]);
      } finally {
        if (active) setTrendLoading(false);
      }
    };
    void loadTrend();
    return () => {
      active = false;
    };
  }, [trendSignature]);
  const monthlyAccountReturn =
    accountTrend.length >= 2 && accountTrend[0].value > 0
      ? ((accountTrend.at(-1)!.value - accountTrend[0].value) /
          accountTrend[0].value) *
        100
      : null;
  const selectedHoldingItem: WatchlistItem | null = selectedHolding
    ? {
        ticker: selectedHolding.symbol.toUpperCase(),
        nameKo: selectedHolding.name,
        category: "HOLDINGS",
        quote: {
          ticker: selectedHolding.symbol.toUpperCase(),
          lastPrice: selectedHolding.lastPrice,
          previousClose: null,
          dayChange: null,
          dayChangeAmount: null,
          currency: selectedHolding.currency,
        },
        priceHistory: [],
      }
    : null;
  const leveragedExposure = totalAssets
    ? (holdings
        .filter((h) => LEVERAGED_SYMBOLS.has(h.symbol.toUpperCase()))
        .reduce((sum, h) => sum + h.valueKrw, 0) /
        totalAssets) *
      100
    : 0;
  const cryptoExposure = totalAssets
    ? (holdings
        .filter((h) => CRYPTO_PROXY_SYMBOLS.has(h.symbol.toUpperCase()))
        .reduce((sum, h) => sum + h.valueKrw, 0) /
        totalAssets) *
      100
    : 0;
  const concentrationImpact =
    biggestWeight <= 15
      ? 8
      : biggestWeight <= 25
        ? 4
        : -Math.min(20, Math.round((biggestWeight - 25) * 1.2));
  const leverageImpact =
    leveragedExposure === 0
      ? 6
      : leveragedExposure <= 10
        ? 2
        : -Math.min(
            15,
            Math.max(1, Math.round((leveragedExposure - 10) * 0.4)),
          );
  const cryptoImpact =
    cryptoExposure === 0
      ? 5
      : cryptoExposure < 15
        ? 2
        : -Math.min(12, Math.max(1, Math.round((cryptoExposure - 15) * 0.35)));
  const cashImpact = cash >= 20 ? 8 : cash >= 10 ? 4 : cash >= 5 ? -3 : -8;
  const liveMove = Math.abs(accountMoves.today.percent);
  const moveImpact = accountMoves.today.available
    ? liveMove <= 1
      ? 5
      : liveMove <= 3
        ? 2
        : -Math.min(10, Math.max(1, Math.round((liveMove - 3) * 2)))
    : 0;
  const riskFactors: RiskFactor[] = [
    {
      key: "concentration",
      label: "종목 집중도",
      value: `총자산 중 최대 종목 ${biggestWeight.toFixed(1)}%`,
      impact: concentrationImpact,
      explanation:
        "최대 종목 비중이 15% 이하면 +8점, 25% 이하면 +4점이며 초과분은 위험으로 반영합니다.",
    },
    {
      key: "leverage",
      label: "레버리지 ETF 노출",
      value: `총자산 중 ${leveragedExposure.toFixed(1)}%`,
      impact: leverageImpact,
      explanation:
        "노출이 없으면 +6점, 10% 이하면 +2점이며 그 이상은 경로 의존 위험으로 차감합니다.",
    },
    {
      key: "crypto",
      label: "크립토 프록시 노출",
      value: `총자산 중 ${cryptoExposure.toFixed(1)}%`,
      impact: cryptoImpact,
      explanation:
        "노출이 없으면 +5점, 15% 미만이면 +2점이며 그 이상은 비트코인 민감도로 차감합니다.",
    },
    {
      key: "cash",
      label: "현금 완충력",
      value: `총자산 중 매수 가능 현금 ${cash.toFixed(1)}%`,
      impact: cashImpact,
      explanation:
        "현금 20% 이상은 +8점, 10% 이상은 +4점이며 10% 미만은 대응 여력 부족으로 차감합니다.",
    },
    {
      key: "move",
      label: "오늘 계좌 변동성",
      value: accountMoves.today.available
        ? `전일 종가 대비 ${accountMoves.today.percent >= 0 ? "+" : ""}${accountMoves.today.percent.toFixed(2)}%`
        : "전일 종가 데이터 계산 중",
      impact: moveImpact,
      explanation:
        "등락 방향이 아니라 절대 변동폭을 봅니다. 1% 이하는 +5점, 3% 이하는 +2점이며 초과 시 차감합니다.",
    },
  ];
  const baseRiskScore = Math.max(
    0,
    Math.min(
      100,
      68 + riskFactors.reduce((sum, factor) => sum + factor.impact, 0),
    ),
  );
  const riskPayload = {
    baseScore: baseRiskScore,
    cashRatio: cash,
    maxWeight: biggestWeight,
    todayChange: accountMoves.today.available
      ? accountMoves.today.percent
      : null,
    previousChange: accountMoves.previous.available
      ? accountMoves.previous.percent
      : null,
    holdings: holdings.map((h) => ({
      symbol: h.symbol.toUpperCase(),
      weight: totalAssets ? (h.valueKrw / totalAssets) * 100 : 0,
      returnRate: h.returnRate,
      leveraged: LEVERAGED_SYMBOLS.has(h.symbol.toUpperCase()),
      cryptoProxy: CRYPTO_PROXY_SYMBOLS.has(h.symbol.toUpperCase()),
    })),
  };
  const riskSignature = JSON.stringify(riskPayload);
  useEffect(() => {
    if (holdings.length === 0) return;
    let active = true;
    const run = () => {
      void fetch("/api/risk-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: riskSignature,
      })
        .then((response) => response.json() as Promise<AiRiskAnalysis>)
        .then((data) => {
          if (active) setAiRisk(data);
        })
        .catch(() => {
          if (active)
            setAiRisk({
              connected: false,
              message: "최신 분석을 불러오지 못했습니다.",
              adjustment: 0,
              summary: "규칙 기반 점수를 유지합니다.",
              risks: [],
              positives: [],
              positions: [],
              sources: [],
              updatedAt: new Date().toISOString(),
            });
        })
        .finally(() => {
          if (active) setRiskLoading(false);
        });
    };
    run();
    const interval = window.setInterval(run, 30 * 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [riskSignature, holdings.length]);
  const refreshRisk = () => {
    setRiskLoading(true);
    void fetch("/api/risk-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: riskSignature,
    })
      .then((response) => response.json() as Promise<AiRiskAnalysis>)
      .then(setAiRisk)
      .catch(() =>
        setAiRisk({
          connected: false,
          message: "최신 분석을 불러오지 못했습니다.",
          adjustment: 0,
          summary: "규칙 기반 점수를 유지합니다.",
          risks: [],
          positives: [],
          positions: [],
          sources: [],
          updatedAt: new Date().toISOString(),
        }),
      )
      .finally(() => setRiskLoading(false));
  };
  const finalRiskScore = Math.max(
    0,
    Math.min(100, baseRiskScore + (aiRisk?.connected ? aiRisk.adjustment : 0)),
  );
  const hasRiskData = holdings.length > 0;
  const riskLabel =
    !hasRiskData
      ? "보유 종목 없음"
      : finalRiskScore >= 85
      ? "안정 구간"
      : finalRiskScore >= 70
        ? "주의 구간"
        : "고위험 구간";
  const moveMoney = (valueKrw: number) =>
    moveCurrency === "KRW"
      ? `${valueKrw >= 0 ? "+" : "-"}${won(Math.abs(valueKrw))}`
      : `${valueKrw >= 0 ? "+" : "-"}${nativeMoney(Math.abs(valueKrw) / exchangeRate, "US")}`;
  const movementCard = (label: string, move: AccountMove, live = false) => (
    <div
      className={`account-move-card ${move.available ? (move.amountKrw >= 0 ? "up" : "down") : ""}`}
    >
      <div>
        <span>
          {live && <i />}
          {label}
        </span>
        <small>{live ? "10초 자동 갱신" : "전전일 종가 → 전일 종가"}</small>
      </div>
      {move.available ? (
        <>
          <strong>
            {move.percent >= 0 ? "+" : ""}
            {move.percent.toFixed(2)}%
          </strong>
          <b>{moveMoney(move.amountKrw)}</b>
          <p>
            {move.amountKrw > 0
              ? "계좌가 올랐어요"
              : move.amountKrw < 0
                ? "계좌가 내렸어요"
                : "변동이 없어요"}
          </p>
        </>
      ) : (
        <div className="move-loading">기준 종가 계산 중…</div>
      )}
    </div>
  );
  return (
    <>
      <section className="welcome-row compact">
        <div>
          <h1>포트폴리오</h1>
          <p className="subcopy">실제 보유 종목과 계좌 손익</p>
        </div>
      </section>
      <section className="dashboard-grid portfolio-dashboard">
        <article className="card portfolio-hub">
          <div className="portfolio-head">
            <div>
              <span className="label">보유주식 평가액</span>
              <strong className="hero-number">
                {portfolioMoney(holdingsValue, exchangeRate, currencyDisplay)}
              </strong>
              <span className="portfolio-caption">
                매입금액{" "}
                {portfolioMoney(investedCost, exchangeRate, currencyDisplay)}
              </span>
            </div>
            <div className="portfolio-head-side">
              <div
                className="currency-switch"
                aria-label="포트폴리오 표시 통화"
              >
                {(
                  [
                    ["KRW", "₩ 원화"],
                    ["USD", "$ 달러"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={currencyDisplay === value ? "active" : ""}
                    onClick={() => onCurrencyDisplay(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="gain-pill portfolio-performance">
                <span>평가손익</span>
                <b className={totalProfitLoss >= 0 ? "positive" : "negative"}>
                  {totalProfitLoss >= 0 ? "+" : ""}
                  {portfolioMoney(
                    totalProfitLoss,
                    exchangeRate,
                    currencyDisplay,
                  )}
                </b>
                <small
                  className={portfolioReturn >= 0 ? "positive" : "negative"}
                >
                  수익률 {pct(portfolioReturn)}
                </small>
              </span>
            </div>
          </div>
          <div className="asset-summary">
            <div>
              <span>총 매입금액</span>
              <strong>
                {portfolioMoney(investedCost, exchangeRate, currencyDisplay)}
              </strong>
            </div>
            <div>
              <span>보유 종목</span>
              <strong>{holdings.length}개</strong>
              <small>평가금액 큰 순으로 표시</small>
            </div>
            <div>
              <span>매수 가능</span>
              <strong>
                {portfolioMoney(buyingPower, exchangeRate, currencyDisplay)}
              </strong>
              <small>
                원화 {won(buyingPowerKrw)} · 달러{" "}
                {nativeMoney(buyingPowerUsd, "US")}
              </small>
            </div>
          </div>
          <section className="account-movement">
            <div className="account-movement-head">
              <div>
                <span>ACCOUNT MOVE</span>
                <h2>계좌 변동</h2>
              </div>
              <div className="move-currency" aria-label="계좌 변동 금액 통화">
                <button
                  className={moveCurrency === "KRW" ? "active" : ""}
                  onClick={() => setMoveCurrency("KRW")}
                >
                  ₩
                </button>
                <button
                  className={moveCurrency === "USD" ? "active" : ""}
                  onClick={() => setMoveCurrency("USD")}
                >
                  $
                </button>
              </div>
            </div>
            <div className="account-move-grid">
              {movementCard("전 거래일", accountMoves.previous)}
              {movementCard("오늘 실시간", accountMoves.today, true)}
            </div>
            <div className="account-trend-wrap">
              <div className="account-trend-head">
                <span>최근 20거래일</span>
                <strong>계좌 흐름</strong>
              </div>
              <AccountTrendChart points={accountTrend} />
              <div className="account-trend-footer">
                <span>현재 보유 수량 기준 추정</span>
                <b
                  className={
                    monthlyAccountReturn === null
                      ? ""
                      : monthlyAccountReturn >= 0
                        ? "positive"
                        : "negative"
                  }
                >
                  {trendLoading || monthlyAccountReturn === null
                    ? "지난달 대비 계산 중"
                    : `지난달 대비 ${pct(monthlyAccountReturn)}`}
                </b>
              </div>
            </div>
            <p>
              과거 매매·입출금은 반영하지 않은 현재 보유 수량 기준 추정치입니다.
              매수 가능 현금은 변동률 분모에 포함했습니다.
            </p>
          </section>
          <div className="portfolio-section-head">
            <div>
              <span>내 포트폴리오</span>
              <h2>보유 종목과 비중</h2>
            </div>
            <small>평가금액 큰 순 · 종목당 상한 40%</small>
          </div>
          <div className="portfolio-content">
            <div className="allocation-summary">
              <div
                className="donut"
                style={{
                  background: `conic-gradient(#5d7cff 0 ${kr}%,#995cf5 ${kr}% ${kr + us}%,#2c3543 ${kr + us}% 100%)`,
                }}
              >
                <div>
                  <strong>{holdings.length}</strong>
                  <span>보유 종목</span>
                </div>
              </div>
              <div className="legend">
                <span>
                  <i className="dot kr" />
                  국내주식 <b>{kr.toFixed(0)}%</b>
                </span>
                <span>
                  <i className="dot us" />
                  미국주식 <b>{us.toFixed(0)}%</b>
                </span>
                <span>
                  <i className="dot cash" />
                  매수 가능 <b>{cash.toFixed(0)}%</b>
                </span>
              </div>
            </div>
            <div className="holding-list integrated">
              {holdings.length === 0 ? (
                <div className="holdings-empty">
                  <strong>연결된 보유 종목이 없습니다</strong>
                  <span>
                    샘플 종목 대신 실제 토스 계좌 연결 결과만 표시합니다.
                  </span>
                </div>
              ) : (
                sortedHoldings.map((h) => {
                  return (
                    <button
                      className="holding-row"
                      key={h.symbol}
                      onClick={() => setSelectedHolding(h)}
                    >
                      <StockLogo ticker={h.symbol} name={h.name} />
                      <div className="stock-name">
                        <strong>{h.name}</strong>
                        <span>
                          {h.symbol} · {h.market}
                        </span>
                        <small>
                          현재가{" "}
                          {nativeMoney(h.lastPrice, h.market)}
                        </small>
                        <small className="average-price">
                          평단{" "}
                          {nativeMoney(h.averagePrice, h.market)}
                        </small>
                      </div>
                      <div className="weight">
                        <span
                          style={{
                            width: `${Math.min(100, totalAssets ? (h.valueKrw / totalAssets) * 220 : 0)}%`,
                          }}
                        />
                      </div>
                      <div className="stock-value">
                        <strong>
                          {portfolioMoney(
                            h.valueKrw,
                            exchangeRate,
                            currencyDisplay,
                          )}
                        </strong>
                      </div>
                      <span
                        className={h.returnRate >= 0 ? "positive" : "negative"}
                      >
                        {pct(h.returnRate)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </article>
        <article className="card risk-card">
          <div className="card-title-row">
            <div>
              <span className="label">이번 주 리스크</span>
              <h2>{riskLabel}</h2>
              <small
                className={`risk-ai-badge ${aiRisk?.connected ? "connected" : ""}`}
              >
                {!hasRiskData
                  ? "보유 종목 연결 후 계산"
                  : riskLoading
                  ? "시장 분석 중"
                  : aiRisk?.connected
                    ? "Gemini 최신 이슈 반영"
                    : "규칙 점수 · Gemini 연결 전"}
              </small>
            </div>
            <span className="risk-score">{hasRiskData ? finalRiskScore : "—"}</span>
          </div>
          {hasRiskData ? <>
            <div className="risk-meter">
              <span style={{ width: `${Math.max(8, finalRiskScore)}%` }} />
            </div>
            <div className="risk-list">
            <div>
              <span>
                <i className={biggestWeight <= 25 ? "ok" : "warn"}>
                  {biggestWeight <= 25 ? "✓" : "!"}
                </i>{" "}
                최대 종목 비중
              </span>
              <strong>
                {biggestWeight.toFixed(1)}% <small>/ 기준 25%</small>
              </strong>
            </div>
            <div>
              <span>
                <i className={leveragedExposure === 0 ? "ok" : "warn"}>
                  {leveragedExposure === 0 ? "✓" : "!"}
                </i>{" "}
                레버리지 노출
              </span>
              <strong>{leveragedExposure.toFixed(1)}%</strong>
            </div>
            <div>
              <span>
                <i className={cryptoExposure < 20 ? "ok" : "warn"}>
                  {cryptoExposure < 20 ? "✓" : "!"}
                </i>{" "}
                크립토 프록시
              </span>
              <strong>{cryptoExposure.toFixed(1)}%</strong>
            </div>
            {aiRisk?.connected && (
              <div>
                <span>
                  <i className={aiRisk.adjustment >= 0 ? "ok" : "warn"}>
                    {aiRisk.adjustment >= 0 ? "✓" : "!"}
                  </i>{" "}
                  최신 이슈 조정
                </span>
                <strong
                  className={aiRisk.adjustment >= 0 ? "positive" : "negative"}
                >
                  {aiRisk.adjustment >= 0 ? "+" : ""}
                  {aiRisk.adjustment}점
                </strong>
              </div>
            )}
            </div>
            <button
              className="secondary-button"
              onClick={() => setRiskOpen(true)}
            >
              점수와 근거 자세히 보기 <span>→</span>
            </button>
          </> : <p className="risk-empty">토스 계좌의 보유 종목을 연결하면 비중과 노출을 분석합니다.</p>}
        </article>
      </section>
      {riskOpen && hasRiskData && (
        <RiskDetailDrawer
          baseScore={baseRiskScore}
          finalScore={finalRiskScore}
          factors={riskFactors}
          analysis={aiRisk}
          loading={riskLoading}
          onRefresh={refreshRisk}
          onClose={() => setRiskOpen(false)}
        />
      )}
      {selectedHoldingItem && selectedHolding && (
        <StockDetailDrawer
          item={selectedHoldingItem}
          holding={selectedHolding}
          exchangeRate={exchangeRate}
          onClose={() => setSelectedHolding(null)}
        />
      )}
    </>
  );
}

function ReviewView({
  holdings,
  totalAssets,
  cashRatio,
  biggestWeight,
  accountMove,
}: {
  holdings: Holding[];
  totalAssets: number;
  cashRatio: number;
  biggestWeight: number;
  accountMove: AccountMove;
}) {
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [error, setError] = useState("");
  const payload = useMemo(
    () =>
      JSON.stringify({
        cashRatio,
        holdings: holdings.map((holding) => ({
          symbol: holding.symbol,
          name: holding.name,
          market: holding.market,
          weight: totalAssets ? (holding.valueKrw / totalAssets) * 100 : 0,
          returnRate: holding.returnRate,
          leveraged: LEVERAGED_SYMBOLS.has(holding.symbol.toUpperCase()),
          cryptoProxy: CRYPTO_PROXY_SYMBOLS.has(holding.symbol.toUpperCase()),
        })),
      }),
    [cashRatio, holdings, totalAssets],
  );
  const loadPlan = () => {
    setLoading(true);
    setError("");
    void fetch(`/api/weekly-plan?refresh=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json()) as WeeklyPlan & {
          message?: string;
        };
        if (!response.ok)
          throw new Error(
            data.message || "다음 주 계획을 불러오지 못했습니다.",
          );
        setPlan(data);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "다음 주 계획을 불러오지 못했습니다.",
        ),
      )
      .finally(() => setLoading(false));
  };
  const refreshCandidates = () => {
    setCandidateLoading(true);
    void fetch(`/api/weekly-plan?refresh=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json()) as WeeklyPlan & {
          message?: string;
        };
        if (!response.ok)
          throw new Error(data.message || "관찰 후보를 불러오지 못했습니다.");
        setPlan((current) =>
          current
            ? {
                ...current,
                candidates: data.candidates,
                generatedAt: data.generatedAt,
              }
            : data,
        );
      })
      .catch(() => {})
      .finally(() => setCandidateLoading(false));
  };
  useEffect(() => {
    let active = true;
    void fetch(`/api/weekly-plan?refresh=${Date.now()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json()) as WeeklyPlan & {
          message?: string;
        };
        if (!response.ok)
          throw new Error(
            data.message || "다음 주 계획을 불러오지 못했습니다.",
          );
        if (active) setPlan(data);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "다음 주 계획을 불러오지 못했습니다.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [payload]);
  const price = (value: number | null) =>
    value === null
      ? "—"
      : `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const highVolatilityExposure = totalAssets
    ? (holdings
        .filter(
          (holding) =>
            LEVERAGED_SYMBOLS.has(holding.symbol.toUpperCase()) ||
            CRYPTO_PROXY_SYMBOLS.has(holding.symbol.toUpperCase()),
        )
        .reduce((sum, holding) => sum + holding.valueKrw, 0) /
        totalAssets) *
      100
    : 0;
  const briefingStatus =
    biggestWeight > 40 || highVolatilityExposure > 50 || cashRatio < 8
      ? "대응 우선"
      : biggestWeight > 30 || highVolatilityExposure > 30 || cashRatio < 15
        ? "비중·현금 확인"
        : "현재 안정 범위";
  return (
    <section className="full-view review-view">
      <div className="view-header">
        <div>
          <p className="eyebrow">WEEKLY CHECK</p>
          <h1>이번 주 계좌 점검</h1>
          <p>
            보유 비중·현금 여력·오늘 변동을 기준으로 현재 계좌 상태를 확인합니다.
          </p>
        </div>
        <span className={`brief-status ${briefingStatus === "현재 안정 범위" ? "good" : "watch"}`}>
          {briefingStatus}
        </span>
      </div>
      <div className="review-brief card">
        <div className="review-brief-title">
          <div>
            <span>계좌 상태</span>
            <strong>현재 상태를 정하는 4가지 기준</strong>
          </div>
          <small>실시간 잔고·전일 종가 기준</small>
        </div>
        <div className="brief-grid">
          <article>
            <span>현금 완충력</span>
            <strong>{cashRatio.toFixed(1)}%</strong>
            <small>
              {cashRatio >= 20
                ? "추가 대응 여유 있음"
                : cashRatio >= 10
                  ? "분할 대응만 고려"
                  : "현금 확보 우선"}
            </small>
          </article>
          <article>
            <span>최대 종목 비중</span>
            <strong>{biggestWeight.toFixed(1)}%</strong>
            <small>
              {biggestWeight <= 25
                ? "집중도 안정"
                : biggestWeight <= 40
                  ? "추매 전 비중 확인"
                  : "비중 축소 검토"}
            </small>
          </article>
          <article>
            <span>고변동성 노출</span>
            <strong>{highVolatilityExposure.toFixed(1)}%</strong>
            <small>
              {highVolatilityExposure <= 20
                ? "관리 가능한 수준"
                : "레버리지·크립토 변동 주의"}
            </small>
          </article>
          <article>
            <span>오늘 계좌 변동</span>
            <strong
              className={
                accountMove.available
                  ? accountMove.percent >= 0
                    ? "positive"
                    : "negative"
                  : ""
              }
            >
              {accountMove.available ? pct(accountMove.percent) : "계산 중"}
            </strong>
            <small>
              {accountMove.available
                ? `${won(Math.abs(accountMove.amountKrw))} ${accountMove.amountKrw >= 0 ? "상승" : "하락"}`
                : "전일 종가 연결 후 표시"}
            </small>
          </article>
        </div>
      </div>
      <section className="weekly-plan card">
        <header>
          <div>
            <p className="eyebrow">자동 점검</p>
            <h2>보유 종목 대응</h2>
            <small>RSI · 지지/저항 · 20일선 기준</small>
          </div>
          <button
            className="secondary-button"
            onClick={loadPlan}
            disabled={loading}
          >
            {loading ? "분석 중…" : "↻ 종목 대응 갱신"}
          </button>
        </header>
        {loading ? (
          <div className="weekly-loading">
            보유 종목의 RSI·지지선·저항선을 계산하는 중…
          </div>
        ) : error ? (
          <div className="weekly-loading error">{error}</div>
        ) : (
          plan && (
            <>
          <p className="weekly-summary">{plan.summary}</p>
          <p className="weekly-trigger">
            손절 기준: 최근 20거래일 지지선보다 2% 아래로 이탈하면
            <b> 손절·재검토</b>로 표시됩니다.
          </p>
          <div className="weekly-actions">
                {plan.actions.length ? (
                  plan.actions.map((item) => (
                    <article key={item.symbol}>
                      <div>
                        <b>{item.symbol}</b>
                        <span>
                          {item.name} · 비중 {item.weight.toFixed(1)}%
                        </span>
                      </div>
                      <strong
                        className={`action-${item.action.includes("손절") ? "risk" : item.action.includes("보류") ? "wait" : item.action.includes("대응") ? "watch" : "cash"}`}
                      >
                        {item.action}
                      </strong>
                      <p>{item.reason}</p>
                      <small>
                        현재 {price(item.price)} · RSI{" "}
                        {item.rsi?.toFixed(0) ?? "—"} · 지지{" "}
                        {price(item.support)} · 저항 {price(item.resistance)}
                      </small>
                    </article>
                  ))
                ) : (
                  <div className="weekly-loading">
                    연결된 보유 종목이 있으면 종목별 대응이 표시됩니다.
                  </div>
                )}
              </div>
              <p className="weekly-disclaimer">{plan.disclaimer}</p>
            </>
          )
        )}
      </section>
      <section className="idea-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TECHNICAL WATCHLIST</p>
            <h2>오늘의 관찰 후보</h2>
          </div>
          <button
            className="secondary-button candidate-refresh"
            onClick={refreshCandidates}
            disabled={candidateLoading}
          >
            {candidateLoading ? "후보 분석 중…" : "↻ 후보 새로고침"}
          </button>
        </div>
        <div className="idea-grid">
          {plan?.candidates.map((item) => (
            <article className="card idea-card" key={item.symbol}>
              <div>
                <b>{item.symbol}</b>
                <span>{item.name}</span>
              </div>
              <strong>{item.setup}</strong>
              <p>{item.reason}</p>
              <small>
                현재 {price(item.price)} · RSI {item.rsi?.toFixed(0) ?? "—"} ·
                지지 {price(item.support)}
              </small>
            </article>
          ))}
        </div>
        <p className="weekly-disclaimer">
          ‘추천’이 아니라 기술 조건이 맞는 관찰 후보입니다. 최근 하락 원인은
          뉴스·실적을 별도로 확인한 뒤 판단하세요.
        </p>
      </section>
    </section>
  );
}
