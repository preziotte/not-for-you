#!/usr/bin/env python3
"""CDN edge logs: the referrers, link unfurlers and AI live-fetch agents that GA
cannot see. Writes edge.json for ledger.py.

Usage: edge.py <outdir> --since ISO-UTC --until ISO-UTC
       (bucket, prefix, profile and the site come from foundby.json)

Only CloudFront standard logs (S3) are read today. The header line is parsed, so both
the legacy fixed-column format and logging v2 with user-chosen fields work. Client IPs
are never read. Records are filtered by their own timestamp, and files are synced
with a day of padding on each side because CloudFront names a file by delivery time.

Why these three things and not a full log report: a Referer at the edge needs no JS
and arrives for ad-blocked and no-JS visitors; an unfurler hit is the only trace of a
link pasted into Slack, Discord or iMessage; an AI live-fetch is a person asking an
assistant about the site right now. Everything else about the logs is agenttraffic's
job (https://agenttraffic.io).
"""

import argparse
import collections
import datetime as dt
import gzip
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as cfgmod  # noqa: E402

# (match, label, vendor). Live-fetch agents only: the ones that fire because a person
# just asked about a page. Crawlers building indexes or corpora are not "how people
# find you" and are left to agenttraffic.
LIVE_FETCH_AGENTS = [
    ("chatgpt-user", "ChatGPT-User", "OpenAI"),
    ("claude-user", "Claude-User", "Anthropic"),
    ("perplexity-user", "Perplexity-User", "Perplexity"),
    ("mistralai-user", "MistralAI-User", "Mistral"),
    ("modelcontextprotocol", "MCP agent", "MCP"),
    ("duckassistbot", "DuckAssistBot", "DuckDuckGo"),
    ("google-cloudvertexbot", "Google-CloudVertexBot", "Google"),
    ("gemini-deep-research", "Gemini-Deep-Research", "Google"),
    ("meta-externalfetcher", "Meta-ExternalFetcher", "Meta"),
    ("cohere-training-data-crawler", None, None),  # training, skip
]

# Link-preview unfurlers. iMessage sends facebookexternalhit and Twitterbot, so that
# bucket is labelled for both.
UNFURL_AGENTS = [
    ("facebookexternalhit", "Facebook / iMessage"),
    ("facebot", "Facebook / iMessage"),
    ("slack-imgproxy", "Slack"),
    ("slackbot", "Slack"),
    ("discordbot", "Discord"),
    ("twitterbot", "X / iMessage"),
    ("telegrambot", "Telegram"),
    ("whatsapp", "WhatsApp"),
    ("linkedinbot", "LinkedIn"),
    ("redditbot", "Reddit"),
    ("pinterest", "Pinterest"),
    ("skypeuripreview", "Skype"),
    ("embedly", "Embedly"),
    ("iframely", "Iframely"),
    ("vkshare", "VK"),
    ("bitlybot", "Bitly"),
    ("mastodon", "Mastodon"),
    ("bluesky cardyb", "Bluesky"),
    ("signal", "Signal"),
    ("snapchat", "Snapchat"),
    ("notion", "Notion"),
    ("googlechat", "Google Chat"),
    ("microsoftpreview", "Teams / Outlook"),
    ("skypeuripreview", "Skype"),
]

BOT_RE = re.compile(r"bot|crawl|spider|slurp|scrape|fetch|monitor|check|curl/|wget|python-requests|go-http|java/|okhttp|headless", re.I)
ASSET_EXT_RE = re.compile(r"\.(css|js|mjs|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|webm|mp4|mov|mp3|wav|json|xml|txt)$", re.I)


def classify(ua):
    """'unfurl:<label>' | 'agent:<label>|<vendor>' | 'bot' | 'human'."""
    u = ua.lower()
    for m, label in UNFURL_AGENTS:
        if m in u:
            return "unfurl", label, ""
    for m, label, vendor in LIVE_FETCH_AGENTS:
        if m in u:
            return ("bot", "", "") if label is None else ("agent", label, vendor)
    if not u or u == "-" or BOT_RE.search(u) or not u.startswith("mozilla/"):
        return "bot", "", ""
    return "human", "", ""


def is_page(uri, query):
    if not uri or uri.startswith("/_next/") or uri.startswith("/api/") or "_rsc=" in query:
        return False
    return not ASSET_EXT_RE.search(uri)


def daterange(a, b):
    d = a
    while d <= b:
        yield d
        d += dt.timedelta(days=1)


def fetch(bucket, prefix, start, end, dest, profile=None):
    cmd = ["aws", "s3", "sync", f"s3://{bucket}/{prefix}", dest, "--quiet", "--exclude", "*"]
    if profile:
        cmd += ["--profile", profile]
    for d in daterange(start, end):
        cmd += ["--include", f"*.{d.isoformat()}-*.gz"]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError(p.stderr.strip()[:300] or "aws s3 sync failed")


