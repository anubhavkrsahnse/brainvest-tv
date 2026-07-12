"""Aggregate upcoming/current IPOs + Grey Market Premium + moat into ipo.json.

Sources (each cited per data point in the UI):
- Issue list: NSE public API (nseindia.com/api/ipo-current-issues)
- GMP (₹ premium + est. listing %), board type: IPO Watch's public GMP table
- Moat / about-company + analyst verdict: each IPO's detail page on IPO Watch

Grey-market numbers are unofficial by nature and labeled indicative-only.
All sources fail gracefully: on error the previous ipo.json is left untouched.
"""
import html as htmllib
import json
import os
import re
from datetime import datetime, timezone, timedelta

import requests

IST = timezone(timedelta(hours=5, minutes=30))
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"}
GMP_URL = "https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/"


# ---------------------------------------------------------------- NSE issues

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


# ------------------------------------------------------------- IPO Watch GMP

def _norm_name(s):
    """Normalize a company name for cross-source matching."""
    s = htmllib.unescape(s or "").lower().replace("&", " and ")
    s = re.sub(r"\b(limited|ltd|india|pvt|private)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _strip_tags(s):
    return htmllib.unescape(re.sub(r"<[^>]+>", "", s)).strip()


def parse_gmp_table(page_html):
    """IPO Watch GMP table rows look like:
    [name, '₹35', trend, '₹214', '₹249 (16.35%)', '9-13 July', 'Mainboard', 'Open', updated]
    Returns { normalized_name: {gmpRs, gmpPct, issuePrice, board, url} }.
    """
    out = {}
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page_html, re.S):
        raw_cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)
        cells = [_strip_tags(c) for c in raw_cells]
        if len(cells) < 5 or not cells[0] or cells[0].lower().startswith(("ipo", "company", "current")):
            continue
        pct = re.search(r"\((-?[\d.]+)%\)", " ".join(cells[2:6]))
        gmp_rs = re.search(r"(-?[\d.,]+)", cells[1].replace("₹", ""))
        price = re.search(r"([\d.,]+)", cells[3].replace("₹", "")) if len(cells) > 3 else None
        link = re.search(r'href="(https://ipowatch\.in/[^"]+-ipo/)"', row)
        board = next((c for c in cells if "mainboard" in c.lower() or "sme" in c.lower()), None)
        out[_norm_name(cells[0])] = {
            "gmpRs": _to_float(gmp_rs.group(1)) if gmp_rs else None,
            "gmpPct": _to_float(pct.group(1)) if pct else None,
            "issuePrice": _to_float(price.group(1)) if price else None,
            "board": board,
            "url": link.group(1) if link else None,
        }
    return out


