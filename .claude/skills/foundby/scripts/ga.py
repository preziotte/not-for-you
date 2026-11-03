#!/usr/bin/env python3
"""Distinct GA4 sources over a date range. Writes ga.json for ledger.py.

Usage: ga.py <outdir> --since YYYY-MM-DD --until YYYY-MM-DD
       ga.py metadata            print the property's custom dimensions (used by doctor)

Auth is a service-account JWT signed locally (needs the `cryptography` package), so no
gcloud and no OAuth dance. The service account must be a Viewer on the property.

Lists written, all uncapped:
  sources         sessionSource x sessionDefaultChannelGroup, sessions
and, when ga.custom_dimensions is true in foundby.json (see docs/sources.md):
  referrer_hosts  customEvent:referrer_host, page views
  referrer_full   customEvent:referrer_full, page views (document.referrer verbatim: the
                  only place a referring *page* ever shows up, when the linking site has
                  a permissive referrer policy)
  in_app          customEvent:in_app_browser, sessions (webviews send no Referer; the only
                  trace of TikTok and Instagram traffic)
  extra           one entry per ga.extra_dimensions item: a site-specific custom dimension
                  whose values are ways in, e.g. {"dimension": "host_app", "prefix": "app:host=",
                  "label": "?host= embed"}
"""

import argparse
import base64
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as cfgmod  # noqa: E402

SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
LIMIT = 10000


def _b64(raw):
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def token(key_file):
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    info = json.load(open(key_file))
    now = int(dt.datetime.now(dt.timezone.utc).timestamp())
    header = _b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = _b64(json.dumps({"iss": info["client_email"], "scope": SCOPE,
                              "aud": "https://oauth2.googleapis.com/token", "iat": now, "exp": now + 3600}).encode())
    pk = serialization.load_pem_private_key(info["private_key"].encode(), password=None)
    sig = _b64(pk.sign(f"{header}.{claims}".encode(), padding.PKCS1v15(), hashes.SHA256()))
    body = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                                   "assertion": f"{header}.{claims}.{sig}"}).encode()
    with urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token", data=body), timeout=30) as r:
        return json.load(r)["access_token"]


def call(tok, prop, method, body=None):
    url = f"https://analyticsdata.googleapis.com/v1beta/properties/{prop}{method}"
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"GA {method} failed: {e.read()[:300].decode(errors='replace')}") from None


def report(tok, prop, since, until, dims, metric, event=None):
    body = {"dateRanges": [{"startDate": since, "endDate": until}], "dimensions": [{"name": d} for d in dims],
            "metrics": [{"name": metric}], "limit": LIMIT}
    if event:
        body["dimensionFilter"] = {"filter": {"fieldName": "eventName", "stringFilter": {"value": event}}}
    return [{"name": " · ".join(v["value"] for v in row["dimensionValues"]), "hits": int(float(row["metricValues"][0]["value"]))}
            for row in call(tok, prop, ":runReport", body).get("rows") or []]


def metadata(cfg):
    g = cfg["ga"]
    tok = token(g["key_file"])
    d = call(tok, g["property"], "/metadata")
    return [x["apiName"] for x in d.get("dimensions", []) if x["apiName"].startswith("customEvent:") or x["apiName"].startswith("customUser:")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("outdir")
    ap.add_argument("--since")
    ap.add_argument("--until")
    a = ap.parse_args()
    cfg = cfgmod.load()
    if a.outdir == "metadata":
        print("\n".join(metadata(cfg)))
        return
    os.makedirs(a.outdir, exist_ok=True)
    outpath = os.path.join(a.outdir, "ga.json")
    out = {"available": False, "window": {"since": a.since, "until": a.until}}
    g = cfg.get("ga")
    if not g or not g.get("property"):
        out["reason"] = "no ga block in foundby.json"
        json.dump(out, open(outpath, "w"))
        print("ga: not configured", file=sys.stderr)
        return
    try:
        tok = token(g["key_file"])
        p = g["property"]
        out["sources"] = report(tok, p, a.since, a.until, ["sessionSource", "sessionDefaultChannelGroup"], "sessions")
        if g.get("custom_dimensions"):
            out["referrer_hosts"] = report(tok, p, a.since, a.until, ["customEvent:referrer_host"], "eventCount", "page_view")
            out["referrer_full"] = report(tok, p, a.since, a.until, ["customEvent:referrer_full"], "eventCount", "page_view")
            out["in_app"] = report(tok, p, a.since, a.until, ["customEvent:in_app_browser"], "sessions")
        # Site-specific custom dimensions whose values are ways in (an embed host
        # parameter, a partner id). Each becomes rows keyed <prefix><value>.
        out["extra"] = []
        for x in g.get("extra_dimensions") or []:
            rows = report(tok, p, a.since, a.until, [f"customEvent:{x['dimension']}"], x.get("metric", "sessions"))
            out["extra"].append({**x, "rows": rows})
        out["available"] = True
        print(f"ga: {len(out['sources'])} sources" + (f", {len(out.get('referrer_hosts', []))} referrer hosts, "
              f"{len(out.get('referrer_full', []))} full referrers, {len(out.get('in_app', []))} in-app browsers"
              if g.get("custom_dimensions") else ""), file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        out["reason"] = str(e)[:300]
        print(f"ga: unavailable ({out['reason']})", file=sys.stderr)
    json.dump(out, open(outpath, "w"))


if __name__ == "__main__":
    main()
