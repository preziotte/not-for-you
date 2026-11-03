#!/usr/bin/env python3
"""foundby: keep a ledger of every way people find your site, and report only what is new.

  foundby.py init <site> [--ledger docs/foundby.md]   write a starter foundby.json here
  foundby.py doctor                                  check each source, recommend what to wire
  foundby.py run <outdir> [--full] [--skip edge,ga,mentions,bing]
                                                     pull every source since the last run, fold
                                                     into the ledger, print the report
  foundby.py set <key> [--kind K] [--note N]         classify a row after looking it up
  foundby.py set --stdin                             many at once: one JSON object per line,
                                                     {"key","kind","note"} or {"url","kind","note","date"}
  foundby.py mention <url> [--kind K] [--note N] [--date D]
                                                     record a page found by hand or by search
  foundby.py render                                  rewrite the markdown from the JSON
  foundby.py view                                    open the ledger viewer in the browser
  foundby.py window [--full]                         print the window the next run would cover
  foundby.py update [--check]                        update the skill from GitHub (--check only says
                                                     whether a newer version exists)
  foundby.py version                                 print the installed version

Config is foundby.json, found upward from the current directory (or $FOUNDBY_CONFIG).
"""

import argparse
import base64
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import config as cfgmod  # noqa: E402
from ledger import KINDS, Ledger, print_report  # noqa: E402

PY = sys.executable or "python3"
REPO = "preziotte/foundby"
# realpath so a symlinked install (~/.claude/skills/foundby -> a clone) updates the clone
SKILL_DIR = os.path.dirname(os.path.realpath(HERE))
VERSION_FILE = os.path.join(SKILL_DIR, "VERSION")
# Files the tarball update replaces. Never the user's config or the site.
SKILL_FILES = ["SKILL.md", "README.md", "LICENSE", "VERSION", "CLAUDE.md", "scripts", "docs"]


def installed_version():
    try:
        return open(VERSION_FILE).read().strip() or "0.0.0"
    except OSError:
        return "0.0.0"


VERSION = installed_version()


def run_script(name, *args, env=None):
    p = subprocess.run([PY, os.path.join(HERE, name), *args], env={**os.environ, **(env or {})})
    return p.returncode == 0


# -------------------------------------------------------------------- init ----

def cmd_init(a):
    path = os.path.join(os.getcwd(), cfgmod.FILENAME)
    if os.path.exists(path) and not a.force:
        sys.exit(f"{path} exists; pass --force to overwrite")
    site = a.site.lower().removeprefix("https://").removeprefix("http://").strip("/").removeprefix("www.")
    cfg = {
        "site": site,
        "aliases": [],
        "own": [],
        "ledger": a.ledger,
        "cap_days": 60,
        "mentions": {"queries": [site] + ([site.replace(".", " ", 1)] if site.count(".") == 1 else []),
                     "youtube": not a.no_youtube, "skip_github_owners": []},
    }
    if a.ga:
        cfg["ga"] = {"property": a.ga, "key_file": cfgmod.GA_DEFAULTS["key_file"], "start": "2025-01-01", "custom_dimensions": False}
    if a.bucket:
        cfg["edge"] = {"kind": "cloudfront", "bucket": a.bucket, "prefix": a.prefix or "", "start": a.edge_start}
    if a.bing:
        cfg["bing"] = {"key_file": cfgmod.BING_DEFAULTS["key_file"], "site_url": f"https://{site}/"}
    json.dump(cfg, open(path, "w"), indent=2)
    open(path, "a").write("\n")
    print(f"wrote {path}\nnext: foundby.py doctor")


# ------------------------------------------------------------------ doctor ----

def _ok(label, msg):
    print(f"  ok    {label:<10} {msg}")


def _no(label, msg):
    print(f"  --    {label:<10} {msg}")


def _todo(label, msg):
    print(f"  todo  {label:<10} {msg}")


