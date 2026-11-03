#!/usr/bin/env python3
"""Bing Webmaster Tools inbound links. Writes bing.json for ledger.py.

Usage: bing.py <outdir>

Bing's link API (GetLinkCounts, GetUrlLinks) is the only free backlink API that exists
(Search Console has none), but it is empty for many sites. The run keeps trying; if it
ever populates, rows arrive with `via bing`. Needs an API key from Bing Webmaster Tools
settings and the site added under the same account.
"""

import json
import os
import re
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as cfgmod  # noqa: E402

DATE_RE = re.compile(r"/Date\((-?\d+)(?:[+-]\d{4})?\)/")


def call(key, site_url, method, **extra):
    url = f"https://ssl.bing.com/webmaster/api.svc/json/{method}?" + urllib.parse.urlencode({"apikey": key, "siteUrl": site_url, **extra})
    with urllib.request.urlopen(url, timeout=90) as r:
        return json.loads(r.read().decode())["d"]


def main():
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    cfg = cfgmod.load()
    b = cfg.get("bing")
    out = {"available": False}
    if not b or not os.path.exists(b["key_file"]):
        out["reason"] = "no bing block or key file"
    else:
        try:
            key = open(b["key_file"]).read().strip()
            counts = call(key, b["site_url"], "GetLinkCounts", page="0")
            links = counts.get("Links") or []
            # GetLinkCounts lists target pages; GetUrlLinks lists the linking pages for each.
            inbound = []
            for l in links[:50]:
                target = l.get("Url") or ""
                try:
                    for src in call(key, b["site_url"], "GetUrlLinks", link=target, page="0").get("Links") or []:
                        inbound.append({"url": src.get("Url", ""), "title": src.get("Title", ""), "target": target})
                except Exception:  # noqa: BLE001
                    continue
            out.update({"available": True, "targets": len(links), "links": inbound})
        except Exception as e:  # noqa: BLE001
            out["reason"] = str(e)[:200]
    json.dump(out, open(os.path.join(outdir, "bing.json"), "w"), indent=1)
    print("bing: " + (f"{len(out.get('links', []))} inbound links" if out["available"] else out["reason"]), file=sys.stderr)


if __name__ == "__main__":
    main()
