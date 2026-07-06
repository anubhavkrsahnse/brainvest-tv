"""Mark open recommendations to market and roll results into the 17% tracker.

recommendations.json is the append-only log of every call the dashboard makes
(other scripts append; humans can too). This script refreshes ltp/prevClose for
OPEN calls via Yahoo Finance, then aggregates realized+unrealized P&L by
recommendation month into dashboard.json's tracker (actualPct per month).
"""
import json
import os
from datetime import datetime, timezone, timedelta

import yfinance as yf

IST = timezone(timedelta(hours=5, minutes=30))
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# NSE ETFs need the .NS suffix on Yahoo; US symbols pass through.
def yahoo_symbol(reco):
    return f"{reco['symbol']}.NS" if reco["module"] in ("ETF", "IPO") else reco["symbol"]


def refresh_marks(recos):
    for r in recos:
        if r["status"] != "OPEN" or not r.get("qty"):
            continue
        hist = yf.Ticker(yahoo_symbol(r)).history(period="5d")
        if len(hist) >= 2:
            r["ltp"] = round(float(hist["Close"].iloc[-1]), 2)
            r["prevClose"] = round(float(hist["Close"].iloc[-2]), 2)


def pnl_pct(r):
    """Return % on invested capital for one reco (None if no position)."""
    if not r.get("entryPrice") or not r.get("qty"):
        return None
    mark = r["exitPrice"] if r["status"] == "CLOSED" else r.get("ltp")
    if mark is None:
        return None
    direction = -1 if r["action"] == "SELL" else 1
    return (mark - r["entryPrice"]) / r["entryPrice"] * 100 * direction


def rebuild_tracker(recos, year):
    """Average P&L%% of recommendations made in each month of `year`."""
    buckets = {m: [] for m in MONTHS}
    for r in recos:
        dt = datetime.strptime(r["recoDate"], "%Y-%m-%d")
        pct = pnl_pct(r)
        if dt.year == year and pct is not None:
            buckets[MONTHS[dt.month - 1]].append(pct)
    now = datetime.now(IST)
    tracker = []
    for i, m in enumerate(MONTHS):
        vals = buckets[m]
        pending = year == now.year and i + 1 > now.month
        tracker.append({
            "month": m,
            "actualPct": None if pending or not vals else round(sum(vals) / len(vals), 2),
        })
    return tracker


def main():
    reco_path = os.path.join(DATA_DIR, "recommendations.json")
    dash_path = os.path.join(DATA_DIR, "dashboard.json")
    with open(reco_path) as f:
        data = json.load(f)

    refresh_marks(data["recommendations"])
    data["lastUpdated"] = datetime.now(IST).strftime("%Y-%m-%d %H:%M IST")
    with open(reco_path, "w") as f:
        json.dump(data, f, indent=2)

    if os.path.exists(dash_path):
        with open(dash_path) as f:
            dash = json.load(f)
        dash["tracker"] = rebuild_tracker(data["recommendations"], dash.get("trackerYear", datetime.now(IST).year))
        with open(dash_path, "w") as f:
            json.dump(dash, f, indent=2)

    open_n = sum(1 for r in data["recommendations"] if r["status"] == "OPEN")
    print(f"Marked {open_n} open recommendations; tracker rebuilt")


if __name__ == "__main__":
    main()