def cmd_doctor(a):
    cfg = cfgmod.load()
    site = cfg["site"]
    print(f"\nfoundby {VERSION} doctor · {site} · {cfg.path}\n")
    recs = []

    # mentions
    mc = cfg["mentions"]
    if shutil.which("gh") and subprocess.run(["gh", "auth", "status"], capture_output=True).returncode == 0:
        _ok("github", "gh is logged in; code search for the domain works")
    else:
        _no("github", "gh not logged in. `gh auth login` unlocks GitHub code search, the best free source for awesome lists and projects that cite you")
        recs.append("run `gh auth login` (GitHub code search is where awesome-list listings show up first)")
    _ok("hn", "Hacker News via Algolia, no key needed")
    _ok("bluesky", "public search API, no key needed")
    _ok("lobsters", "per-domain story feed, no key needed")
    if mc.get("reddit_json") and os.path.exists(mc["reddit_json"]):
        _ok("reddit", f"reading saved search from {mc['reddit_json']}")
    else:
        _no("reddit", "anonymous search is 403. Save https://www.reddit.com/search.json?q=%22" + urllib.parse.quote(site) + "%22&sort=new&limit=100 from a logged-in browser and set mentions.reddit_json")
    print(f"  {'on' if mc.get('youtube') else 'off':<5} youtube    description search (scraped, your domain in the queries), {len(mc.get('youtube_langs') or [])} locales, minutes on the first run")
    print("        each mention source is a key under \"mentions\" in foundby.json; false turns it off")
    print(f"        queries    {', '.join(mc['queries'])}")

    # GA
    g = cfg.get("ga")
    if not g:
        _no("ga", "no ga block. GA4 adds utm/gclid sources, the AI Assistant channel and the only trace of in-app browsers")
        recs.append("add GA4: create a service account key, add it as Viewer on the property, put property id and key path under \"ga\"")
    elif not os.path.exists(g["key_file"]):
        _no("ga", f"key file missing: {g['key_file']}")
    else:
        try:
            sys.path.insert(0, HERE)
            import ga as gamod
            dims = gamod.metadata(cfg)
            have = {d.split(":", 1)[1] for d in dims}
            want = {"referrer_host", "referrer_full", "in_app_browser"}
            _ok("ga", f"property {g['property']} reachable, {len(dims)} custom dimensions")
            if want <= have:
                if not g.get("custom_dimensions"):
                    _todo("ga", "referrer_host, referrer_full and in_app_browser exist; set ga.custom_dimensions=true to read them")
                    recs.append("set \"custom_dimensions\": true under ga")
                else:
                    _ok("ga", "custom dimensions referrer_host, referrer_full, in_app_browser are read")
            else:
                missing = ", ".join(sorted(want - have))
                _todo("ga", f"custom dimensions missing: {missing}. See docs/sources.md#ga4 for the 20-line tag snippet; it adds referring *pages* and in-app browsers (TikTok, Instagram) that nothing else can see")
                recs.append("add the GA4 custom dimensions (docs/sources.md#ga4)")
            # a quick look at the property to recommend channels
            tok = gamod.token(g["key_file"])
            until = (dt.date.today() - dt.timedelta(days=1)).isoformat()
            since = (dt.date.today() - dt.timedelta(days=90)).isoformat()
            rows = gamod.report(tok, g["property"], since, until, ["sessionDefaultChannelGroup"], "sessions")
            total = sum(r["hits"] for r in rows) or 1
            mix = {r["name"]: r["hits"] for r in rows}
            top = ", ".join(f"{k} {round(100 * v / total)}%" for k, v in sorted(mix.items(), key=lambda x: -x[1])[:5])
            print(f"        90 days    {total} sessions: {top}")
            direct = mix.get("Direct", 0) / total
            if direct > 0.3 and not cfg.get("edge"):
                recs.append(f"Direct is {round(100 * direct)}% of sessions: edge logs would show the unfurlers (Slack, Discord, iMessage) behind that, add an edge block")
            srcs = gamod.report(tok, g["property"], since, until, ["sessionSource"], "sessions")
            names = {r["name"].lower() for r in srcs if r["hits"] >= 3}
            if any("youtube" in n for n in names) and not mc.get("youtube"):
                recs.append("YouTube already sends sessions; turn on mentions.youtube to find the videos crediting you")
            if any(n in names for n in ("github.com", "github")) and "github" not in names:
                pass
            if not any("reddit" in n for n in names) and not mc.get("reddit_json"):
                pass
        except Exception as e:  # noqa: BLE001
            _no("ga", f"unreachable: {str(e)[:120]}")

    # edge
    e = cfg.get("edge")
    if not e:
        _no("edge", "no edge block. CDN logs see referrers without JS, link unfurlers (private shares) and AI live-fetch agents")
        if not any("edge block" in r for r in recs):
            recs.append("add CloudFront standard logging to an S3 bucket and an \"edge\" block (docs/sources.md#edge-logs); nothing else sees Slack/Discord/iMessage shares")
    elif not shutil.which("aws"):
        _no("edge", "aws CLI not installed")
    else:
        cmd = ["aws", "s3", "ls", f"s3://{e['bucket']}/{e.get('prefix') or ''}"]
        if e.get("profile"):
            cmd += ["--profile", e["profile"]]
        p = subprocess.run(cmd, capture_output=True, text=True)
        if p.returncode == 0:
            _ok("edge", f"s3://{e['bucket']}/{e.get('prefix') or ''} listable" + (f", logs start {e['start']}" if e.get("start") else ""))
            if not e.get("start"):
                _todo("edge", "set edge.start (YYYY-MM-DD) to the day logging began so --full can rebuild from it")
        elif p.stderr.strip():
            _no("edge", f"cannot list bucket: {p.stderr.strip()[:100]}")
        else:
            top = subprocess.run(["aws", "s3", "ls", f"s3://{e['bucket']}/"] + cmd[4:], capture_output=True, text=True)
            seen = ", ".join(t.split()[-1] for t in top.stdout.strip().splitlines()[:5]) or "nothing"
            _no("edge", f"nothing under s3://{e['bucket']}/{e.get('prefix') or ''}. Bucket root holds: {seen}. "
                        "Logging v2 writes under AWSLogs/<account-id>/CloudFront/<suffix>/; set edge.prefix to that whole path")

    # bing
    b = cfg.get("bing")
    if not b:
        _no("bing", "no bing block. Bing Webmaster's link API is the only free backlink API; often empty, but free")
    elif not os.path.exists(b["key_file"]):
        _no("bing", f"key file missing: {b['key_file']}")
    else:
        _ok("bing", f"key present, site {b['site_url']}")

    led = Ledger(cfg)
    n = len(led.state["rows"])
    try:
        ig = subprocess.run(["git", "check-ignore", "-q", os.path.abspath(led.md)], capture_output=True,
                            cwd=os.path.dirname(os.path.abspath(led.md)) if os.path.isdir(os.path.dirname(os.path.abspath(led.md))) else None)
        ignored = ig.returncode == 0
    except OSError:
        ignored = False
    if ignored:
        _todo("ledger", f"{led.md} is gitignored, so the ledger would never be committed; point \"ledger\" in foundby.json at a tracked path")
    print(f"\n  ledger     {led.md} ({n} rows, last run {led.state.get('last_run') or 'never'})")
    if recs:
        print("\n  recommended, in order:")
        for i, r in enumerate(recs, 1):
            print(f"   {i}. {r}")
    print()


