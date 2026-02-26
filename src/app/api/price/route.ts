import { NextResponse } from "next/server";

const CRYPTOCOMPARE_API = "https://min-api.cryptocompare.com/data/v2/histominute";

export async function GET() {
    try {
        const res = await fetch(
            `${CRYPTOCOMPARE_API}?fsym=ETH&tsym=USDT&limit=120`,
            { cache: "no-store" }
        );
        const raw = await res.json();

        if (raw.Response !== "Success") {
            return NextResponse.json({ error: raw.Message }, { status: 500 });
        }

        const candles = raw.Data.Data.map((c: {
            time: number; open: number; high: number; low: number; close: number; volumefrom: number;
        }) => ({
            time: c.time,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volumefrom,
        }));

        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const change = ((current.close - prev.close) / prev.close) * 100;

        return NextResponse.json({ candles, currentPrice: current.close, priceChange: change });
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}
