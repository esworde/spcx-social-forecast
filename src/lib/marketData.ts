import type { DailyCandle, MarketPoint, MarketState, PriceScale } from "./types";

export const FORECAST_END_LABEL = "Dec 31, 2026";
export const FORECAST_END_DATE = "2026-12-31";
export const MARKET_START_DATE = "2026-06-12";
export const LAST_KNOWN_PRICE = 216.47;
export const PRICE_MIN = 140;
export const PRICE_MAX = 230;
export const DEFAULT_PRICE_SCALE: PriceScale = { min: PRICE_MIN, max: PRICE_MAX };
export const HISTORY_END_X = 0.34;
export const DEFAULT_MARKET_SYMBOL = "SPCX";

export const seededMarketPoints: MarketPoint[] = [
  { x: 0, y: 0, timeLabel: "Jun 12 open", price: 150 },
  { x: 0.11, y: 0, timeLabel: "Jun 12 close", price: 160.95 },
  { x: 0.17, y: 0, timeLabel: "Jun 15 open", price: 171.79 },
  { x: 0.27, y: 0, timeLabel: "Jun 15 close", price: 192.5 },
  { x: 0.3, y: 0, timeLabel: "Jun 16 open", price: 200.51 },
  { x: HISTORY_END_X, y: 0, timeLabel: "Now", price: LAST_KNOWN_PRICE }
];

export const seededDailyCandles: DailyCandle[] = [
  {
    symbol: DEFAULT_MARKET_SYMBOL,
    date: "2026-06-12",
    open: 150,
    close: 160.95,
    source: "seed",
    fetchedAt: "2026-06-12T20:00:00.000Z"
  },
  {
    symbol: DEFAULT_MARKET_SYMBOL,
    date: "2026-06-15",
    open: 171.79,
    close: 192.5,
    source: "seed",
    fetchedAt: "2026-06-15T20:00:00.000Z"
  },
  {
    symbol: DEFAULT_MARKET_SYMBOL,
    date: "2026-06-16",
    open: 200.51,
    close: LAST_KNOWN_PRICE,
    source: "seed",
    fetchedAt: "2026-06-16T16:58:23.000Z"
  }
];

export function priceToY(price: number, scale: PriceScale = DEFAULT_PRICE_SCALE): number {
  return 1 - (price - scale.min) / (scale.max - scale.min);
}

export function yToPrice(y: number, scale: PriceScale = DEFAULT_PRICE_SCALE): number {
  const price = scale.min + (1 - y) * (scale.max - scale.min);
  return Math.round(price * 100) / 100;
}

export function getDefaultScaleForCandles(candles: DailyCandle[]): PriceScale {
  const prices = candles.flatMap((candle) => [candle.open, candle.close]);

  if (prices.length === 0) {
    return DEFAULT_PRICE_SCALE;
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = Math.max(10, (max - min) * 0.12);

  return {
    min: Math.max(0, Math.floor((min - padding) / 10) * 10),
    max: Math.ceil((max + padding) / 10) * 10
  };
}

function parseIsoDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function getMarketDateInNewYork(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function daysBetween(startDate: string, endDate: string): number {
  const start = parseIsoDate(startDate).getTime();
  const end = parseIsoDate(endDate).getTime();
  return Math.floor((end - start) / 86_400_000);
}

export function getDateX(
  date: string,
  startDate = MARKET_START_DATE,
  endDate = FORECAST_END_DATE
): number {
  const totalDays = Math.max(1, daysBetween(startDate, endDate));
  return Math.min(1, Math.max(0, daysBetween(startDate, date) / totalDays));
}

export function getTodayX(
  currentDate = getMarketDateInNewYork(),
  startDate = MARKET_START_DATE,
  endDate = FORECAST_END_DATE
): { todayX: number; calendarTodayX: number } {
  const calendarTodayX = getDateX(currentDate, startDate, endDate);

  return {
    calendarTodayX,
    todayX: Math.max(HISTORY_END_X, calendarTodayX)
  };
}

export function buildHistoryPoints(candles: DailyCandle[], todayX: number): MarketPoint[] {
  const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    return seededMarketPoints;
  }

  return sorted.map((candle, index) => {
    const ratio = sorted.length === 1 ? 1 : index / (sorted.length - 1);

    return {
      x: Math.min(todayX, ratio * todayX),
      y: 0,
      timeLabel: `${candle.date} open`,
      price: candle.open
    };
  });
}

export function buildMarketState(candles: DailyCandle[], currentDate = getMarketDateInNewYork()): MarketState {
  const dailyCandles = candles.length > 0 ? candles : seededDailyCandles;
  const sorted = [...dailyCandles].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1) ?? seededDailyCandles.at(-1)!;
  const previous = sorted.length > 1 ? sorted.at(-2)! : latest;
  const isCurrentSession = latest.date === currentDate;
  const publicPrice = latest.open;
  const change = Math.round((publicPrice - previous.close) * 100) / 100;
  const changePercent = previous.close === 0 ? 0 : Math.round((change / previous.close) * 10_000) / 100;
  const { todayX, calendarTodayX } = getTodayX(currentDate);

  return {
    symbol: latest.symbol,
    startDate: MARKET_START_DATE,
    currentDate,
    endDate: FORECAST_END_DATE,
    todayX,
    calendarTodayX,
    lastKnownPrice: publicPrice,
    previousClose: previous.close,
    todayOpen: latest.open,
    todayClose: latest.close,
    isCurrentSession,
    quoteValueLabel: "Open",
    change,
    changePercent,
    dailyCandles: sorted,
    historyPoints: buildHistoryPoints(sorted, todayX),
    source: latest.source,
    updatedAt: latest.fetchedAt
  };
}
