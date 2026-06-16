import { getDatabase, getRuntimeEnvValue } from "./db";
import { buildMarketState, DEFAULT_MARKET_SYMBOL, getMarketDateInNewYork, seededDailyCandles } from "./marketData";
import type { DailyCandle, MarketState } from "./types";

type MarketDayRow = {
  symbol: string;
  date: string;
  open: number;
  close: number;
  source: string;
  fetched_at: string;
};

type MarketFetchRow = {
  symbol: string;
  fetched_at: string;
  provider: string;
  ok: number;
  message: string | null;
};

type AlphaVantageDailyResponse = {
  "Time Series (Daily)"?: Record<string, {
    "1. open": string;
    "4. close": string;
  }>;
  "Error Message"?: string;
  Note?: string;
  Information?: string;
};

const ONE_DAY_MS = 86_400_000;
const TWO_HOURS_MS = 7_200_000;

function rowToCandle(row: MarketDayRow): DailyCandle {
  return {
    symbol: row.symbol,
    date: row.date,
    open: row.open,
    close: row.close,
    source: row.source,
    fetchedAt: row.fetched_at
  };
}

async function upsertMarketDay(candle: DailyCandle): Promise<void> {
  await (await getDatabase()).run(
    `INSERT INTO market_days (symbol, date, open, close, source, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(symbol, date) DO UPDATE SET
       open = excluded.open,
       close = excluded.close,
       source = excluded.source,
       fetched_at = excluded.fetched_at`,
    [candle.symbol, candle.date, candle.open, candle.close, candle.source, candle.fetchedAt]
  );
}

async function seedMarketDays(symbol = DEFAULT_MARKET_SYMBOL): Promise<void> {
  const db = await getDatabase();
  const existing = await db.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM market_days WHERE symbol = ?",
    [symbol]
  );

  const nonSeed = await db.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM market_days WHERE symbol = ? AND source != 'seed'",
    [symbol]
  );

  if ((existing?.count ?? 0) > 0 && (nonSeed?.count ?? 0) === 0) {
    const seedDates = new Set(seededDailyCandles.map((candle) => candle.date));
    const currentRows = await db.all<{ date: string }>(
      "SELECT date FROM market_days WHERE symbol = ?",
      [symbol]
    );
    const hasCurrentSeedShape =
      currentRows.length === seededDailyCandles.length &&
      currentRows.every((row) => seedDates.has(row.date));

    if (!hasCurrentSeedShape) {
      await db.run("DELETE FROM market_days WHERE symbol = ? AND source = 'seed'", [symbol]);
    }
  }

  const afterMigration = await db.get<{ count: number }>(
    "SELECT COUNT(*) as count FROM market_days WHERE symbol = ?",
    [symbol]
  );

  if ((afterMigration?.count ?? 0) > 0) {
    return;
  }

  for (const candle of seededDailyCandles) {
    await upsertMarketDay({ ...candle, symbol });
  }
}

export async function listMarketDays(symbol = DEFAULT_MARKET_SYMBOL): Promise<DailyCandle[]> {
  const rows = await (await getDatabase()).all<MarketDayRow>(
    "SELECT * FROM market_days WHERE symbol = ? ORDER BY date ASC",
    [symbol]
  );

  return rows.map(rowToCandle);
}

async function getLastFetch(symbol: string): Promise<MarketFetchRow | undefined> {
  return (await getDatabase()).get<MarketFetchRow>(
    "SELECT * FROM market_fetches WHERE symbol = ?",
    [symbol]
  );
}

async function getLatestProviderDate(symbol: string, source: string): Promise<string | undefined> {
  const row = await (await getDatabase()).get<{ date: string | null }>(
    "SELECT MAX(date) as date FROM market_days WHERE symbol = ? AND source = ?",
    [symbol, source]
  );

  return row?.date ?? undefined;
}

async function recordFetch(symbol: string, provider: string, ok: boolean, message?: string): Promise<void> {
  await (await getDatabase()).run(
    `INSERT INTO market_fetches (symbol, fetched_at, provider, ok, message)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET
       fetched_at = excluded.fetched_at,
       provider = excluded.provider,
       ok = excluded.ok,
       message = excluded.message`,
    [symbol, new Date().toISOString(), provider, ok ? 1 : 0, message ?? null]
  );
}

async function shouldRefresh(symbol: string): Promise<boolean> {
  const lastFetch = await getLastFetch(symbol);

  if (!lastFetch) {
    return true;
  }

  const today = getMarketDateInNewYork();
  const latestProviderDate = await getLatestProviderDate(symbol, "alpha-vantage");
  const refreshMs = latestProviderDate === today ? ONE_DAY_MS : TWO_HOURS_MS;

  return Date.now() - new Date(lastFetch.fetched_at).getTime() > refreshMs;
}

async function refreshFromAlphaVantage(symbol: string): Promise<void> {
  const apiKey = await getRuntimeEnvValue("ALPHA_VANTAGE_API_KEY");

  if (!apiKey || !(await shouldRefresh(symbol))) {
    return;
  }

  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "TIME_SERIES_DAILY");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("outputsize", "compact");
  url.searchParams.set("apikey", apiKey);

  try {
    const response = await fetch(url, { next: { revalidate: 86_400 } });

    if (!response.ok) {
      await recordFetch(symbol, "alpha-vantage", false, `HTTP ${response.status}`);
      return;
    }

    const payload = (await response.json()) as AlphaVantageDailyResponse;
    const series = payload["Time Series (Daily)"];

    if (!series) {
      await recordFetch(
        symbol,
        "alpha-vantage",
        false,
        payload["Error Message"] ?? payload.Note ?? payload.Information ?? "No daily series returned"
      );
      return;
    }

    const fetchedAt = new Date().toISOString();

    for (const [date, values] of Object.entries(series).slice(0, 30)) {
      const open = Number(values["1. open"]);
      const close = Number(values["4. close"]);

      if (!Number.isFinite(open) || !Number.isFinite(close)) {
        continue;
      }

      await upsertMarketDay({
        symbol,
        date,
        open,
        close,
        source: "alpha-vantage",
        fetchedAt
      });
    }

    await recordFetch(symbol, "alpha-vantage", true);
  } catch (error) {
    await recordFetch(symbol, "alpha-vantage", false, error instanceof Error ? error.message : "Fetch failed");
  }
}

export async function getMarketState(symbol?: string): Promise<MarketState> {
  const resolvedSymbol = symbol ?? (await getRuntimeEnvValue("MARKET_SYMBOL")) ?? DEFAULT_MARKET_SYMBOL;

  return buildMarketState(await listMarketDays(resolvedSymbol));
}

export async function refreshMarketData(symbol?: string): Promise<MarketState> {
  const resolvedSymbol = symbol ?? (await getRuntimeEnvValue("MARKET_SYMBOL")) ?? DEFAULT_MARKET_SYMBOL;
  await seedMarketDays(resolvedSymbol);
  await refreshFromAlphaVantage(resolvedSymbol);

  return buildMarketState(await listMarketDays(resolvedSymbol));
}
