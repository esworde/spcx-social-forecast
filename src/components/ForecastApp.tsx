"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  buildMarketState,
  DEFAULT_PRICE_SCALE,
  getDefaultScaleForCandles,
  seededDailyCandles
} from "@/src/lib/marketData";
import type { ChartPoint, Forecast, MarketState } from "@/src/lib/types";
import { ForecastChart } from "./ForecastChart";

type ApiForecastsResponse = {
  forecasts: Forecast[];
};

type ApiMarketResponse = {
  market: MarketState;
};

type ApiForecastResponse = {
  forecast: Forecast;
  message?: string;
};

export function ForecastApp() {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [market, setMarket] = useState<MarketState>(() => buildMarketState(seededDailyCandles));
  const [rawPath, setRawPath] = useState<ChartPoint[]>([]);
  const [username, setUsername] = useState("");
  const [search, setSearch] = useState("");
  const [highlightedUsername, setHighlightedUsername] = useState<string | undefined>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scaleMin, setScaleMin] = useState(String(DEFAULT_PRICE_SCALE.min));
  const [scaleMax, setScaleMax] = useState(String(DEFAULT_PRICE_SCALE.max));
  const [hasCustomScale, setHasCustomScale] = useState(false);

  const chartScale = useMemo(() => {
    const min = Math.max(0, Number(scaleMin));
    const max = Number(scaleMax);

    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      return DEFAULT_PRICE_SCALE;
    }

    return { min, max };
  }, [scaleMin, scaleMax]);

  const marketDefaultScale = useMemo(
    () => getDefaultScaleForCandles(market.dailyCandles),
    [market.dailyCandles]
  );

  const highlightedForecast = useMemo(
    () => forecasts.find((forecast) => forecast.username === highlightedUsername),
    [forecasts, highlightedUsername]
  );

  async function refreshForecasts() {
    const response = await fetch("/api/forecasts");
    const data = (await response.json()) as ApiForecastsResponse;
    setForecasts(data.forecasts);
  }

  async function refreshMarket() {
    const response = await fetch("/api/market");
    const data = (await response.json()) as ApiMarketResponse;
    setMarket(data.market);
    const nextScale = getDefaultScaleForCandles(data.market.dailyCandles);
    setScaleMin((current) => (hasCustomScale ? current : String(nextScale.min)));
    setScaleMax((current) => (hasCustomScale ? current : String(nextScale.max)));
  }

  useEffect(() => {
    Promise.all([refreshForecasts(), refreshMarket()]).catch(() => {
      setError("Could not load current data.");
    });
  }, []);

  function normalizeScaleInputs() {
    const min = Math.max(0, Number(scaleMin));
    const max = Math.max(1, Number(scaleMax));

    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
      setScaleMin(String(marketDefaultScale.min));
      setScaleMax(String(marketDefaultScale.max));
      setHasCustomScale(false);
      return;
    }

    setScaleMin(String(min));
    setScaleMax(String(max));
  }

  useEffect(() => {
    if (hasCustomScale) {
      return;
    }

    setScaleMin(String(marketDefaultScale.min));
    setScaleMax(String(marketDefaultScale.max));
  }, [hasCustomScale, marketDefaultScale.max, marketDefaultScale.min]);

  function showForecast(forecast: Forecast) {
    setScaleMin(String(forecast.scaleMin));
    setScaleMax(String(forecast.scaleMax));
    setHasCustomScale(true);
    setHighlightedUsername(forecast.username);
    setMessage(`Showing @${forecast.username}'s $${forecast.finalPrice.toLocaleString()} forecast.`);
  }

  async function submitForecast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/forecasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          rawPath,
          scaleMin: chartScale.min,
          scaleMax: chartScale.max
        })
      });
      const data = (await response.json()) as ApiForecastResponse;

      if (!response.ok) {
        setError(data.message ?? "Could not save forecast. Try again.");
        return;
      }

      setForecasts((current) => [data.forecast, ...current]);
      setHighlightedUsername(data.forecast.username);
      setMessage(
        `@${data.forecast.username} predicts $${data.forecast.finalPrice.toLocaleString()} by Dec 31, 2026.`
      );
      setRawPath([]);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function searchForecast(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const normalized = search.trim().toLowerCase();

    if (!normalized) {
      setError("Enter a username to search.");
      return;
    }

    const existing = forecasts.find((forecast) => forecast.username === normalized);

    if (existing) {
      showForecast(existing);
      return;
    }

    const response = await fetch(`/api/forecasts/${encodeURIComponent(normalized)}`);
    const data = (await response.json()) as ApiForecastResponse;

    if (!response.ok) {
      setError(data.message ?? "No forecast found for that username.");
      return;
    }

    setForecasts((current) =>
      current.some((forecast) => forecast.username === data.forecast.username)
        ? current
        : [data.forecast, ...current]
    );
    showForecast(data.forecast);
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div className="brand">
          <div className="logo-box">
            <img className="ticker-logo" src="/spacex-logo.png" alt="SpaceX" />
          </div>
          <div>
            <h1 className="title">Space Exploration Technologies Corp</h1>
            <p className="subtitle">NASDAQ: SPCX</p>
          </div>
        </div>
      </section>

      <section className="quote-row" aria-label="SPCX quote">
        <span className="price">{market.lastKnownPrice.toLocaleString()}</span>
        <span className="currency">USD</span>
        <span className={market.change >= 0 ? "gain" : "gain loss"}>
          {market.change >= 0 ? "↑" : "↓"} {Math.abs(market.changePercent).toLocaleString()}%
        </span>
        <span className="daily-ohlc">Today open</span>
      </section>

      <ForecastChart
        rawPath={rawPath}
        onRawPathChange={setRawPath}
        forecasts={forecasts}
        scale={chartScale}
        market={market}
        highlightedUsername={highlightedUsername}
      />

      <p className="draw-prompt">Draw your forecast for SpaceX stock through Dec 31, 2026</p>

      <div className="scale-row" aria-label="Chart scale controls">
        <span className="scale-label">Scale</span>
        <label className="scale-field">
          Min
          <input
            className="scale-input"
            type="number"
            min="0"
            step="10"
            value={scaleMin}
            onChange={(event) => {
              setHasCustomScale(true);
              setScaleMin(event.target.value);
            }}
            onBlur={normalizeScaleInputs}
          />
        </label>
        <label className="scale-field">
          Max
          <input
            className="scale-input"
            type="number"
            min="1"
            step="10"
            value={scaleMax}
            onChange={(event) => {
              setHasCustomScale(true);
              setScaleMax(event.target.value);
            }}
            onBlur={normalizeScaleInputs}
          />
        </label>
        <button
          className="scale-reset"
          type="button"
          onClick={() => {
            setHasCustomScale(false);
            setScaleMin(String(marketDefaultScale.min));
            setScaleMax(String(marketDefaultScale.max));
          }}
        >
          Reset
        </button>
      </div>

      <form className="controls" onSubmit={submitForecast}>
        <input
          className="input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="username"
          aria-label="Username"
        />
        <button className="button" disabled={isSubmitting} type="submit">
          Submit forecast
        </button>
        <button className="button secondary" type="button" onClick={() => setRawPath([])}>
          Clear
        </button>
        <div className={error ? "message error" : "message"}>{error || message}</div>
      </form>

      <form className="controls search-row" onSubmit={searchForecast}>
        <input
          className="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="look up username"
          aria-label="Search username"
        />
        <button className="button secondary" type="submit">
          Search
        </button>
        <span className="message">{forecasts.length} forecasts submitted</span>
      </form>

      {highlightedForecast && (
        <div className="headline">
          @{highlightedForecast.username} predicts ${highlightedForecast.finalPrice.toLocaleString()} by Dec 31, 2026
        </div>
      )}
    </main>
  );
}
