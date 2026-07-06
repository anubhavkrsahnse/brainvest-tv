"""AI recommendation pipeline: Claude Fable 5 orchestrates Haiku 4.5 workers.

Runs in the cron after market data is refreshed. Flow:
  1. Load candidates: rows from the public Google Sheet (user's watchlist /
     "Kaushik sir etf"-style targets) + us_stocks.json + ipo.json.
  2. WORKERS (claude-haiku-4-5, ~$1/$5 per MTok): one cheap call per candidate
     produces a compact quantitative scorecard. Low token, parallel-safe.
  3. ORCHESTRATOR (claude-fable-5): reads all scorecards + the 17% target
     context + current open positions, and emits at most 3 new calls as
     strict JSON (structured outputs), which are appended to
     recommendations.json for the Kite-style tracker.

Skipped gracefully when ANTHROPIC_API_KEY isn't configured. Every generated
recommendation is labeled with its model source — the UI shows the citation.
"""
import csv
import io
import json
import os
from datetime import datetime, timezone, timedelta

import requests

IST = timezone(timedelta(hours=5, minutes=30))
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")

SHEET_ID = os.environ.get("RECO_SHEET_ID", "1S36RwKjOygTxGinsUpZZLh_bolDsNcsO14oK2KEh1FQ")
SHEET_GID = os.environ.get("RECO_SHEET_GID", "0")

ORCHESTRATOR_MODEL = "claude-fable-5"
WORKER_MODEL = "claude-haiku-4-5"
MAX_NEW_RECOS = 3

