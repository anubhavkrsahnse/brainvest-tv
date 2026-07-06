"""Fetch Zerodha Kite contract notes from Gmail + ETF targets from the public
"Kaushik sir etf" Google Sheet, then write etf.json (actual vs target allocation).

Auth: a pre-authorized OAuth token JSON is injected via the
GOOGLE_OAUTH_TOKEN_JSON secret (scopes: gmail.readonly, spreadsheets.readonly).
Generate it once locally with google-auth-oauthlib's InstalledAppFlow.
"""
import base64
import json
import os
import re
from datetime import datetime, timezone, timedelta

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

IST = timezone(timedelta(hours=5, minutes=30))
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
]

# Matches holdings lines in Zerodha contract-note emails, e.g. "NIFTYBEES BUY 50 @ 289.40"
TRADE_RE = re.compile(r"([A-Z]+BEES|[A-Z]{2,15}ETF)\s+(BUY|SELL)\s+(\d+)\s*@\s*([\d.]+)")


def get_creds():
    token_json = os.environ["GOOGLE_OAUTH_TOKEN_JSON"]
    return Credentials.from_authorized_user_info(json.loads(token_json), SCOPES)


def fetch_zerodha_holdings(creds):
    """Parse the last 90 days of Zerodha contract notes into net ETF holdings."""
    gmail = build("gmail", "v1", credentials=creds)
    result = gmail.users().messages().list(
        userId="me",
        q='from:noreply@reportsmailer.zerodha.net subject:"contract note" newer_than:90d',
        maxResults=50,
    ).execute()

    holdings = {}
    for meta in result.get("messages", []):
        msg = gmail.users().messages().get(userId="me", id=meta["id"], format="full").execute()
        body = ""
        for part in msg.get("payload", {}).get("parts", []) or [msg.get("payload", {})]:
            data = part.get("body", {}).get("data")
            if data:
                body += base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
        for symbol, side, qty, price in TRADE_RE.findall(body):
            h = holdings.setdefault(symbol, {"qty": 0, "cost": 0.0})
            qty, price = int(qty), float(price)
            if side == "BUY":
                h["qty"] += qty
                h["cost"] += qty * price
            else:
                h["qty"] -= qty
                h["cost"] -= qty * price
    return {s: h for s, h in holdings.items() if h["qty"] > 0}


def fetch_sheet_targets(creds):
    """Read target ETF allocations from the public 'Kaushik sir etf' sheet.

    Expected columns: ETF Symbol | Target % | AUM (Cr) | Expense Ratio | 1Y Tracking Error | 20DMA
    """
    sheets = build("sheets", "v4", credentials=creds)
    rows = sheets.spreadsheets().values().get(
        spreadsheetId=os.environ["ETF_SHEET_ID"], range="A2:F100"
    ).execute().get("values", [])

    targets = []
    for r in rows:
        if len(r) < 2 or not r[0].strip():
            continue
        targets.append({
            "symbol": r[0].strip().upper(),
            "targetPct": float(r[1].replace("%", "")),
            "aumCr": float(r[2]) if len(r) > 2 and r[2] else None,
            "expenseRatio": float(r[3]) if len(r) > 3 and r[3] else None,
            "trackingError1y": float(r[4]) if len(r) > 4 and r[4] else None,
            "dma20": float(r[5]) if len(r) > 5 and r[5] else None,
        })
    return targets


def main():
    if not os.environ.get("GOOGLE_OAUTH_TOKEN_JSON") or not os.environ.get("ETF_SHEET_ID"):
        print("GOOGLE_OAUTH_TOKEN_JSON / ETF_SHEET_ID secrets not configured — skipping ETF sync")
        return
    creds = get_creds()
    holdings = fetch_zerodha_holdings(creds)
    targets = fetch_sheet_targets(creds)

    total_cost = sum(h["cost"] for h in holdings.values()) or 1.0
    rows = []
    for t in targets:
        h = holdings.get(t["symbol"], {"qty": 0, "cost": 0.0})
        actual_pct = h["cost"] / total_cost * 100
        rows.append({
            **t,
            "heldQty": h["qty"],
            "actualPct": round(actual_pct, 2),
            "deltaPct": round(actual_pct - t["targetPct"], 2),
            "targetSource": 'Google Sheet "Kaushik sir etf"',
            "holdingsSource": "Zerodha Kite contract notes via Gmail API",
        })

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, "etf.json"), "w") as f:
        json.dump({
            "lastUpdated": datetime.now(IST).strftime("%Y-%m-%d %H:%M IST"),
            "rows": rows,
        }, f, indent=2)
    print(f"Wrote etf.json: {len(rows)} ETFs, {len(holdings)} held")


if __name__ == "__main__":
    main()
