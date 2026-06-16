import { getForecastSnapshotBucket, getRuntimeEnvValue, type R2BucketLike } from "./db";
import { countForecasts, listForecasts, listForecastsAfterId } from "./forecastRepo";
import type { Forecast } from "./types";

const FORECAST_CHUNK_SIZE = 500;
const FORECAST_EXPORT_BATCH_SIZE = 2000;
const DEFAULT_DIRECT_FORECAST_READ_LIMIT = 2000;
const FORECAST_CHUNK_PREFIX = "forecasts/chunks/";
const FORECAST_MANIFEST_KEY = "forecasts/manifest.json";
const SNAPSHOT_VERSION = 1;

export const FORECAST_MANIFEST_CACHE_SECONDS = 60;
export const FORECAST_CHUNK_CACHE_SECONDS = 31_536_000;

export type ForecastSnapshotChunkDescriptor = {
  sequence: number;
  key: string;
  path: string;
  count: number;
  firstForecastId: number;
  lastForecastId: number;
  sealed: boolean;
};

export type ForecastSnapshotManifest = {
  version: 1;
  count: number;
  lastForecastId: number;
  updatedAt: string;
  chunkSize: number;
  chunks: ForecastSnapshotChunkDescriptor[];
};

type ForecastSnapshotChunk = {
  version: 1;
  sequence: number;
  sealed: boolean;
  forecasts: Forecast[];
};

type SnapshotExportResult = {
  ok: boolean;
  exported: number;
  count: number;
  message?: string;
};

export type ForecastListResult = {
  forecasts: Forecast[];
  source: "database" | "snapshot";
};

function emptyManifest(now: Date): ForecastSnapshotManifest {
  return {
    version: SNAPSHOT_VERSION,
    count: 0,
    lastForecastId: 0,
    updatedAt: now.toISOString(),
    chunkSize: FORECAST_CHUNK_SIZE,
    chunks: []
  };
}

function chunkKey(sequence: number): string {
  return `${FORECAST_CHUNK_PREFIX}${String(sequence).padStart(6, "0")}.json`;
}

function chunkPath(sequence: number): string {
  return `/api/forecast-snapshot/chunks/${String(sequence).padStart(6, "0")}.json`;
}

function descriptorFor(sequence: number, forecasts: Forecast[], sealed: boolean): ForecastSnapshotChunkDescriptor {
  return {
    sequence,
    key: chunkKey(sequence),
    path: chunkPath(sequence),
    count: forecasts.length,
    firstForecastId: forecasts[0]?.id ?? 0,
    lastForecastId: forecasts.at(-1)?.id ?? 0,
    sealed
  };
}

async function readJsonObject<T>(bucket: R2BucketLike, key: string): Promise<T | null> {
  const object = await bucket.get(key);

  if (!object) {
    return null;
  }

  return JSON.parse(await object.text()) as T;
}

async function writeJsonObject(
  bucket: R2BucketLike,
  key: string,
  value: unknown,
  cacheControl: string
): Promise<void> {
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl
    }
  });
}

async function readManifestFromBucket(bucket: R2BucketLike): Promise<ForecastSnapshotManifest | null> {
  return readJsonObject<ForecastSnapshotManifest>(bucket, FORECAST_MANIFEST_KEY);
}

async function writeManifest(bucket: R2BucketLike, manifest: ForecastSnapshotManifest): Promise<void> {
  await writeJsonObject(
    bucket,
    FORECAST_MANIFEST_KEY,
    manifest,
    `public, max-age=${FORECAST_MANIFEST_CACHE_SECONDS}`
  );
}

async function readChunkFromBucket(
  bucket: R2BucketLike,
  descriptor: ForecastSnapshotChunkDescriptor
): Promise<ForecastSnapshotChunk | null> {
  return readJsonObject<ForecastSnapshotChunk>(bucket, descriptor.key);
}

async function writeChunk(
  bucket: R2BucketLike,
  descriptor: ForecastSnapshotChunkDescriptor,
  forecasts: Forecast[]
): Promise<void> {
  const cacheControl = descriptor.sealed
    ? `public, max-age=${FORECAST_CHUNK_CACHE_SECONDS}, immutable`
    : `public, max-age=${FORECAST_MANIFEST_CACHE_SECONDS}`;

  await writeJsonObject(
    bucket,
    descriptor.key,
    {
      version: SNAPSHOT_VERSION,
      sequence: descriptor.sequence,
      sealed: descriptor.sealed,
      forecasts
    } satisfies ForecastSnapshotChunk,
    cacheControl
  );
}

export async function getForecastSnapshotManifest(): Promise<ForecastSnapshotManifest | null> {
  const bucket = await getForecastSnapshotBucket();

  if (!bucket) {
    return null;
  }

  return readManifestFromBucket(bucket);
}

