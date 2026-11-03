#!/usr/bin/env python3
"""Free mention search: pages that talk about the site whether or not anyone clicked.
Writes mentions.json for ledger.py.

Usage: mentions.py <outdir> [--since YYYY-MM-DD]

Sources, each one request and each degrading alone:
  hn        Hacker News stories and comments (Algolia API, no key)
  reddit    Reddit posts. Anonymous search.json is 403 for most clients; set
            mentions.reddit_json in foundby.json to a file saved from a logged-in browser
            (docs/sources.md explains), or leave it and accept "failed".
  github    GitHub code search via `gh api` (needs `gh auth login`). Finds awesome lists,
            READMEs and projects that cite the site. One row per repo, README preferred;
            mirrors of awesome lists and domain dumps are dropped.
  bluesky   Bluesky post search (public API, no key).
  lobsters  Stories linking the domain (404 until the first one exists; that is 0, not a failure).
  youtube   Videos whose description names the site. The Data API cannot search
            descriptions, so the results page is scraped per query and locale and each
            candidate's watch page is read to confirm. Videos already checked are listed
            in the ledger JSON (youtube_checked) and skipped, so the first run takes a few
            minutes and later ones seconds. Fuzzy run to run; the ledger is the record.
            Turn off with mentions.youtube=false.
Not covered: X (paid API), Instagram and TikTok (no caption search).
"""

import argparse
import concurrent.futures as cf
import datetime as dt
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as cfgmod  # noqa: E402

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def get(url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def mention_re(queries):
    """vizz.fm, vizz fm, vizz-fm, @vizz-fm all count as the same name."""
    alts = set()
    for q in queries:
        alts.add(re.escape(q))
        parts = re.split(r"[.\s_-]+", q)
        if len(parts) > 1:
            alts.add(r"[\s._-]?".join(re.escape(p) for p in parts))
    return re.compile("|".join(sorted(alts, key=len, reverse=True)), re.I)


def hn(site, queries, m):
    d = get(f"https://hn.algolia.com/api/v1/search?query={urllib.parse.quote(site)}&tags=(story,comment)&hitsPerPage=100")
    out = []
    for h in d.get("hits", []):
        text = " ".join(str(h.get(k) or "") for k in ("title", "url", "comment_text", "story_text"))
        if not m.search(text):
            continue
        out.append({"url": f"https://news.ycombinator.com/item?id={h['objectID']}",
                    "title": h.get("title") or h.get("story_title") or "(comment)",
                    "date": (h.get("created_at") or "")[:10], "source": "hn", "author": h.get("author", "")})
    return out


def reddit(site, queries, m, saved=None):
    if saved and os.path.exists(saved):
        d = json.load(open(saved))
    else:
        d = get(f"https://www.reddit.com/search.json?q={urllib.parse.quote(chr(34) + site + chr(34))}&sort=new&limit=100&include_over_18=on")
    out = []
    for c in d.get("data", {}).get("children", []):
        p = c["data"]
        out.append({"url": "https://www.reddit.com" + p["permalink"], "title": f"r/{p['subreddit']}: {p['title']}",
                    "date": dt.datetime.fromtimestamp(p["created_utc"], dt.timezone.utc).strftime("%Y-%m-%d"),
                    "source": "reddit", "author": p.get("author", "")})
    return out


GITHUB_SKIP = re.compile(r"trackawesomelist|awesome-with-star|fucking-awesome|/domains$|hn_posts|harvest|-cop$|super-website-maker|top-?1m|tranco|majestic", re.I)


def github(site, queries, m, skip_owners=()):
    r = subprocess.run(["gh", "api", "-X", "GET", "search/code", "-f", f'q="{site}"', "-f", "per_page=100",
                        "-H", "Accept: application/vnd.github.text-match+json"], capture_output=True, text=True, timeout=60)
    if r.returncode:
        raise RuntimeError(r.stderr.strip()[:200])
    by_repo = {}
    for it in json.loads(r.stdout).get("items", []):
        repo = it["repository"]["full_name"]
        owner = repo.split("/")[0]
        if owner in skip_owners or GITHUB_SKIP.search(repo) or re.search(r"^\d+\.txt$", it["path"]):
            continue
        is_readme = it["path"].lower().startswith("readme")
        if repo not in by_repo or (is_readme and not by_repo[repo]["readme"]):
            by_repo[repo] = {"url": f"https://github.com/{repo}" if is_readme else it["html_url"], "readme": is_readme,
                             "title": repo + ("" if is_readme else f": {it['path']}"), "date": "", "source": "github",
                             "author": owner, "repo": repo}
    return [{k: v for k, v in r.items() if k != "readme"} for r in by_repo.values()]


def lobsters(site, queries, m):
    try:
        d = get(f"https://lobste.rs/domains/{site}.json")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        raise
    return [{"url": s["short_id_url"], "title": s["title"], "date": s["created_at"][:10], "source": "lobsters",
             "author": s.get("submitter_user", "")} for s in d]


def bluesky(site, queries, m):
    d = get(f"https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q={urllib.parse.quote(site)}&limit=100")
    out = []
    for p in d.get("posts", []):
        handle = p["author"]["handle"]
        rkey = p["uri"].rsplit("/", 1)[-1]
        out.append({"url": f"https://bsky.app/profile/{handle}/post/{rkey}",
                    "title": (p["record"].get("text") or "")[:120].replace("\n", " "),
                    "date": (p["record"].get("createdAt") or "")[:10], "source": "bluesky", "author": handle})
    return out


def _yt_page(url, lang="en-US,en;q=0.9"):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": lang, "Cookie": "CONSENT=YES+1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "ignore")