def parse_ipo_page(page_html, company):
    """Extract the moat/financials paragraph and the review verdict from an
    IPO Watch detail page.

    Gotcha: these pages embed a FULL unrelated review article before the real
    one, so 'About Company' / 'Conclusion' headings found page-wide belong to a
    different company. Slice from the H1 whose text matches this company first.
    """
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", page_html, flags=re.S)
    want = set(_norm_name(company).split())
    article = None
    for m in re.finditer(r"<h1[^>]*>(.*?)</h1>", s, re.S):
        title_tokens = set(_norm_name(_strip_tags(m.group(1))).split())
        if len(want & title_tokens) >= min(2, len(want)):
            article = s[m.end():]
            break
    if article is None:
        return None, None

    def clean(p):
        return re.sub(r"\s+", " ", _strip_tags(p)).strip()

    # Moat: prefer the financials/business paragraph; else first substantial one.
    moat = None
    paras = [clean(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", article, re.S)]
    paras = [p for p in paras if len(p) > 100 and not p.startswith(("Join", "Ads", "Follow"))]
    for p in paras:
        if re.search(r"revenue|profit|engaged in|business of|manufactur", p, re.I):
            moat = p
            break
    if not moat and paras:
        moat = paras[0]
    if moat and len(moat) > 320:
        moat = moat[:320].rsplit(" ", 1)[0] + "…"

    # Verdict: 'Review: May Apply' bullet inside the Review & Key Points section.
    verdict = None
    sec = re.search(r"IPO Review\s*&(?:amp;)?\s*Key Points[^<]*</h[23]>(.*?)<h[23]", article, re.S)
    if sec:
        for li in re.findall(r"<li[^>]*>(.*?)</li>", sec.group(1), re.S):
            hit = re.match(r"Review\s*:\s*(.+)", clean(li), re.I)
            if hit:
                verdict = hit.group(1).strip()
                break
    if not verdict:  # fall back to a Conclusion heading, but only within this article
        v = re.search(r"<h[23][^>]*>\s*Conclusion\s*[-–—:]*\s*(.*?)</h[23]>", article, re.S)
        if v:
            verdict = _strip_tags(v.group(1)).strip() or None
    return moat, verdict


def fetch_gmp_and_moat(issues):
    """Attach gmpPct/gmpRs/board from the GMP table and moat/verdict from the
    per-IPO pages. Token-subset matching bridges NSE vs IPO Watch naming."""
    r = requests.get(GMP_URL, headers=UA, timeout=25)
    r.raise_for_status()
    table = parse_gmp_table(r.text)

    def match(company):
        want = set(_norm_name(company).split())
        best, best_score = None, 0
        for key, entry in table.items():
            have = set(key.split())
            score = len(want & have)
            if score >= 2 and score > best_score and (have <= want or want <= have or score >= len(have) - 1):
                best, best_score = entry, score
        return best

    enriched = 0
    for ipo in issues:
        entry = match(ipo["company"] or "")
        if not entry:
            ipo["gmpPct"] = ipo["gmpRs"] = ipo["moat"] = ipo["verdict"] = None
            ipo["gmpSource"] = None
            continue
        ipo["gmpPct"] = entry["gmpPct"]
        ipo["gmpRs"] = entry["gmpRs"]
        ipo["board"] = entry["board"]
        ipo["gmpSource"] = "IPO Watch (unofficial grey market, indicative only)"
        if not ipo["priceBand"] and entry["issuePrice"]:
            ipo["priceBand"] = f"≈₹{entry['issuePrice']:.0f} (upper, IPO Watch)"
        ipo["moat"] = ipo["verdict"] = None
        if entry["url"]:
            try:
                page = requests.get(entry["url"], headers=UA, timeout=25)
                page.raise_for_status()
                ipo["moat"], ipo["verdict"] = parse_ipo_page(page.text, ipo["company"] or "")
                ipo["moatSource"] = "IPO Watch company analysis"
            except Exception as e:
                print(f"detail page failed for {ipo['company']}: {e}")
        enriched += 1
    print(f"GMP/moat enriched {enriched}/{len(issues)} IPOs")
    return issues


# --------------------------------------------------------------- pros / cons

def auto_pros_cons(ipo):
    """Bullet points from the quantitative parameters + IPO Watch verdict."""
    pros, cons = [], []
    if ipo.get("gmpPct") is not None:
        if ipo["gmpPct"] >= 15:
            pros.append(f"Strong grey-market sentiment: GMP ₹{ipo.get('gmpRs') or 0:.0f} (+{ipo['gmpPct']:.1f}% est. listing)")
        elif ipo["gmpPct"] >= 5:
            pros.append(f"Positive GMP: ₹{ipo.get('gmpRs') or 0:.0f} (+{ipo['gmpPct']:.1f}% est. listing)")
        elif ipo["gmpPct"] < 0:
            cons.append(f"Negative GMP ({ipo['gmpPct']:.1f}%) — grey market expects listing below band")
        else:
            cons.append(f"Muted GMP (+{ipo['gmpPct']:.1f}%) — thin grey-market interest")
    if ipo.get("verdict"):
        v = ipo["verdict"].lower()
        if any(w in v for w in ("avoid", "risky", "skip")):
            cons.append(f"IPO Watch review: {ipo['verdict']}")
        elif "apply" in v:  # 'Apply' / 'May Apply' — neutral verdicts show as a chip only
            pros.append(f"IPO Watch review: {ipo['verdict']}")
    if (ipo.get("qibSubscription") or 0) >= 10:
        pros.append(f"Heavy institutional demand: QIB {ipo['qibSubscription']:.1f}x subscribed")
    elif ipo.get("qibSubscription") is not None and ipo["qibSubscription"] < 1:
        cons.append(f"QIB book undersubscribed ({ipo['qibSubscription']:.2f}x)")
    if (ipo.get("issueSizeCr") or 0) >= 5000:
        cons.append("Large issue size (₹5,000 Cr+) — listing pop historically muted")
    elif ipo.get("issueSizeCr") and ipo["issueSizeCr"] < 500:
        pros.append("Small float (<₹500 Cr) — scarcity can support listing")
    if (ipo.get("board") or "").lower().find("sme") >= 0:
        cons.append("SME board — lower liquidity, higher volatility")
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
        issues = fetch_gmp_and_moat(issues)
    except Exception as e:  # GMP/moat is best-effort; the issue list still ships
        print(f"GMP/moat enrichment failed, continuing without: {e}")
        for ipo in issues:
            ipo.setdefault("gmpPct", None)
            ipo.setdefault("gmpRs", None)
            ipo.setdefault("gmpSource", None)
            ipo.setdefault("moat", None)
            ipo.setdefault("verdict", None)

    for ipo in issues:
        ipo["pros"], ipo["cons"] = auto_pros_cons(ipo)

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(os.path.join(DATA_DIR, "ipo.json"), "w") as f:
        json.dump({
            "lastUpdated": datetime.now(IST).strftime("%Y-%m-%d %H:%M IST"),
            "ipos": issues,
        }, f, indent=2)
    print(f"Wrote ipo.json with {len(issues)} issues ({sum(1 for i in issues if i.get('gmpPct') is not None)} with GMP)")


if __name__ == "__main__":
    main()