# --------------------------------------------------------------------- run ----

def cmd_run(a):
    cfg = cfgmod.load()
    led = Ledger(cfg)
    if not a.full and not led.state.get("last_run") and (cfg.get("ga") or cfg.get("edge")):
        sys.exit("ledger is empty: run once with --full to seed it quietly from the configured history "
                 "(every host ever seen would otherwise print as NEW), then run again without it")
    w = led.window(a.full)
    out = a.outdir
    os.makedirs(out, exist_ok=True)
    skip = set((a.skip or "").split(",")) - {""}
    print(f"foundby {VERSION} · window: edge {w['edge_since']}..{w['edge_until']} · ga {w['ga_since']}..{w['ga_until']} · "
          f"capped={w['capped']} · last_run={w['last_run']}", file=sys.stderr)
    for f in ("edge.json", "ga.json", "mentions.json", "bing.json"):
        try:
            os.remove(os.path.join(out, f))
        except FileNotFoundError:
            pass
    if "edge" not in skip and cfg.get("edge"):
        if w["edge_since"] < w["edge_until"]:
            run_script("edge.py", out, "--since", w["edge_since"], "--until", w["edge_until"])
        else:
            print("edge: no new complete hour since last run", file=sys.stderr)
            json.dump({"available": False, "reason": "no new complete hour"}, open(os.path.join(out, "edge.json"), "w"))
    if "ga" not in skip and cfg.get("ga"):
        run_script("ga.py", out, "--since", w["ga_since"], "--until", w["ga_until"])
    if "mentions" not in skip and not a.full:
        run_script("mentions.py", out)
    if "bing" not in skip and cfg.get("bing"):
        run_script("bing.py", out)
    rep = led.merge(out, w["since"], w["until"], w["edge_since"], w["edge_until"], seed=a.full)
    print_report(rep)