def _yt_walk(o, vids, conts):
    if isinstance(o, dict):
        if "videoRenderer" in o:
            vids.append(o["videoRenderer"])
        if "continuationCommand" in o:
            conts.append(o["continuationCommand"]["token"])
        for x in o.values():
            _yt_walk(x, vids, conts)
    elif isinstance(o, list):
        for x in o:
            _yt_walk(x, vids, conts)


def _yt_search(q, sp, lang, pages=3):
    html = _yt_page(f"https://www.youtube.com/results?search_query={urllib.parse.quote(q)}&sp={sp}", lang)
    i = html.find("var ytInitialData = ")
    if i < 0:
        raise RuntimeError(f"no ytInitialData in results page for {q!r}")
    vids, conts = [], []
    _yt_walk(json.JSONDecoder().raw_decode(html, i + len("var ytInitialData = "))[0], vids, conts)
    key = re.search(r'"INNERTUBE_API_KEY":"([^"]+)"', html)
    ver = re.search(r'"INNERTUBE_CLIENT_VERSION":"([^"]+)"', html)
    for _ in range(pages - 1):
        if not conts or not key or not ver:
            break
        body = json.dumps({"context": {"client": {"clientName": "WEB", "clientVersion": ver.group(1), "hl": lang[:2]}},
                           "continuation": conts[-1]}).encode()
        req = urllib.request.Request(f"https://www.youtube.com/youtubei/v1/search?key={key.group(1)}&prettyPrint=false", data=body,
                                     headers={"User-Agent": UA, "Content-Type": "application/json", "Accept-Language": lang})
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
        conts = []
        _yt_walk(d.get("onResponseReceivedCommands", []), vids, conts)
    return vids


def _yt_confirm(v, m):
    """Read one watch page; a result row when the description names the site, else None."""
    vid = v["videoId"]
    page = _yt_page(f"https://www.youtube.com/watch?v={vid}")
    d = re.search(r'"attributedDescription":\{"content":"((?:[^"\\]|\\.)*)"', page)
    desc = json.loads('"' + d.group(1) + '"') if d else ""
    if not m.search(desc):
        return None
    pub = re.search(r'"dateText":\{"simpleText":"[^"]*?([A-Z][a-z]{2} \d{1,2}, \d{4})"', page)
    day = dt.datetime.strptime(pub.group(1), "%b %d, %Y").strftime("%Y-%m-%d") if pub else ""
    title = "".join(r["text"] for r in v.get("title", {}).get("runs", []))
    author = "".join(r["text"] for r in v.get("ownerText", {}).get("runs", []))
    return {"url": f"https://www.youtube.com/watch?v={vid}", "title": f"{author}: {title}"[:120],
            "date": day, "source": "youtube", "author": author}


