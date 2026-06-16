"use client";

import type { Dispatch, SetStateAction } from "react";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildForecastPath, clampPoint, getForecastMonthMarkers, remapForecastPath } from "@/src/lib/forecastMath";
import { FORECAST_END_LABEL, priceToY, yToPrice } from "@/src/lib/marketData";
import { getCanvasCrowdForecasts, shouldUseDensityCanvas } from "@/src/lib/crowdRendering";
import { MAX_FORECAST_POINTS } from "@/src/lib/forecastLimits";
import type { ChartPoint, Forecast, MarketState, PriceScale } from "@/src/lib/types";

type ForecastChartProps = {
  rawPath: ChartPoint[];
  onRawPathChange: Dispatch<SetStateAction<ChartPoint[]>>;
  forecasts: Forecast[];
  scale: PriceScale;
  market: MarketState;
  highlightedUsername?: string;
  disabled?: boolean;
};

const WIDTH = 1000;
const HEIGHT = 420;
const PAD_LEFT = 58;
const PAD_RIGHT = 28;
const PAD_TOP = 26;
const PAD_BOTTOM = 46;

function toSvgPoint(point: ChartPoint) {
  return {
    x: PAD_LEFT + point.x * (WIDTH - PAD_LEFT - PAD_RIGHT),
    y: PAD_TOP + point.y * (HEIGHT - PAD_TOP - PAD_BOTTOM)
  };
}

function toPolyline(points: ChartPoint[]): string {
  return points
    .map(toSvgPoint)
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
}

function normalizeEventPoint(svg: SVGSVGElement, clientX: number, clientY: number): ChartPoint {
  const rect = svg.getBoundingClientRect();
  const x = (clientX - rect.left - PAD_LEFT) / (rect.width - PAD_LEFT - PAD_RIGHT);
  const y = (clientY - rect.top - PAD_TOP) / (rect.height - PAD_TOP - PAD_BOTTOM);

  return clampPoint({ x, y });
}

