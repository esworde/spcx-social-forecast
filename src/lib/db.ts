import { getCloudflareContext } from "@opennextjs/cloudflare";

type SqlParam = string | number | null;
type SqlParams = SqlParam[];

type D1Result<T> = {
  results?: T[];
};

type D1PreparedStatementLike = {
  bind: (...params: SqlParams) => D1PreparedStatementLike;
  all: <T>() => Promise<D1Result<T>>;
  first: <T>() => Promise<T | null>;
  run: () => Promise<unknown>;
};

type D1DatabaseLike = {
  prepare: (query: string) => D1PreparedStatementLike;
  exec: (query: string) => Promise<unknown>;
};

export type R2BucketLike = Pick<R2Bucket, "get" | "put">;

type CloudflareEnvWithDatabase = CloudflareEnv & {
  DB?: D1DatabaseLike;
  FORECAST_SNAPSHOTS?: R2BucketLike;
  ALPHA_VANTAGE_API_KEY?: string;
  DATABASE_PROVIDER?: string;
  MARKET_SYMBOL?: string;
  MAX_FORECASTS?: string;
  DIRECT_FORECAST_READ_LIMIT?: string;
};

export type AppDatabase = {
  all: <T>(query: string, params?: SqlParams) => Promise<T[]>;
  get: <T>(query: string, params?: SqlParams) => Promise<T | undefined>;
  run: (query: string, params?: SqlParams) => Promise<void>;
  exec: (query: string) => Promise<void>;
};

export const APP_SCHEMA = `
  CREATE TABLE IF NOT EXISTS forecasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    submitted_at TEXT NOT NULL,
    scale_min REAL NOT NULL DEFAULT 140,
    scale_max REAL NOT NULL DEFAULT 230,
    raw_path TEXT NOT NULL,
    smooth_path TEXT NOT NULL,
    monthly_checkpoints TEXT NOT NULL,
    final_price REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS market_days (
    symbol TEXT NOT NULL,
    date TEXT NOT NULL,
    open REAL NOT NULL,
    close REAL NOT NULL,
    source TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    PRIMARY KEY (symbol, date)
  );

  CREATE TABLE IF NOT EXISTS market_fetches (
    symbol TEXT PRIMARY KEY,
    fetched_at TEXT NOT NULL,
    provider TEXT NOT NULL,
    ok INTEGER NOT NULL,
    message TEXT
  );
`;

let database: AppDatabase | undefined;
let localRawDatabase: { close: () => void } | undefined;
let runtimeCloudflareEnv: CloudflareEnvWithDatabase | undefined;

function getProcessEnvValue(name: string): string | undefined {
  return typeof process === "undefined" ? undefined : process.env[name];
}

function hasCloudflareContext(): boolean {
  const cloudflareContextSymbol = Symbol.for("__cloudflare-context__");
  return Boolean((globalThis as Record<symbol, unknown>)[cloudflareContextSymbol]);
}

async function getCloudflareEnv(): Promise<CloudflareEnvWithDatabase | undefined> {
  if (runtimeCloudflareEnv) {
    return runtimeCloudflareEnv;
  }

  try {
    const context = await getCloudflareContext({ async: true });
    return context.env as CloudflareEnvWithDatabase;
  } catch (error) {
    if (getProcessEnvValue("DATABASE_PROVIDER") === "d1") {
      throw error;
    }

    return undefined;
  }
}

export function setRuntimeCloudflareEnv(env: CloudflareEnvWithDatabase): void {
  runtimeCloudflareEnv = env;
}

export async function getRuntimeEnvValue(name: keyof CloudflareEnvWithDatabase): Promise<string | undefined> {
  return getProcessEnvValue(name) ?? ((await getCloudflareEnv())?.[name] as string | undefined);
}

export async function getForecastSnapshotBucket(): Promise<R2BucketLike | undefined> {
  return (await getCloudflareEnv())?.FORECAST_SNAPSHOTS;
}

async function getD1Database(): Promise<AppDatabase | undefined> {
  const provider = getProcessEnvValue("DATABASE_PROVIDER");

  if (!runtimeCloudflareEnv && provider !== "d1" && !hasCloudflareContext()) {
    return undefined;
  }

  const env = await getCloudflareEnv();
  const d1 = env?.DB;


  if (!d1) {
    throw new Error("D1 binding DB is missing.");
  }

  return {
    async all<T>(query: string, params: SqlParams = []) {
      const result = await d1.prepare(query).bind(...params).all<T>();
      return result.results ?? [];
    },
    async get<T>(query: string, params: SqlParams = []) {
      const result = await d1.prepare(query).bind(...params).first<T>();
      return result ?? undefined;
    },
    async run(query: string, params: SqlParams = []) {
      await d1.prepare(query).bind(...params).run();
    },
    async exec(query: string) {
      await d1.exec(query);
    }
  };
}

async function getLocalDatabase(): Promise<AppDatabase> {
  const [{ default: Database }, { mkdirSync }, { dirname, join }] = await Promise.all([
    import("better-sqlite3"),
    import("node:fs"),
    import("node:path")
  ]);
  const sqlitePath = getProcessEnvValue("SQLITE_PATH") ?? join(process.cwd(), "data", "forecasts.sqlite");
  mkdirSync(dirname(sqlitePath), { recursive: true });
  const raw = new Database(sqlitePath);
  localRawDatabase = raw;
  raw.pragma("journal_mode = WAL");

  const local: AppDatabase = {
    async all<T>(query: string, params: SqlParams = []) {
      return raw.prepare(query).all(...params) as T[];
    },
    async get<T>(query: string, params: SqlParams = []) {
      return raw.prepare(query).get(...params) as T | undefined;
    },
    async run(query: string, params: SqlParams = []) {
      raw.prepare(query).run(...params);
    },
    async exec(query: string) {
      raw.exec(query);
    }
  };

  await local.exec(APP_SCHEMA);
  await migrateLocalForecastScaleDefaults(local);

  return local;
}

async function migrateLocalForecastScaleDefaults(db: AppDatabase): Promise<void> {
  const columns = await db.all<{ name: string }>("PRAGMA table_info(forecasts)");
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("scale_min")) {
    await db.exec("ALTER TABLE forecasts ADD COLUMN scale_min REAL NOT NULL DEFAULT 140");
  }

  if (!columnNames.has("scale_max")) {
    await db.exec("ALTER TABLE forecasts ADD COLUMN scale_max REAL NOT NULL DEFAULT 230");
  }
}

export async function getDatabase(): Promise<AppDatabase> {
  if (!database) {
    database = (await getD1Database()) ?? (await getLocalDatabase());
  }

  return database;
}

export function resetDatabaseForTests(): void {
  localRawDatabase?.close();
  localRawDatabase = undefined;
  database = undefined;
}
