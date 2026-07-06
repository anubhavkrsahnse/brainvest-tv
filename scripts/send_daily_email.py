"""Send the 'No BS' daily summary email after the 4 PM IST refresh.

Reads the freshly-committed JSON files and mails a plain-text digest of
today's Buy/Sell signals plus the portfolio delta vs the sheet targets.
Uses SendGrid (SENDGRID_API_KEY, REPORT_TO_EMAIL secrets).
"""
import json
import os
from datetime import datetime, timezone, timedelta

from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail

IST = timezone(timedelta(hours=5, minutes=30))
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")

DISCLAIMER = (
    "For educational purposes only. Not SEBI registered. Not financial advice.\n"
    "Sources: Yahoo Finance, NSE, Google Sheet 'Kaushik sir etf', Zerodha contract notes."
)


def load(name):
    path = os.path.join(DATA_DIR, name)
    if not os.path.exists(path):
        return {}
    with open(path) as f:
        return json.load(f)


def build_report():
    dashboard, us, etf = load("dashboard.json"), load("us_stocks.json"), load("etf.json")
    lines = [f"brAInvest daily — {datetime.now(IST).strftime('%d %b %Y, %H:%M IST')}", ""]

    lines.append("SIGNALS")
    for s in dashboard.get("signals", []):
        lines.append(f"  {s['signal']:<4} {s['name']}: {s['value']} ({s['changePct']:+.2f}%) [{s['source']}]")

    actionable = [r for r in us.get("stocks", []) if r["action"] != "HOLD"]
    lines.append("")
    lines.append("US STOCKS — ACTIONABLE")
    if actionable:
        for r in actionable:
            lines.append(
                f"  {r['action']:<4} {r['symbol']} @ {r['price']} | RSI {r['rsi14']} | "
                f"buy {r['buyLevel']} / bid {r['bidLevel']} / sell {r['sellLevel']}"
            )
    else:
        lines.append("  Nothing actionable today. Sit tight.")

    lines.append("")
    lines.append("ETF PORTFOLIO DELTA (actual vs target)")
    for r in sorted(etf.get("rows", []), key=lambda x: abs(x.get("deltaPct", 0)), reverse=True)[:5]:
        lines.append(f"  {r['symbol']}: {r['actualPct']}% vs {r['targetPct']}% target ({r['deltaPct']:+.2f}%)")

    tracker = dashboard.get("tracker", [])
    done = [m for m in tracker if m["actualPct"] is not None]
    met = sum(1 for m in done if m["actualPct"] >= dashboard.get("monthlyTargetPct", 1.32))
    lines.append("")
    lines.append(f"17% TRACKER: {met}/{len(done)} monthly milestones met so far.")
    lines.append("")
    lines.append("-" * 60)
    lines.append(DISCLAIMER)
    return "\n".join(lines)


def main():
    body = build_report()
    message = Mail(
        from_email="reports@brainvest.pages.dev",
        to_emails=os.environ["REPORT_TO_EMAIL"],
        subject=f"brAInvest No-BS daily — {datetime.now(IST).strftime('%d %b %Y')}",
        plain_text_content=body,
    )
    resp = SendGridAPIClient(os.environ["SENDGRID_API_KEY"]).send(message)
    print(f"Email sent, status {resp.status_code}")


if __name__ == "__main__":
    main()