export async function getForecastSnapshotChunkByFileName(fileName: string): Promise<Response | null> {
  if (!/^\d{6}\.json$/.test(fileName)) {
    return null;
  }

  const bucket = await getForecastSnapshotBucket();

  if (!bucket) {
    return null;
  }

  const key = `${FORECAST_CHUNK_PREFIX}${fileName}`;
  const object = await bucket.get(key);

  if (!object) {
    return null;
  }

  const isSealed = object.httpMetadata?.cacheControl?.includes("immutable") ?? false;

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/json; charset=utf-8",
      "Cache-Control":
        object.httpMetadata?.cacheControl ??
        `public, max-age=${isSealed ? FORECAST_CHUNK_CACHE_SECONDS : FORECAST_MANIFEST_CACHE_SECONDS}`
    }
  });
}

export async function listForecastsFromSnapshot(): Promise<Forecast[] | null> {
  const bucket = await getForecastSnapshotBucket();

  if (!bucket) {
    return null;
  }

  const manifest = await readManifestFromBucket(bucket);

  if (!manifest) {
    return null;
  }

  const forecasts: Forecast[] = [];

  for (const descriptor of manifest.chunks) {
    const chunk = await readChunkFromBucket(bucket, descriptor);

    if (!chunk) {
      return null;
    }

    forecasts.push(...chunk.forecasts);
  }

  return forecasts.sort((a, b) => b.id - a.id);
}

export async function refreshForecastSnapshot(now = new Date()): Promise<SnapshotExportResult> {
  const bucket = await getForecastSnapshotBucket();

  if (!bucket) {
    return { ok: false, exported: 0, count: 0, message: "R2 forecast snapshot bucket is missing." };
  }

  const storedManifest = await readManifestFromBucket(bucket);
  const existingManifest = storedManifest ?? emptyManifest(now);
  const chunks = [...existingManifest.chunks];
  const lastChunk = chunks.at(-1);
  let currentChunkForecasts: Forecast[] = [];
  let currentSequence: number | undefined;

  if (lastChunk && !lastChunk.sealed) {
    const chunk = await readChunkFromBucket(bucket, lastChunk);
    currentSequence = lastChunk.sequence;
    currentChunkForecasts = chunk?.forecasts ?? [];
    chunks.pop();
  }

  let exported = 0;
  let lastForecastId = existingManifest.lastForecastId;

  while (true) {
    const nextForecasts = await listForecastsAfterId(lastForecastId, FORECAST_EXPORT_BATCH_SIZE);

    if (nextForecasts.length === 0) {
      break;
    }

    for (const forecast of nextForecasts) {
      if (currentSequence === undefined) {
        currentSequence = chunks.length + 1;
        currentChunkForecasts = [];
      }

      currentChunkForecasts.push(forecast);
      lastForecastId = forecast.id;
      exported += 1;

      if (currentChunkForecasts.length >= FORECAST_CHUNK_SIZE) {
        const descriptor = descriptorFor(currentSequence, currentChunkForecasts, true);
        await writeChunk(bucket, descriptor, currentChunkForecasts);
        chunks.push(descriptor);
        currentSequence = undefined;
        currentChunkForecasts = [];
      }
    }

    if (nextForecasts.length < FORECAST_EXPORT_BATCH_SIZE) {
      break;
    }
  }

  if (currentSequence !== undefined && currentChunkForecasts.length > 0) {
    const descriptor = descriptorFor(currentSequence, currentChunkForecasts, false);
    await writeChunk(bucket, descriptor, currentChunkForecasts);
    chunks.push(descriptor);
  }

  if (exported === 0) {
    if (!storedManifest) {
      await writeManifest(bucket, existingManifest);
    }

    return { ok: true, exported, count: existingManifest.count };
  }

  const manifest: ForecastSnapshotManifest = {
    version: SNAPSHOT_VERSION,
    count: chunks.reduce((sum, chunk) => sum + chunk.count, 0),
    lastForecastId,
    updatedAt: now.toISOString(),
    chunkSize: FORECAST_CHUNK_SIZE,
    chunks
  };

  await writeManifest(bucket, manifest);

  return { ok: true, exported, count: manifest.count };
}

export async function listForecastsFromSnapshotOrDatabase(): Promise<ForecastListResult> {
  const directReadLimit = await getDirectForecastReadLimit();
  const forecastCount = await countForecasts();

  if (forecastCount <= directReadLimit) {
    return { forecasts: await listForecasts(), source: "database" };
  }

  const snapshotForecasts = await listForecastsFromSnapshot();

  if (snapshotForecasts) {
    return { forecasts: snapshotForecasts, source: "snapshot" };
  }

  return { forecasts: await listForecasts(), source: "database" };
}

async function getDirectForecastReadLimit(): Promise<number> {
  const rawValue = await getRuntimeEnvValue("DIRECT_FORECAST_READ_LIMIT");
  const value = Number(rawValue);

  if (!rawValue || !Number.isFinite(value) || value < 0) {
    return DEFAULT_DIRECT_FORECAST_READ_LIMIT;
  }

  return Math.floor(value);
}
