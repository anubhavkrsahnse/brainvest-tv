"""Fetch market data and dump static JSON for the brAInvest frontend.

Runs in GitHub Actions at 09:00 / 16:00 IST. Every value written carries a
`source` field — the UI is contractually required to display it.
"""
import json
import os
from datetime import datetime, timezone, timedelta

import yfinance as yf

IST = timezone(timedelta(hours=5, minutes=30))
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")

MONTHLY_TARGET_PCT = ((1.17) ** (1 / 12) - 1) * 100  # ~1.3169%

US_UNIVERSE = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO"]

SIGNAL_INDICES = {
    "GIFT Nifty": ("^NSEI", "NSE IX (proxy: Nifty 50, Yahoo Finance)"),
    "Nasdaq Composite": ("^IXIC", "Yahoo Finance"),
    "Hang Seng": ("^HSI", "Yahoo Finance"),
    "S&P 500": ("^GSPC", "Yahoo Finance"),
}


def rsi14(closes):
    """Standard 14-period Wilder RSI on a pandas Series of closes."""
    delta = closes.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / 14, min_periods=14).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / 14, min_periods=14).mean()
    rs = gain / loss
    return float((100 - 100 / (1 + rs)).iloc[-1])


def fetch_us_stocks():
    rows = []
    for symbol in US_UNIVERSE:
        t = yf.Ticker(symbol)
        hist = t.history(period="1y")
        if hist.empty:
            continue
        info = t.info
        close = float(hist["Close"].iloc[-1])
        high52 = float(hist["High"].max())
        rsi = rsi14(hist["Close"])
        # Quantitative levels: bid at -5%, buy zone around 20DMA, sell at RSI>70 or 52w high
        dma20 = float(hist["Close"].tail(20).mean())
        action = "SELL" if rsi > 70 or close >= high52 * 0.99 else "BUY" if rsi < 35 else "HOLD"
        rows.append({
            "symbol": symbol,
            "price": round(close, 2),
            "peRatio": info.get("trailingPE"),
            "marketCap": info.get("marketCap"),
            "high52wProximityPct": round(close / high52 * 100, 1),
            "rsi14": round(rsi, 1),
            "avgDailyVolume": info.get("averageVolume"),
            "buyLevel": round(dma20 * 0.98, 2),
            "bidLevel": round(close * 0.95, 2),
            "sellLevel": round(high52 * 0.99, 2),
            "action": action,
            "source": "Yahoo Finance",
        })
    return rows


def fetch_signals():
    slot = os.environ.get("RUN_SLOT", "close")  # 'open' (9AM) or 'close' (4PM)
    signals = []
    for name, (symbol, source) in SIGNAL_INDICES.items():
        hist = yf.Ticker(symbol).history(period="5d")
        if len(hist) < 2:
            continue
        last, prev = float(hist["Close"].iloc[-1]), float(hist["Close"].iloc[-2])
        change = (last / prev - 1) * 100
        signals.append({
            "name": name,
            "value": round(last, 1),
            "changePct": round(change, 2),
            "signal": "BUY" if change > 0.3 else "SELL" if change < -0.5 else "HOLD",
            "slot": slot,
            "source": source,
        })
    return signals


def load_tracker():
    """Tracker actuals are appended by the recommendation logger; keep existing."""
    path = os.path.join(DATA_DIR, "dashboard.json")
    if os.path.exists(path):
        with open(path) as f:
            old = json.load(f)
        return old.get("tracker"), old.get("trackerYear")
    return None, None


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    now = datetime.now(IST)

    tracker, tracker_year = load_tracker()
    if not tracker:
        tracker_year = now.year
        tracker = [{"month": m, "actualPct": None} for m in
                   ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]]

    dashboard = {
        "lastUpdated": now.strftime("%Y-%m-%d %H:%M IST"),
        "signals": fetch_signals(),
        "trackerYear": tracker_year,
        "trackerSource": "Algorithmic recommendations logged by brAInvest, marked-to-market with Yahoo Finance closes",
        "tracker": tracker,
        "monthlyTargetPct": round(MONTHLY_TARGET_PCT, 2),
    }
    with open(os.path.join(DATA_DIR, "dashboard.json"), "w") as f:
        json.dump(dashboard, f, indent=2)

    with open(os.path.join(DATA_DIR, "us_stocks.json"), "w") as f:
        json.dump({"lastUpdated": dashboard["lastUpdated"], "stocks": fetch_us_stocks()}, f, indent=2)

    print("Wrote dashboard.json and us_stocks.json")


if __name__ == "__main__":
    main()
