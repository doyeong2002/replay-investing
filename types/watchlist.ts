export type WatchlistCategory =
  | 'HOLDINGS'
  | 'LEVERAGED'
  | 'M7'
  | 'AI_CHIPS'
  | 'SOFTWARE'
  | 'SPACE'
  | 'ENERGY'
  | 'QUANTUM'
  | 'BIO'
  | 'FINTECH'
  | 'CUSTOM';

export interface WatchlistStock {
  ticker: string;
  nameKo: string;
  category: WatchlistCategory;
}

export interface StockQuote {
  ticker: string;
  lastPrice: number;
  previousClose: number | null;
  dayChange: number | null;
  dayChangeAmount: number | null;
  currency: 'USD';
  updatedAt?: string;
}

export interface WatchlistItem extends WatchlistStock {
  quote: StockQuote | null;
  priceHistory: number[];
}

export interface StockCandle {
  timestamp: string;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  closePrice: number;
  volume: number;
}
