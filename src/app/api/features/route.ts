import { NextRequest, NextResponse } from "next/server";

interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

function log(x: number): number {
    return Math.log(x);
}

function std(arr: number[]): number {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
}

function engineerFeatures(candles: Candle[]): { features: number[]; names: string[] } {
    const n = candles.length;
    if (n < 30) throw new Error("Not enough candles");

    const last = candles[n - 1];
    const slice5 = candles.slice(n - 5);
    const slice15 = candles.slice(n - 15);
    const slice30 = candles.slice(n - 30);

    // HL log ranges
    const hlRange1 = log(last.high / last.low);
    const hlRange5 = log(Math.max(...slice5.map(c => c.high)) / Math.min(...slice5.map(c => c.low)));
    const hlRange15 = log(Math.max(...slice15.map(c => c.high)) / Math.min(...slice15.map(c => c.low)));

    // High log returns (vs 1, 5, 15 bars ago)
    const highLogRet1 = log(last.high / candles[n - 2].high);
    const highLogRet5 = log(last.high / candles[n - 6].high);
    const highLogRet15 = log(last.high / candles[n - 16].high);

    // Low log returns
    const lowLogRet1 = log(last.low / candles[n - 2].low);
    const lowLogRet5 = log(last.low / candles[n - 6].low);
    const lowLogRet15 = log(last.low / candles[n - 16].low);

    // Rolling std of close returns
    const ret5 = slice5.slice(1).map((c, i) => log(c.close / slice5[i].close));
    const ret15 = slice15.slice(1).map((c, i) => log(c.close / slice15[i].close));
    const ret30 = slice30.slice(1).map((c, i) => log(c.close / slice30[i].close));
    const rollStd5 = std(ret5);
    const rollStd15 = std(ret15);
    const rollStd30 = std(ret30);

    // Range ratio (1m range / 15m range)
    const rangeRatio = hlRange1 / (hlRange15 || 1e-10);

    // Momentum (close vs 5 bars ago)
    const momentum5 = log(last.close / candles[n - 6].close);

    // Volume-weighted volatility proxy
    const totalVol = slice5.reduce((s, c) => s + c.volume, 0);
    const vwap = slice5.reduce((s, c) => s + c.close * c.volume, 0) / (totalVol || 1);
    const volWtProxy = Math.abs(log(last.close / vwap));

    const features = [
        hlRange1, hlRange5, hlRange15,
        highLogRet1, highLogRet5, highLogRet15,
        lowLogRet1, lowLogRet5, lowLogRet15,
        rollStd5, rollStd15, rollStd30,
        rangeRatio, momentum5, volWtProxy,
    ];

    const names = [
        "HL Range 1m", "HL Range 5m", "HL Range 15m",
        "High LogRet 1m", "High LogRet 5m", "High LogRet 15m",
        "Low LogRet 1m", "Low LogRet 5m", "Low LogRet 15m",
        "RollStd 5m", "RollStd 15m", "RollStd 30m",
        "Range Ratio", "Momentum 5m", "Vol-Wt Proxy",
    ];

    return { features, names };
}

function estimateLlmad(features: number[]): number {
    const weights = [
        0.15, 0.12, 0.08,
        0.05, 0.04, 0.03,
        0.05, 0.04, 0.03,
        0.12, 0.10, 0.07,
        0.02, 0.03, 0.07,
    ];
    const raw = features.reduce((s, f, i) => s + Math.abs(f) * weights[i], 0);
    return raw / 10; // scale to model range
}

function llmadToFee(llmad: number): number {
    const minFee = 0.0005;
    const maxFee = 0.008;
    const llmadMax = 0.01;
    const normalized = Math.min(Math.abs(llmad) / llmadMax, 1.0);
    return minFee + normalized * (maxFee - minFee);
}

export async function POST(req: NextRequest) {
    try {
        const { candles } = await req.json() as { candles: Candle[] };
        const { features, names } = engineerFeatures(candles);
        const llmad = estimateLlmad(features);
        const fee = llmadToFee(llmad);
        const STATIC_FEE = 0.003;
        const feeDiff = ((fee - STATIC_FEE) / STATIC_FEE) * 100;

        return NextResponse.json({
            features,
            names,
            llmad,
            fee,
            feeDiff,
            staticFee: STATIC_FEE,
        });
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