# -------------------------------------------------------------- set/mention ----

def _check_kind(kind):
    if kind and kind not in KINDS:
        sys.exit(f"kind must be one of {' '.join(KINDS)}, not {kind!r}")


def apply_set(led, key, kind=None, note=None):
    row = led.state["rows"].get(key)
    if not row:
        return f"no row {key}"
    _check_kind(kind)
    if kind:
        row["kind"] = kind
    if note is not None:
        row["note"] = note
    return f"{key}: {row['kind']} · {row['note']}"


def apply_mention(led, url, kind="blog", note="", date=None):
    _check_kind(kind)
    host = led.norm_host(urllib.parse.urlparse(url).netloc)
    if host == "github.com":
        host = "github:" + "/".join(urllib.parse.urlparse(url).path.strip("/").split("/")[:2])
    day = date or dt.date.today().isoformat()
    row = led.state["rows"].get(host)
    if row is None:
        row = led.state["rows"][host] = led.new_row(host, kind, day, "web")
    if "web" not in row["via"]:
        row["via"].append("web")
    if url not in row["pages"]:
        row["pages"].insert(0, url)
    if note:
        row["note"] = note
    if row["kind"] == "unknown":
        row["kind"] = kind
    return f"{host}: {row['kind']} · {row['note']} · {url}"


def cmd_set(a):
    led = Ledger(cfgmod.load())
    if a.stdin:
        # one JSON object per line (blank lines ignored); one save at the end
        for n, line in enumerate(sys.stdin, 1):
            if not line.strip():
                continue
            try:
                o = json.loads(line)
            except ValueError:
                sys.exit(f"stdin line {n}: not JSON: {line.strip()[:80]}")
            if o.get("url"):
                print(apply_mention(led, o["url"], o.get("kind") or "blog", o.get("note") or "", o.get("date")))
            elif o.get("key"):
                print(apply_set(led, o["key"], o.get("kind"), o.get("note")))
            else:
                sys.exit(f"stdin line {n}: needs \"key\" or \"url\"")
    elif a.key:
        msg = apply_set(led, a.key, a.kind, a.note)
        if msg.startswith("no row "):
            sys.exit(msg)
        print(msg)
    else:
        sys.exit("set needs a key or --stdin")
    led.save()


def cmd_mention(a):
    led = Ledger(cfgmod.load())
    print(apply_mention(led, a.url, a.kind, a.note, a.date))
    led.save()


# -------------------------------------------------------------------- view ----

ICON_TYPES = {"image/png": "image/png", "image/svg+xml": "image/svg+xml", "image/x-icon": "image/x-icon",
              "image/vnd.microsoft.icon": "image/x-icon", "image/jpeg": "image/jpeg", "image/gif": "image/gif",
              "image/webp": "image/webp"}
ICON_EXT = {"png": "image/png", "svg": "image/svg+xml", "ico": "image/x-icon", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "gif": "image/gif", "webp": "image/webp"}
ICON_FALLBACKS = ["/apple-touch-icon.png", "/favicon.svg", "/favicon.png", "/favicon.ico"]