def parse_logs(path):
    fields = None
    for root, _, files in os.walk(path):
        for fn in sorted(files):
            if not fn.endswith(".gz"):
                continue
            with gzip.open(os.path.join(root, fn), "rt", errors="replace") as fh:
                for line in fh:
                    # Legacy logging: "#Version" then "#Fields: date time ...". Standard
                    # logging v2 (plain): a bare space-separated header, "timestamp c-ip ...".
                    if line.startswith("#Fields:"):
                        fields = line.split(":", 1)[1].split()
                        continue
                    if line.startswith("#") or not line.strip():
                        continue
                    first = line.split(None, 1)[0]
                    if first in ("timestamp", "date"):
                        fields = line.split()
                        continue
                    if not fields:
                        continue
                    parts = line.rstrip("\n").split("\t")
                    if len(parts) >= len(fields):
                        yield dict(zip(fields, parts))


def row_time(row):
    """UTC naive datetime of a log row: v2 'timestamp' is epoch seconds, legacy has date and time."""
    if row.get("timestamp"):
        try:
            return dt.datetime.fromtimestamp(float(row["timestamp"]), dt.timezone.utc).replace(tzinfo=None)
        except ValueError:
            return None
    try:
        return dt.datetime.fromisoformat(f"{row.get('date', '')} {row.get('time', '')}")
    except ValueError:
        return None


def iso(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(dt.timezone.utc).replace(tzinfo=None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("outdir")
    ap.add_argument("--since", required=True)
    ap.add_argument("--until", required=True)
    a = ap.parse_args()
    cfg = cfgmod.load()
    e = cfg.get("edge")
    outpath = os.path.join(a.outdir, "edge.json")
    os.makedirs(a.outdir, exist_ok=True)
    since, until = iso(a.since), iso(a.until)
    out = {"available": False, "window": {"since": a.since, "until": a.until}}
    if not e or e.get("kind") != "cloudfront" or not e.get("bucket"):
        out["reason"] = "no edge block in foundby.json"
        json.dump(out, open(outpath, "w"))
        print("edge: not configured", file=sys.stderr)
        return
    tmp = tempfile.mkdtemp(prefix="foundby-edge-")
    try:
        try:
            fetch(e["bucket"], e.get("prefix") or "", (since - dt.timedelta(days=1)).date(),
                  (until + dt.timedelta(days=1)).date(), tmp, e.get("profile"))
        except Exception as ex:  # noqa: BLE001
            out["reason"] = str(ex)[:200]
            json.dump(out, open(outpath, "w"))
            print(f"edge: unavailable ({out['reason']})", file=sys.stderr)
            return
        referrers, unfurlers, agents = collections.Counter(), collections.Counter(), collections.Counter()
        agent_vendor, stamps, n = {}, [], 0
        for row in parse_logs(tmp):
            ts = row_time(row)
            if ts is None:
                continue
            if not (since <= ts < until):
                continue
            n += 1
            stamps.append(ts)
            ua = urllib.parse.unquote_plus(row.get("cs(User-Agent)", "") or "")
            uri = urllib.parse.unquote_plus(row.get("cs-uri-stem", "") or "")
            query = urllib.parse.unquote_plus(row.get("cs-uri-query", "") or "")
            status = row.get("sc-status", "")
            page = is_page(uri, query) and (status.startswith("2") or status == "304")
            kind, label, vendor = classify(ua)
            if kind == "unfurl":
                unfurlers[label] += 1
            elif kind == "agent":
                agents[label] += 1
                agent_vendor[label] = vendor
            elif kind == "human" and page:
                ref = urllib.parse.unquote_plus(row.get("cs(Referer)", "") or "")
                if ref and ref != "-":
                    try:
                        host = urllib.parse.urlparse(ref).netloc.lower()
                    except ValueError:
                        host = ""
                    if host and not cfgmod.is_internal(host, cfg):
                        referrers[host] += 1
        if not n:
            out["reason"] = "no log records in window"
            json.dump(out, open(outpath, "w"))
            print("edge: no records in window", file=sys.stderr)
            return
        stamps.sort()
        covered = max(1, round((stamps[-1] - stamps[0]).total_seconds() / 3600))
        expected = max(1, round((until - since).total_seconds() / 3600))
        out.update({
            "available": True,
            "coverage": {"first": stamps[0].isoformat(), "last": stamps[-1].isoformat(),
                         "covered_hours": covered, "expected_hours": expected, "partial": covered < expected * 0.9},
            "requests": n,
            "referrers": [{"name": k, "hits": v} for k, v in referrers.most_common()],
            "unfurlers": [{"name": k, "hits": v} for k, v in unfurlers.most_common()],
            "agents": [{"name": k, "vendor": agent_vendor[k], "hits": v} for k, v in agents.most_common()],
        })
        json.dump(out, open(outpath, "w"))
        print(f"edge: {n} requests, {len(referrers)} referring hosts, {len(unfurlers)} unfurlers, "
              f"{len(agents)} live-fetch agents, {covered}h of {expected}h", file=sys.stderr)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
