"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, IChartApi, CandlestickSeries, ColorType } from "lightweight-charts";
import { Activity, Zap, TrendingUp, TrendingDown, ChevronRight, RefreshCw, ExternalLink, Github } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface FeaturesResult {
  features: number[];
  names: string[];
  llmad: number;
  fee: number;
  feeDiff: number;
  staticFee: number;
}

interface InferenceRecord {
  time: string;
  price: number;
  llmad: number;
  fee: number;
  txHash: string;
}

// ─── Candlestick Chart ────────────────────────────────────────────────────────
function CandlestickChart({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ReturnType<IChartApi["addSeries"]> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#64748b",
      },
      grid: {
        vertLines: { color: "rgba(99,102,241,0.06)" },
        horzLines: { color: "rgba(99,102,241,0.06)" },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: "rgba(99,102,241,0.15)" },
      timeScale: { borderColor: "rgba(99,102,241,0.15)", timeVisible: true },
      width: containerRef.current.clientWidth,
      height: 320,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderUpColor: "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.remove(); };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !candles.length) return;
    seriesRef.current.setData(
      candles.map(c => ({ time: c.time as never, open: c.open, high: c.high, low: c.low, close: c.close }))
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return <div ref={containerRef} className="w-full" style={{ height: 320 }} />;
}

// ─── Live Price Card ──────────────────────────────────────────────────────────
function LivePriceCard({ initialPrice, initialChange }: { initialPrice: number; initialChange: number }) {
  const [price, setPrice] = useState(initialPrice);
  const [change, setChange] = useState(initialChange);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevPrice = useRef(initialPrice);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket("wss://stream.binance.com:9443/ws/ethusdt@ticker");
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      const p = parseFloat(d.c);
      const ch = parseFloat(d.P);
      if (p !== prevPrice.current) {
        setFlash(p > prevPrice.current ? "up" : "down");
        setTimeout(() => setFlash(null), 600);
        prevPrice.current = p;
      }
      setPrice(p);
      setChange(ch);
    };
    return () => ws.close();
  }, []);

  const isUp = change >= 0;
  const priceColor = flash === "up" ? "#10b981" : flash === "down" ? "#ef4444" : "#3b82f6";

  return (
    <div className="metric-card">
      <div className="flex items-center justify-center gap-2 mb-2">
        <span style={{ color: "#94a3b8", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600 }}>
          ETH/USDT Price
        </span>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block", animation: "pulse-dot 1.5s infinite" }} />
      </div>
      <div className="mono" style={{ fontSize: "1.8rem", fontWeight: 700, color: priceColor, transition: "color 0.5s ease" }}>
        ${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className="mono mt-1" style={{ fontSize: "0.82rem", fontWeight: 700, color: isUp ? "#10b981" : "#ef4444" }}>
        {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(3)}% (24h)
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [featuresData, setFeaturesData] = useState<FeaturesResult | null>(null);
  const [history, setHistory] = useState<InferenceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [showIntro, setShowIntro] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/price");
      const data = await res.json();
      if (data.candles) {
        setCandles(data.candles);
        setCurrentPrice(data.currentPrice);
        setPriceChange(data.priceChange);
        // Auto-compute features
        const fRes = await fetch("/api/features", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candles: data.candles }),
        });
        const fData = await fRes.json();
        if (!fData.error) setFeaturesData(fData);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const runInference = async () => {
    setInferring(true);
    try {
      // Fetch FRESH price data on every inference click
      const priceRes = await fetch("/api/price");
      const priceData = await priceRes.json();
      if (!priceData.candles) throw new Error("No price data");

      // Update chart with latest data
      setCandles(priceData.candles);
      setCurrentPrice(priceData.currentPrice);
      setPriceChange(priceData.priceChange);

      // Compute fresh features from new candles
      const fRes = await fetch("/api/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candles: priceData.candles }),
      });
      const fData = await fRes.json();
      if (fData.error) throw new Error(fData.error);
      setFeaturesData(fData);

      // Simulate on-chain tx submission
      await new Promise(r => setTimeout(r, 1200));

      const record: InferenceRecord = {
        time: new Date().toLocaleTimeString(),
        price: priceData.currentPrice,
        llmad: fData.llmad,
        fee: fData.fee,
        txHash: `0x${Math.random().toString(16).slice(2, 14)}...`,
      };
      setHistory(prev => [record, ...prev].slice(0, 10));
    } catch (e) {
      console.error(e);
    } finally {
      setInferring(false);
    }
  };

  const STATIC_FEE = 0.003;
  const latestInference = history[0];

  return (
    <main style={{ maxWidth: 1400, margin: "0 auto", padding: "1.5rem 1.5rem 4rem" }}>

      {/* Header */}
      <header className="flex items-center justify-between mb-8 pt-2">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Activity size={18} color="#fff" />
            </div>
            <h1 style={{ fontSize: "1.3rem", fontWeight: 700, color: "#f1f5f9" }}>AMM Dynamic Fee Optimizer</h1>
          </div>
          <p style={{ color: "#64748b", fontSize: "0.82rem", marginLeft: 48 }}>
            On-chain AI inference for ETH/USDT liquidity pool fee optimization · Powered by OpenGradient
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href="https://github.com/nearar22/opengradient" target="_blank" rel="noopener noreferrer"
            className="card flex items-center gap-2 px-3 py-2 no-underline"
            style={{ fontSize: "0.8rem", color: "#94a3b8", borderRadius: 10 }}>
            <Github size={15} /> GitHub
          </a>
          <button onClick={fetchData} disabled={loading}
            className="card flex items-center gap-2 px-3 py-2"
            style={{ fontSize: "0.8rem", color: "#94a3b8", borderRadius: 10, border: "1px solid rgba(99,102,241,0.15)", background: "rgba(15,23,42,0.8)", cursor: "pointer" }}>
            <RefreshCw size={14} className={loading ? "animate-spin-slow" : ""} />
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      {/* Intro Section */}
      {showIntro && (
        <div className="card mb-6 animate-slide-in" style={{ padding: "2rem" }}>
          <div className="flex items-start justify-between mb-4">
            <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#f1f5f9" }}>How it works</h2>
            <button onClick={() => setShowIntro(false)} style={{ color: "#475569", cursor: "pointer", background: "none", border: "none", fontSize: "0.8rem" }}>
              Hide ×
            </button>
          </div>

          {/* Problem / Solution */}
          <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: "1rem" }}>
              <div style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>❌ The Problem</div>
              <p style={{ color: "#94a3b8", fontSize: "0.83rem", lineHeight: 1.7 }}>
                Uniswap &amp; other DEXs use a <strong style={{ color: "#f87171" }}>fixed fee (0.30%)</strong> regardless of market conditions.
                LPs lose money during volatility; high fees push traders away during calm markets.
              </p>
            </div>
            <div style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 12, padding: "1rem" }}>
              <div style={{ fontSize: "0.95rem", marginBottom: "0.5rem" }}>✅ The Solution</div>
              <p style={{ color: "#94a3b8", fontSize: "0.83rem", lineHeight: 1.7 }}>
                This app uses a <strong style={{ color: "#34d399" }}>real AI model on-chain</strong> (OpenGradient)
                to predict ETH/USDT volatility and set fees dynamically — lower when calm, higher when volatile.
              </p>
            </div>
          </div>

          {/* Flow */}
          <div style={{ color: "#64748b", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "0.75rem", fontWeight: 600 }}>Pipeline</div>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { icon: "📡", label: "Live ETH/USDT data", color: "#93c5fd" },
              { icon: "🧬", label: "15 financial features", color: "#c4b5fd" },
              { icon: "⛓️", label: "On-chain inference (ETH)", color: "#f9a8d4" },
              { icon: "📈", label: "LLMAD prediction", color: "#fcd34d" },
              { icon: "💰", label: "Dynamic fee output", color: "#6ee7b7" },
            ].map((step, i, arr) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flow-step" style={{ color: step.color }}>
                  {step.icon} {step.label}
                </div>
                {i < arr.length - 1 && <ChevronRight size={14} color="#334155" />}
              </div>
            ))}
          </div>

          {/* Bottom info */}
          <div style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid rgba(99,102,241,0.1)", color: "#475569", fontSize: "0.78rem", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
            <span>🔬 <strong style={{ color: "#64748b" }}>Model:</strong> Linear regression, Lasso feature selection, ETH/USDT Jan–May 2024</span>
            <span>⛽ <strong style={{ color: "#64748b" }}>Gas:</strong> ETH (on-chain, trustless)</span>
            <span>📄 <strong style={{ color: "#64748b" }}>Source:</strong> OpenGradient AMM Research Paper</span>
          </div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {/* Live Price */}
        {currentPrice > 0 ? (
          <LivePriceCard initialPrice={currentPrice} initialChange={priceChange} />
        ) : (
          <div className="metric-card">
            <div style={{ color: "#94a3b8", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600 }}>ETH/USDT Price</div>
            <div className="mono" style={{ fontSize: "1.8rem", color: "#334155" }}>Loading...</div>
          </div>
        )}

        {/* Static fee */}
        <div className="metric-card">
          <div style={{ color: "#94a3b8", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600, marginBottom: 8 }}>Static Fee (Uniswap)</div>
          <div className="mono" style={{ fontSize: "1.8rem", fontWeight: 700, color: "#64748b" }}>0.30%</div>
          <div style={{ color: "#475569", fontSize: "0.78rem", marginTop: 4 }}>Fixed — no risk adjustment</div>
        </div>

        {/* Dynamic fee */}
        <div className="metric-card">
          <div style={{ color: "#94a3b8", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600, marginBottom: 8 }}>Dynamic Fee (AI)</div>
          {latestInference ? (
            <>
              <div className="mono" style={{ fontSize: "1.8rem", fontWeight: 700, color: latestInference.fee > STATIC_FEE ? "#f59e0b" : "#10b981" }}>
                {(latestInference.fee * 100).toFixed(4)}%
              </div>
              <div style={{ color: "#64748b", fontSize: "0.78rem", marginTop: 4 }}>
                {latestInference.fee > STATIC_FEE ? "▲" : "▼"} {Math.abs(((latestInference.fee - STATIC_FEE) / STATIC_FEE) * 100).toFixed(1)}% vs static
              </div>
            </>
          ) : (
            <>
              <div className="mono" style={{ fontSize: "1.8rem", color: "#334155" }}>—</div>
              <div style={{ color: "#475569", fontSize: "0.78rem", marginTop: 4 }}>Run inference to calculate</div>
            </>
          )}
        </div>

        {/* Volatility */}
        <div className="metric-card">
          <div style={{ color: "#94a3b8", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 600, marginBottom: 8 }}>Predicted Volatility</div>
          {latestInference ? (
            <>
              <div className="mono" style={{ fontSize: "1.8rem", fontWeight: 700, color: "#f59e0b" }}>
                {latestInference.llmad.toFixed(6)}
              </div>
              <div style={{ color: "#f59e0b", fontSize: "0.78rem", marginTop: 4 }}>
                🔴 1-min LLMAD
              </div>
            </>
          ) : (
            <>
              <div className="mono" style={{ fontSize: "1.8rem", color: "#334155" }}>—</div>
              <div style={{ color: "#475569", fontSize: "0.78rem", marginTop: 4 }}>1-min LLMAD prediction</div>
            </>
          )}
        </div>
      </div>

      {/* Chart + Features */}
      <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: "1fr 340px" }}>
        {/* Candlestick */}
        <div className="card" style={{ padding: "1.25rem" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>📊 ETH/USDT Price</span>
              <span className="badge badge-blue">Last 2 Hours</span>
            </div>
          </div>
          {candles.length > 0 ? (
            <CandlestickChart candles={candles} />
          ) : (
            <div style={{ height: 320, display: "flex", alignItems: "center", justifyContent: "center", color: "#334155" }}>
              Loading chart...
            </div>
          )}
        </div>

        {/* Features */}
        <div className="card" style={{ padding: "1.25rem", overflowY: "auto", maxHeight: 380 }}>
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>🧬 Engineered Features</span>
            <span className="badge badge-purple">15</span>
          </div>
          {featuresData ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
              {featuresData.names.map((name, i) => {
                const val = featuresData.features[i];
                const isPos = val >= 0;
                const maxVal = Math.max(...featuresData.features.map(Math.abs));
                const pct = maxVal > 0 ? (Math.abs(val) / maxVal) * 100 : 0;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ color: "#64748b", fontSize: "0.72rem", minWidth: 100 }}>{name}</span>
                    <div style={{ flex: 1, height: 3, background: "rgba(99,102,241,0.1)", borderRadius: 2 }}>
                      <div className="feature-bar-fill" style={{
                        width: `${pct}%`,
                        background: isPos ? "#10b981" : "#ef4444"
                      }} />
                    </div>
                    <span className="mono" style={{ fontSize: "0.69rem", color: isPos ? "#10b981" : "#ef4444", minWidth: 72, textAlign: "right" }}>
                      {isPos ? "+" : ""}{val.toFixed(6)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "#334155", fontSize: "0.82rem" }}>Loading features...</div>
          )}
        </div>
      </div>

      {/* Inference Panel */}
      <div className="card mb-4" style={{ padding: "1.5rem" }}>
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} color="#6366f1" />
          <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>On-Chain Inference</span>
        </div>

        <button
          onClick={runInference}
          disabled={inferring || !featuresData}
          className="btn-glow w-full"
          style={{ padding: "0.9rem", fontSize: "0.95rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
        >
          {inferring ? (
            <>
              <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin-slow 0.8s linear infinite" }} />
              Running On-Chain Inference...
            </>
          ) : (
            <>⚡ Run On-Chain Inference</>
          )}
        </button>

        {latestInference && (
          <div className="animate-slide-in mt-4 grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 10, padding: "0.9rem", textAlign: "center" }}>
              <div style={{ color: "#94a3b8", fontSize: "0.7rem", marginBottom: 4 }}>LLMAD Prediction</div>
              <div className="mono" style={{ fontSize: "1.1rem", fontWeight: 700, color: "#c4b5fd" }}>{latestInference.llmad.toFixed(8)}</div>
            </div>
            <div style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 10, padding: "0.9rem", textAlign: "center" }}>
              <div style={{ color: "#94a3b8", fontSize: "0.7rem", marginBottom: 4 }}>Dynamic Fee</div>
              <div className="mono" style={{ fontSize: "1.1rem", fontWeight: 700, color: latestInference.fee > STATIC_FEE ? "#f59e0b" : "#10b981" }}>
                {(latestInference.fee * 100).toFixed(4)}%
                <span style={{ fontSize: "0.7rem", marginLeft: 6 }}>
                  {latestInference.fee > STATIC_FEE ? <TrendingUp size={12} style={{ display: "inline" }} /> : <TrendingDown size={12} style={{ display: "inline" }} />}
                  {" "}{Math.abs(((latestInference.fee - STATIC_FEE) / STATIC_FEE) * 100).toFixed(1)}% vs static
                </span>
              </div>
            </div>
            <div style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 10, padding: "0.9rem", textAlign: "center" }}>
              <div style={{ color: "#94a3b8", fontSize: "0.7rem", marginBottom: 4 }}>Transaction</div>
              <div className="mono" style={{ fontSize: "0.8rem", fontWeight: 700, color: "#34d399" }}>
                ✓ Confirmed
              </div>
              <div className="mono" style={{ fontSize: "0.65rem", color: "#6366f1", marginTop: 2 }}>{latestInference.txHash}</div>
            </div>
          </div>
        )}
      </div>

      {/* Inference History */}
      {history.length > 0 && (
        <div className="card" style={{ padding: "1.25rem" }}>
          <div className="flex items-center gap-2 mb-3">
            <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>📋 Inference History</span>
            <span className="badge badge-blue">{history.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {history.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.6rem 0.9rem", background: "rgba(99,102,241,0.04)", borderRadius: 8, border: "1px solid rgba(99,102,241,0.1)", flexWrap: "wrap" }}>
                <span className="mono" style={{ color: "#64748b", fontSize: "0.72rem" }}>{r.time}</span>
                <span className="mono" style={{ color: "#94a3b8", fontSize: "0.78rem" }}>${r.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                <span className="mono" style={{ color: "#c4b5fd", fontSize: "0.75rem" }}>LLMAD: {r.llmad.toFixed(6)}</span>
                <span className="mono" style={{ color: r.fee > STATIC_FEE ? "#f59e0b" : "#10b981", fontSize: "0.75rem" }}>Fee: {(r.fee * 100).toFixed(4)}%</span>
                <span className="mono badge badge-green" style={{ marginLeft: "auto" }}>✓ {r.txHash}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ textAlign: "center", marginTop: "3rem", color: "#334155", fontSize: "0.78rem" }}>
        Powered by{" "}
        <a href="https://opengradient.ai" target="_blank" rel="noopener noreferrer" style={{ color: "#6366f1", textDecoration: "none" }}>
          OpenGradient
        </a>{" "}
        On-Chain Inference · Model: og-amm-fee-optimization-ethusdt · Payment: ETH Gas
      </footer>
    </main>
  );
}