def _get(url, accept, limit, timeout=4):
    req = urllib.request.Request(url, headers={"Accept": accept, "User-Agent": "foundby (viewer icon)"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read(limit + 1)
            if len(body) > limit:
                return None, None
            return r.headers.get_content_type().lower(), body
    except Exception:  # noqa: BLE001
        return None, None


def site_icon(site):
    """The site's own icon as a data URI, best effort: the homepage's declared icon links
    (apple-touch-icon first, then svg, then png), then the usual paths. None when nothing loads.
    Only the user's own site is fetched; nothing about the ledger is sent anywhere."""
    origin = f"https://{site}"
    ctype, page = _get(origin + "/", "text/html", 512 * 1024)
    urls = []
    if ctype == "text/html" and page:
        for tag in re.findall(r"<link\b[^>]*>", page.decode("utf-8", "replace"), re.I):
            rel = re.search(r"""\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""", tag, re.I)
            href = re.search(r"""\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""", tag, re.I)
            rels = (next((g for g in rel.groups() if g), "") if rel else "").lower().split()
            h = next((g for g in href.groups() if g), None) if href else None
            if h and any(r in ("icon", "apple-touch-icon", "shortcut") for r in rels):
                u = urllib.parse.urljoin(origin + "/", h)
                if u.startswith(("http://", "https://")) and u not in urls:
                    urls.append(u)
        score = lambda u: 3 if "apple-touch-icon" in u else 2 if re.search(r"\.svg(\?|$)", u) else 1 if re.search(r"\.png(\?|$)", u) else 0
        urls.sort(key=score, reverse=True)
    for u in urls + [origin + p for p in ICON_FALLBACKS]:
        ctype, body = _get(u, "image/*", 256 * 1024)
        if not body:
            continue
        ext = urllib.parse.urlparse(u).path.rsplit(".", 1)[-1].lower()
        mime = ICON_TYPES.get(ctype) or ICON_EXT.get(ext)
        if mime:
            return f"data:{mime};base64,{base64.b64encode(body).decode()}"
    return None


def cmd_view(a):
    cfg = cfgmod.load()
    led = Ledger(cfg)
    data = {**led.state, "site": cfg["site"], "ledger": os.path.relpath(cfg["ledger"], cfg.root), "icon": site_icon(cfg["site"])}
    html = open(os.path.join(HERE, "view.html")).read().replace("__SITE__", cfg["site"]).replace("__DATA__", json.dumps(data).replace("</", "<\\/"))
    out = a.out or os.path.join(tempfile.gettempdir(), f"foundby-{cfg['site']}.html")
    open(out, "w").write(html)
    if not a.no_open:
        opener = "open" if sys.platform == "darwin" else "xdg-open" if sys.platform.startswith("linux") else "start"
        cmd = [opener, "-a", "Google Chrome", out] if sys.platform == "darwin" and shutil.which("open") else [opener, out]
        if subprocess.run(cmd, capture_output=True).returncode != 0:
            subprocess.run([opener, out])
    print(out)


# ------------------------------------------------------------------ update ----

def _vtuple(v):
    return tuple(int(x) for x in re.findall(r"\d+", v)[:3])


def latest_version():
    """Newest version on GitHub, or None when it cannot be reached. One GET for a tiny
    file; nothing about the user or the ledger is sent."""
    url = f"https://raw.githubusercontent.com/{REPO}/main/VERSION"
    req = urllib.request.Request(url, headers={"User-Agent": f"foundby/{VERSION}"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.read(64).decode().strip() or None
    except Exception:  # noqa: BLE001
        return None


def _update_git():
    p = subprocess.run(["git", "-C", SKILL_DIR, "pull", "--ff-only", "--quiet"], capture_output=True, text=True)
    if p.returncode != 0:
        sys.exit(f"git pull failed in {SKILL_DIR}:\n{p.stderr.strip()}\nFix it there (local changes?) and rerun, or reclone.")


def _update_tarball():
    url = f"https://github.com/{REPO}/archive/refs/heads/main.tar.gz"
    with tempfile.TemporaryDirectory() as tmp:
        tgz = os.path.join(tmp, "foundby.tar.gz")
        try:
            urllib.request.urlretrieve(url, tgz)
        except Exception as e:  # noqa: BLE001
            sys.exit(f"could not download {url}: {str(e)[:120]}")
        with tarfile.open(tgz) as tar:
            try:
                tar.extractall(tmp, filter="data")
            except TypeError:  # Python < 3.12
                tar.extractall(tmp)
        src = next(os.path.join(tmp, d) for d in os.listdir(tmp) if os.path.isdir(os.path.join(tmp, d)))
        for name in SKILL_FILES:
            a, b = os.path.join(src, name), os.path.join(SKILL_DIR, name)
            if not os.path.exists(a):
                continue
            if os.path.isdir(a):
                shutil.rmtree(b, ignore_errors=True)
                shutil.copytree(a, b)
            else:
                shutil.copy2(a, b)


def cmd_update(a):
    if a.check:
        cfg = cfgmod.load(required=False)
        if cfg is not None and cfg.get("check_updates") is False:
            print(f"foundby {VERSION} · update check disabled in foundby.json")
            return
        latest = latest_version()
        if latest is None:
            print(f"foundby {VERSION} · could not reach GitHub to check for updates")
        elif _vtuple(latest) > _vtuple(VERSION):
            print(f"foundby {VERSION} · {latest} is available · run `foundby.py update`")
        else:
            print(f"foundby {VERSION} · up to date")
        return
    before = VERSION
    if os.path.isdir(os.path.join(SKILL_DIR, ".git")) and shutil.which("git"):
        _update_git()
    else:
        _update_tarball()
    after = installed_version()
    print(f"foundby {before} -> {after} ({SKILL_DIR})" if after != before else f"foundby {after} · already up to date ({SKILL_DIR})")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("init"); i.add_argument("site"); i.add_argument("--ledger", default="docs/foundby.md")
    i.add_argument("--ga", help="GA4 property id"); i.add_argument("--bucket", help="CloudFront logs bucket")
    i.add_argument("--prefix", help="key prefix in the bucket"); i.add_argument("--edge-start", help="YYYY-MM-DD logging began")
    i.add_argument("--bing", action="store_true"); i.add_argument("--force", action="store_true")
    i.add_argument("--no-youtube", action="store_true", help="skip the YouTube description search")
    sub.add_parser("doctor")
    r = sub.add_parser("run"); r.add_argument("outdir"); r.add_argument("--full", action="store_true"); r.add_argument("--skip")
    s = sub.add_parser("set"); s.add_argument("key", nargs="?"); s.add_argument("--kind"); s.add_argument("--note")
    s.add_argument("--stdin", action="store_true", help="read JSON lines of rows to set or mention")
    m = sub.add_parser("mention"); m.add_argument("url"); m.add_argument("--kind", default="blog"); m.add_argument("--note", default=""); m.add_argument("--date")
    sub.add_parser("render")
    v = sub.add_parser("view"); v.add_argument("--out"); v.add_argument("--no-open", action="store_true")
    w = sub.add_parser("window"); w.add_argument("--full", action="store_true")
    u = sub.add_parser("update"); u.add_argument("--check", action="store_true")
    sub.add_parser("version")
    a = ap.parse_args()
    if a.cmd == "init":
        cmd_init(a)
    elif a.cmd == "doctor":
        cmd_doctor(a)
    elif a.cmd == "run":
        cmd_run(a)
    elif a.cmd == "set":
        cmd_set(a)
    elif a.cmd == "mention":
        cmd_mention(a)
    elif a.cmd == "render":
        Ledger(cfgmod.load()).save()
    elif a.cmd == "view":
        cmd_view(a)
    elif a.cmd == "window":
        print(json.dumps(Ledger(cfgmod.load()).window(a.full)))
    elif a.cmd == "update":
        cmd_update(a)
    elif a.cmd == "version":
        print(VERSION)


if __name__ == "__main__":
    main()