export function ForecastChart({
  rawPath,
  onRawPathChange,
  forecasts,
  scale,
  market,
  highlightedUsername,
  disabled = false
}: ForecastChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const previewPath = useMemo(
    () => (rawPath.length >= 2 ? buildForecastPath(rawPath, scale, market.todayX, market.todayOpen) : []),
    [rawPath, scale, market.todayOpen, market.todayX]
  );
  const highlighted = forecasts.find((forecast) => forecast.username === highlightedUsername);
  const useDensityCanvas = shouldUseDensityCanvas(forecasts.length);
  const canvasForecasts = useMemo(
    () => getCanvasCrowdForecasts(forecasts, highlightedUsername),
    [forecasts, highlightedUsername]
  );
  const crowdOpacity = forecasts.length > 5000 ? 0.035 : forecasts.length > 1000 ? 0.055 : 0.16;
  const historyPath = useMemo(
    () =>
      market.historyPoints.map((point) =>
        clampPoint({
          x: point.x,
          y: priceToY(point.price, scale)
        })
      ),
    [market.historyPoints, scale]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const svg = svgRef.current;

    if (!canvas || !svg || !useDensityCanvas) {
      return;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return;
    }

    const rect = svg.getBoundingClientRect();
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(rect.height * devicePixelRatio));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = forecasts.length > 5000 ? 1 : 1.25;
    context.strokeStyle = forecasts.length > 5000
      ? "rgba(180, 185, 195, 0.015)"
      : "rgba(180, 185, 195, 0.035)";

    for (const forecast of canvasForecasts) {
      const path = remapForecastPath(forecast, scale);

      if (path.length < 2) {
        continue;
      }

      context.beginPath();

      path.forEach((point, index) => {
        const svgPoint = toSvgPoint(point);
        const x = (svgPoint.x / WIDTH) * rect.width;
        const y = (svgPoint.y / HEIGHT) * rect.height;

        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });

      context.stroke();
    }
  }, [canvasForecasts, forecasts.length, scale, useDensityCanvas]);

  function addPoint(clientX: number, clientY: number, replace = false) {
    if (!svgRef.current || disabled) {
      return;
    }

    const point = normalizeEventPoint(svgRef.current, clientX, clientY);

    if (point.x < market.todayX) {
      return;
    }

    onRawPathChange((current) => {
      if (replace) {
        return [point];
      }

      const previous = current.at(-1);

      if (previous && point.x < previous.x) {
        return current;
      }

      if (current.length >= MAX_FORECAST_POINTS) {
        return current;
      }

      return [...current, point];
    });
  }

  return (
    <div className="chart-wrap" style={{ "--crowd-opacity": crowdOpacity } as CSSProperties}>
      {useDensityCanvas && <canvas ref={canvasRef} className="crowd-density-canvas" aria-hidden="true" />}
      <svg
        ref={svgRef}
        className="forecast-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="SPCX chart with drawable forecast through Dec 31, 2026"
        onPointerDown={(event) => {
          if (disabled) {
            return;
          }

          event.currentTarget.setPointerCapture(event.pointerId);
          setIsDrawing(true);
          addPoint(event.clientX, event.clientY, true);
        }}
        onPointerMove={(event) => {
          if (isDrawing) {
            addPoint(event.clientX, event.clientY);
          }
        }}
        onPointerUp={() => setIsDrawing(false)}
        onPointerCancel={() => setIsDrawing(false)}
      >
        {[0.15, 0.35, 0.55, 0.75, 0.95].map((y) => {
          const svgY = toSvgPoint({ x: 0, y }).y;
          return (
            <line
              key={y}
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={svgY}
              y2={svgY}
              className="grid-line"
            />
          );
        })}

        <line
          x1={toSvgPoint({ x: market.todayX, y: 0 }).x}
          x2={toSvgPoint({ x: market.todayX, y: 0 }).x}
          y1={PAD_TOP}
          y2={HEIGHT - PAD_BOTTOM}
          className="today-line"
        />

        <rect
          x={toSvgPoint({ x: market.todayX, y: 0 }).x}
          y={PAD_TOP}
          width={toSvgPoint({ x: 1, y: 0 }).x - toSvgPoint({ x: market.todayX, y: 0 }).x}
          height={HEIGHT - PAD_TOP - PAD_BOTTOM}
          className="future-zone"
        />

        {getForecastMonthMarkers(market.todayX).map((marker) => {
          const markerX = toSvgPoint({ x: marker.x, y: 0 }).x;

          return (
            <g key={marker.month}>
              <line
                x1={markerX}
                x2={markerX}
                y1={PAD_TOP}
                y2={HEIGHT - PAD_BOTTOM}
                className="month-line"
              />
              <text x={markerX} y={PAD_TOP + 18} className="month-label">
                {marker.label}
              </text>
            </g>
          );
        })}

        <polyline points={toPolyline(historyPath)} className="history-line" />

        {forecasts
          .filter((forecast) => !useDensityCanvas || forecast.username === highlightedUsername)
          .map((forecast) => (
          <polyline
            key={forecast.username}
            points={toPolyline(remapForecastPath(forecast, scale))}
            className={forecast.username === highlightedUsername ? "forecast-line active" : "forecast-line"}
          />
        ))}

        {previewPath.length > 0 && <polyline points={toPolyline(previewPath)} className="draw-line" />}

        {highlighted && (
          <circle
            cx={toSvgPoint(remapForecastPath(highlighted, scale).at(-1) ?? highlighted.smoothPath[0]).x}
            cy={toSvgPoint(remapForecastPath(highlighted, scale).at(-1) ?? highlighted.smoothPath[0]).y}
            r="5"
            className="end-dot"
          />
        )}

        <text x={PAD_LEFT} y={HEIGHT - 14} className="axis-label">
          Since IPO
        </text>
        <text x={toSvgPoint({ x: market.todayX, y: 0 }).x - 16} y={HEIGHT - 14} className="axis-label">
          Today
        </text>
        <text x={WIDTH - 122} y={HEIGHT - 14} className="axis-label">
          {FORECAST_END_LABEL}
        </text>
        <text x={8} y={toSvgPoint({ x: 0, y: 0.15 }).y + 5} className="price-label">
          ${yToPrice(0.15, scale).toLocaleString()}
        </text>
        <text x={8} y={toSvgPoint({ x: 0, y: 0.55 }).y + 5} className="price-label">
          ${yToPrice(0.55, scale).toLocaleString()}
        </text>
        <text x={8} y={toSvgPoint({ x: 0, y: 0.95 }).y + 5} className="price-label">
          ${yToPrice(0.95, scale).toLocaleString()}
        </text>
      </svg>
    </div>
  );
}
