export type ChartPoint = {
  x: number;
  y: number;
};

export type MarketPoint = ChartPoint & {
  timeLabel: string;
  price: number;
};

export type DailyCandle = {
  symbol: string;
  date: string;
  open: number;
  close: number;
  source: string;
  fetchedAt: string;
};

export type MarketState = {
  symbol: string;
  startDate: string;
  currentDate: string;
  endDate: string;
  todayX: number;
  calendarTodayX: number;
  lastKnownPrice: number;
  previousClose: number;
  todayOpen: number;
  todayClose: number;
  isCurrentSession: boolean;
  quoteValueLabel: "Open";
  change: number;
  changePercent: number;
  dailyCandles: DailyCandle[];
  historyPoints: MarketPoint[];
  source: string;
  updatedAt: string;
};

export type MonthlyCheckpoint = {
  month: string;
  price: number;
};

export type PriceScale = {
  min: number;
  max: number;
};

export type Forecast = {
  id: number;
  username: string;
  submittedAt: string;
  scaleMin: number;
  scaleMax: number;
  rawPath: ChartPoint[];
  smoothPath: ChartPoint[];
  monthlyCheckpoints: MonthlyCheckpoint[];
  finalPrice: number;
};

export type ForecastInput = {
  username: string;
  scaleMin: number;
  scaleMax: number;
  rawPath: ChartPoint[];
  smoothPath: ChartPoint[];
  monthlyCheckpoints: MonthlyCheckpoint[];
  finalPrice: number;
};
