import { HISTORY_END_X, LAST_KNOWN_PRICE, priceToY, yToPrice } from "./marketData";
import type { ChartPoint, Forecast, MonthlyCheckpoint, PriceScale } from "./types";

const MONTHS = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
const MONTH_LABELS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function clampPoint(point: ChartPoint): ChartPoint {
  return {
    x: clamp(point.x),
    y: clamp(point.y)
  };
}

export function getForwardOnlyPath(path: ChartPoint[], todayX = HISTORY_END_X): ChartPoint[] {
  const forwardPath: ChartPoint[] = [];

  for (const rawPoint of path) {
    const point = clampPoint(rawPoint);

    if (point.x < todayX) {
      continue;
    }

    const previous = forwardPath.at(-1);

    if (previous && point.x < previous.x) {
      continue;
    }

    forwardPath.push(point);
  }

  return forwardPath;
}

export function isDrawablePath(path: ChartPoint[]): boolean {
  return getForwardOnlyPath(path).length >= 4;
}

export function isDrawablePathFromToday(path: ChartPoint[], todayX: number): boolean {
  return getForwardOnlyPath(path, todayX).length >= 4;
}

export function smoothPath(path: ChartPoint[]): ChartPoint[] {
  if (path.length < 3) {
    return path.map(clampPoint);
  }

  return path.map((point, index) => {
    if (index === 0 || index === path.length - 1) {
      return clampPoint(point);
    }

    const previous = path[index - 1];
    const next = path[index + 1];

    return clampPoint({
      x: (previous.x + point.x + next.x) / 3,
      y: (previous.y + point.y + next.y) / 3
    });
  });
}

export function buildForecastPath(
  rawPath: ChartPoint[],
  scale?: PriceScale,
  todayX = HISTORY_END_X,
  lastKnownPrice = LAST_KNOWN_PRICE
): ChartPoint[] {
  const futurePoints = getForwardOnlyPath(rawPath, todayX);

  const anchored = [
    { x: todayX, y: clamp(priceToY(lastKnownPrice, scale)) },
    ...futurePoints,
    { x: 1, y: futurePoints.at(-1)?.y ?? clamp(priceToY(lastKnownPrice, scale)) }
  ];

  return smoothPath(anchored);
}

export function interpolateY(path: ChartPoint[], targetX: number): number {
  const sorted = [...path].sort((a, b) => a.x - b.x);

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const left = sorted[index];
    const right = sorted[index + 1];

    if (targetX >= left.x && targetX <= right.x) {
      const range = right.x - left.x || 1;
      const ratio = (targetX - left.x) / range;
      return left.y + (right.y - left.y) * ratio;
    }
  }

  return sorted.at(-1)?.y ?? priceToY(LAST_KNOWN_PRICE);
}

export function getMonthlyCheckpoints(
  path: ChartPoint[],
  scale?: PriceScale,
  todayX = HISTORY_END_X
): MonthlyCheckpoint[] {
  return MONTHS.map((month, index) => {
    const x = todayX + ((index + 1) / MONTHS.length) * (1 - todayX);
    return {
      month,
      price: yToPrice(interpolateY(path, x), scale)
    };
  });
}

export function getForecastMonthMarkers(todayX = HISTORY_END_X) {
  return MONTHS.map((month, index) => ({
    month,
    label: MONTH_LABELS[index],
    x: Math.round((todayX + ((index + 1) / MONTHS.length) * (1 - todayX)) * 100) / 100
  }));
}

export function getFinalPrice(path: ChartPoint[], scale?: PriceScale): number {
  return yToPrice(path.at(-1)?.y ?? priceToY(LAST_KNOWN_PRICE, scale), scale);
}

export function remapForecastPath(forecast: Forecast, targetScale: PriceScale): ChartPoint[] {
  const sourceScale = { min: forecast.scaleMin, max: forecast.scaleMax };

  return forecast.smoothPath.map((point) =>
    clampPoint({
      x: point.x,
      y: priceToY(yToPrice(point.y, sourceScale), targetScale)
    })
  );
}
