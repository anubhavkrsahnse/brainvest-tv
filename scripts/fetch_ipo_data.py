"""Aggregate upcoming/current IPOs + Grey Market Premium into ipo.json.

Sources (both cited per data point in the UI):
- Issue list + subscription: NSE public API (nseindia.com/api/ipo-current-issues)
- GMP: scraped from IPO Watch's public GMP table (ipowatch.in) — there is no
  official GMP API anywhere; grey-market numbers are unofficial by nature and
  the UI labels them as indicative only.

Both sources fail gracefully: on error the previous ipo.json is left untouched
so the site never shows an empty module.
"""
import json
import os
import re
from datetime import datetime, timezone, timedelta

import requests

IST = timezone(timedelta(hours=5, minutes=30))
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}


def fetch_nse_issues():
    """Current + upcoming issues from NSE's public JSON endpoint."""
    s = requests.Session()
    s.headers.update(UA)
    s.get("https://www.nseindia.com", timeout=15)  # prime cookies
    issues = []
    seen = set()
    # NSE has shuffled these endpoint names over time; try known variants.
    for endpoint in ("ipo-current-issue", "ipo-current-issues", "all-upcoming-issues?category=ipo"):
        try:
            r = s.get(f"https://www.nseindia.com/api/{endpoint}", timeout=15)
            r.raise_for_status()
            rows = r.json()
        except Exception as e:
            print(f"NSE endpoint {endpoint} failed: {e}")
            continue
        for row in rows:
            symbol = row.get("symbol")
            if not symbol or symbol in seen:  # endpoints overlap — dedupe by symbol
                continue
            seen.add(symbol)
            band = f'{row.get("issuePrice", "")}'.strip() or None
            issues.append({
                "company": row.get("companyName"),
                "symbol": symbol,
                "priceBand": band,
                "issueSizeCr": _issue_size_cr(row.get("issueSize"), band),
                "qibSubscription": _to_float(row.get("noOfTimeSubscribedQIB") or row.get("noOfTimesSubscribed")),
                "openDate": row.get("issueStartDate"),
                "closeDate": row.get("issueEndDate"),
                "status": _norm_status(row.get("status"), endpoint),
                "source": "NSE",
            })
    return issues


def _to_float(v):
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _norm_status(raw, endpoint):
    s = (raw or "").strip().lower()
    if s in ("active", "current", "open"):
        return "current"
    if s in ("forthcoming", "upcoming"):
        return "upcoming"
    return "current" if endpoint.startswith("ipo-current") else "upcoming"


def _top_band_price(band):
    """Highest number in a price-band string like 'Rs.398 to Rs.419' -> 419.0."""
    nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", band or "")]
    return max(nums) if nums else None


def _issue_size_cr(raw_size, band):
    """NSE 'issueSize' is a SHARE COUNT, not crores. Convert to ₹ crore via the
    upper price band; guard to a plausible range, else None so the UI shows '—'
    rather than a wrong figure."""
    shares = _to_float(raw_size)
    price = _top_band_price(band)
    if not shares or not price:
        return None
    cr = round(shares * price / 1e7, 1)  # shares × ₹/share ÷ 1e7 = ₹ crore
    return cr if 1 <= cr <= 200000 else None


def fetch_gmp_table():
    """Scrape company -> GMP % out of IPO Watch's public GMP page."""
    r = requests.get("https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/", headers=UA, timeout=20)
    r.raise_for_status()
    gmp = {}
    # Table rows look like: <td>Company Name</td><td>₹123</td><td>10%</td>...
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", r.text, re.S):
        cells = [re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if len(cells) >= 3 and cells[0]:
            pct = re.search(r"(-?[\d.]+)\s*%", " ".join(cells[1:4]))
            if pct:
                gmp[cells[0].lower()] = float(pct.group(1))
    return gmp


def auto_pros_cons(ipo):
    """Rule-based bullet points from the quantitative parameters only."""
    pros, cons = [], []
    if (ipo.get("gmpPct") or 0) >= 20:
        pros.append(f"Strong grey-market sentiment: GMP {ipo['gmpPct']:.0f}% over band")
    elif (ipo.get("gmpPct") or 0) < 0:
        cons.append(f"Negative GMP ({ipo['gmpPct']:.0f}%) — grey market expects listing below band")
    if (ipo.get("qibSubscription") or 0) >= 10:
        pros.append(f"Heavy institutional demand: QIB {ipo['qibSubscription']:.1f}x subscribed")
    elif ipo.get("qibSubscription") is not None and ipo["qibSubscription"] < 1:
        cons.append(f"QIB book undersubscribed ({ipo['qibSubscription']:.2f}x)")
    if (ipo.get("issueSizeCr") or 0) >= 5000:
        cons.append("Large issue size (₹5,000 Cr+) — listing pop historically muted")
    elif ipo.get("issueSizeCr") and ipo["issueSizeCr"] < 500:
        pros.append("Small float (<₹500 Cr) — scarcity can support listing")
    if not pros:
        pros.append("No standout quantitative positives yet")
    if not cons:
        cons.append("No quantitative red flags in tracked parameters")
    return pros, cons


def main():
    issues = fetch_nse_issues()
    if not issues:
        print("No issues fetched (NSE unreachable?) — keeping previous ipo.json")
        return
    try:
        gmp = fetch_gmp_table()
    except Exception as e:  # GMP is best-effort; the issue list still ships
        print(f"GMP scrape failed, continuing without: {e}")
        gmp = {}

    for ipo in issues:
        name = (ipo["company"] or "").lower()
        ipo["gmpPct"] = next((v for k, v in gmp.items() if k[:12] in name or name[:12] in k), None)
        ipo["gmpSource"] = "IPO Watch (unofficial grey market, indicative only)" if ipo["gmpPct"] is not None else None
        ipo["pros"], ipo["cons"] = auto_pros_cons(ipo)

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, "ipo.json"), "w") as f:
        json.dump({
            "lastUpdated": datetime.now(IST).strftime("%Y-%m-%d %H:%M IST"),
            "ipos": issues,
        }, f, indent=2)
    print(f"Wrote ipo.json with {len(issues)} issues ({sum(1 for i in issues if i['gmpPct'] is not None)} with GMP)")


if __name__ == "__main__":
    main()