def youtube(site, queries, m, langs=(), checked=(), seen_out=None):
    """Searches run in parallel, then the watch pages of candidates not already in
    `checked` (video ids from earlier runs, kept in the ledger). Every id read this run is
    added to `seen_out` so the caller can persist it."""
    EN = "en-US,en;q=0.9"
    VIDEO, VIDEO_BY_DATE = "EgIQAQ%3D%3D", "CAISAhAB"
    qs = [(f'"{site}"', VIDEO_BY_DATE, EN), (f'"{site}"', VIDEO, EN)]
    qs += [(q, VIDEO_BY_DATE, EN) for q in queries if q != site]
    qs += [(site, VIDEO_BY_DATE, f"{l};q=0.9") for l in langs]
    def search(args):
        for attempt in range(2):  # YouTube sometimes serves a results page without data; try once more
            try:
                return _yt_search(*args)
            except RuntimeError as e:
                err = e
        return err

    with cf.ThreadPoolExecutor(max_workers=3) as pool:
        pages = list(pool.map(search, qs))
    failed = [p for p in pages if isinstance(p, Exception)]
    if len(failed) == len(pages):
        raise failed[0]
    seen, todo = set(), []
    for vids in pages:
        if isinstance(vids, Exception):
            continue
        for v in vids:
            vid = v["videoId"]
            if vid in seen or len(seen) >= 150:
                continue
            seen.add(vid)
            if vid not in checked:
                todo.append(v)
    with cf.ThreadPoolExecutor(max_workers=8) as pool:
        rows = [r for r in pool.map(lambda v: _yt_confirm(v, m), todo) if r]
    if seen_out is not None:
        seen_out.update(v["videoId"] for v in todo)
    return rows


def ledger_checked(cfg):
    """Video ids earlier runs already read, from the ledger JSON next to the markdown."""
    path = os.path.splitext(cfg["ledger"])[0] + ".json"
    try:
        return set(json.load(open(path)).get("youtube_checked") or [])
    except (OSError, ValueError):
        return set()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("outdir")
    ap.add_argument("--since", help="drop dated results older than this (undated ones are kept)")
    ap.add_argument("--only", help="comma-separated subset of sources, for testing")
    a = ap.parse_args()
    cfg = cfgmod.load()
    mc = cfg["mentions"]
    site, queries = cfg["site"], mc["queries"]
    m = mention_re(queries)
    os.makedirs(a.outdir, exist_ok=True)
    checked, yt_seen = ledger_checked(cfg), set()
    sources = [
        ("hn", mc["hn"], lambda: hn(site, queries, m)),
        ("reddit", mc["reddit"], lambda: reddit(site, queries, m, mc.get("reddit_json"))),
        ("github", mc["github"], lambda: github(site, queries, m, mc.get("skip_github_owners") or ())),
        ("bluesky", mc["bluesky"], lambda: bluesky(site, queries, m)),
        ("lobsters", mc["lobsters"], lambda: lobsters(site, queries, m)),
        ("youtube", mc["youtube"], lambda: youtube(site, queries, m, mc.get("youtube_langs") or (), checked, yt_seen)),
    ]
    only = set(a.only.split(",")) if a.only else None
    results, health = [], {}

    def run(fn):
        try:
            rows = fn()
            if a.since:
                rows = [r for r in rows if not r["date"] or r["date"] >= a.since]
            return rows, None
        except Exception as e:  # noqa: BLE001
            return [], "failed: " + str(e)[:80]

    active = [(name, fn) for name, enabled, fn in sources if (not only or name in only) and enabled]
    for name, enabled, _ in sources:
        if (not only or name in only) and not enabled:
            health[name] = "off"
    # every source at once; each one degrades alone
    with cf.ThreadPoolExecutor(max_workers=len(active) or 1) as pool:
        outcomes = list(pool.map(lambda nf: run(nf[1]), active))
    for (name, _), (rows, err) in zip(active, outcomes):
        results += rows
        health[name] = err or len(rows)
    health = {name: health[name] for name, _, _ in sources if name in health}
    json.dump({"results": results, "health": health, "youtube_checked": sorted(yt_seen)},
              open(os.path.join(a.outdir, "mentions.json"), "w"), indent=1)
    print("mentions: " + " · ".join(f"{k} {v}" for k, v in health.items()), file=sys.stderr)


if __name__ == "__main__":
    main()