RECO_SCHEMA = {
    "type": "object",
    "properties": {
        "recommendations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "symbol": {"type": "string"},
                    "module": {"type": "string", "enum": ["US", "IPO", "ETF"]},
                    "action": {"type": "string", "enum": ["BUY", "SELL", "AVOID"]},
                    "entryPrice": {"type": ["number", "null"]},
                    "reason": {"type": "string"},
                    "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
                },
                "required": ["symbol", "module", "action", "entryPrice", "reason", "confidence"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["recommendations"],
    "additionalProperties": False,
}


def load_json(name):
    path = os.path.join(DATA_DIR, name)
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return {}


def fetch_sheet_rows():
    """Public CSV export of the recommendation sheet; [] if private/unreachable."""
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={SHEET_GID}"
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        if r.text.lstrip().startswith("<"):  # login wall, not CSV
            print("Sheet not public yet — skipping sheet candidates")
            return []
        return list(csv.DictReader(io.StringIO(r.text)))
    except Exception as e:
        print(f"Sheet fetch failed: {e}")
        return []


def build_candidates():
    """Merge sheet rows + fetched market data into worker-sized bundles."""
    candidates = []
    for s in load_json("us_stocks.json").get("stocks", []):
        candidates.append({"module": "US", "data": s})
    for i in load_json("ipo.json").get("ipos", []):
        candidates.append({"module": "IPO", "data": i})
    for row in fetch_sheet_rows():
        candidates.append({"module": "ETF", "data": row, "source": "user sheet"})
    return candidates


def worker_scorecard(client, candidate):
    """One cheap Haiku call: raw numbers in, 3-line scorecard out."""
    response = client.messages.create(
        model=WORKER_MODEL,
        max_tokens=200,
        system=(
            "You are a quantitative screening worker. Given one instrument's raw data, "
            "reply with exactly 3 lines: SIGNAL: bullish|bearish|neutral, "
            "KEY_METRIC: the single most decisive number, RISK: the biggest quantitative risk. "
            "No preamble, no advice, numbers only where possible."
        ),
        messages=[{"role": "user", "content": json.dumps(candidate, default=str)[:4000]}],
    )
    text = next((b.text for b in response.content if b.type == "text"), "")
    return {"module": candidate["module"], "symbol": str(candidate["data"].get("symbol") or candidate["data"].get("company") or candidate["data"])[:40], "scorecard": text}


def orchestrate(client, scorecards, dashboard, open_positions):
    """Fable 5 synthesizes the final calls as strict JSON, with an Opus 4.8 fallback."""
    context = {
        "annualTargetPct": 17,
        "monthlyMilestonePct": dashboard.get("monthlyTargetPct", 1.32),
        "tracker": dashboard.get("tracker", []),
        "signals": dashboard.get("signals", []),
        "openPositions": open_positions,
        "workerScorecards": scorecards,
    }
    response = client.beta.messages.create(
        model=ORCHESTRATOR_MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-06-01"],
        fallbacks=[{"model": "claude-opus-4-8"}],
        output_config={
            "effort": "medium",
            "format": {"type": "json_schema", "schema": RECO_SCHEMA},
        },
        system=(
            "You are the orchestrator of an educational investment dashboard targeting 17% "
            "annualized (~1.32%/month). You receive quantitative scorecards prepared by "
            "screening workers, plus the live tracker and open positions. Recommend at most "
            f"{MAX_NEW_RECOS} NEW calls (BUY/SELL/AVOID) that are not already open positions. "
            "Prefer AVOID over forced picks when nothing is compelling. Reasons must cite the "
            "quantitative parameters (RSI, GMP, QIB, 20DMA, tracking error), max 90 chars each. "
            "This is for educational broadcasting, not financial advice."
        ),
        messages=[{"role": "user", "content": json.dumps(context, default=str)}],
    )
    if response.stop_reason == "refusal":
        print("Orchestrator (and fallback) declined — no recommendations this run")
        return []
    text = next((b.text for b in response.content if b.type == "text"), "{}")
    return json.loads(text).get("recommendations", [])[:MAX_NEW_RECOS]


def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY not configured — skipping AI recommendation pipeline")
        return

    import anthropic  # deferred so the script exits cleanly when unconfigured

    client = anthropic.Anthropic()
    reco_path = os.path.join(DATA_DIR, "recommendations.json")
    log = load_json("recommendations.json") or {"recommendations": [], "capitalPerRecoInr": 25000}
    open_positions = [r["symbol"] for r in log["recommendations"] if r["status"] == "OPEN"]

    candidates = build_candidates()
    if not candidates:
        print("No candidates — nothing to do")
        return
    scorecards = [worker_scorecard(client, c) for c in candidates[:20]]

    today = datetime.now(IST).strftime("%Y-%m-%d")
    added = 0
    for reco in orchestrate(client, scorecards, load_json("dashboard.json"), open_positions):
        reco_id = f"{today}-{reco['symbol']}"
        if any(r["id"] == reco_id for r in log["recommendations"]) or reco["symbol"] in open_positions:
            continue
        qty = int(log.get("capitalPerRecoInr", 25000) / reco["entryPrice"]) if reco.get("entryPrice") else 0
        log["recommendations"].append({
            "id": reco_id,
            "symbol": reco["symbol"],
            "module": reco["module"],
            "action": reco["action"],
            "recoDate": today,
            "entryPrice": reco.get("entryPrice"),
            "qty": qty if reco["action"] != "AVOID" else 0,
            "ltp": reco.get("entryPrice"),
            "prevClose": reco.get("entryPrice"),
            "status": "OPEN" if reco["action"] != "AVOID" else "CLOSED",
            "exitPrice": None,
            "exitDate": None,
            "reason": f"[AI · {reco['confidence']}] {reco['reason']}",
        })
        added += 1

    log["lastUpdated"] = datetime.now(IST).strftime("%Y-%m-%d %H:%M IST")
    log["source"] = (
        "Algorithmic + AI recommendations (Claude Fable 5 orchestrator, Haiku 4.5 workers) · "
        "marked-to-market with Yahoo Finance closes"
    )
    with open(reco_path, "w") as f:
        json.dump(log, f, indent=2)
    print(f"AI pipeline added {added} recommendations ({len(scorecards)} scorecards)")


if __name__ == "__main__":
    main()
