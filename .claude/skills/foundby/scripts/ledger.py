#!/usr/bin/env python3
"""The ledger: every distinct way a person has reached the site, with first-seen date,
a kind, and a note. State is <ledger>.json; <ledger>.md is rendered from it, and hand
edits to the kind and note columns of the markdown are read back before every write,
so either file can be edited.

A row is one key: a referring host (folded), `agent:<name>` for an AI live-fetch
agent, `unfurl:<platform>` for a link-preview bot, `app:<package>` for a native app
or in-app browser, `github:<owner/repo>` for a repository, or `ga:<source>` for a GA
source that is not a host. Pages (full URLs) attach to the host row.

Used through foundby.py; the functions here are the model.
"""

import datetime as dt
import json
import os
import re
import sys
import urllib.parse

KINDS = ["search", "ai", "social", "forum", "video", "blog", "directory", "award", "newsletter",
         "docs", "own", "app", "unfurler", "agent", "tool", "monitor", "junk", "unknown"]
ORDER = ["blog", "newsletter", "forum", "video", "award", "directory", "docs", "social", "unknown",
         "search", "ai", "agent", "app", "unfurler", "tool", "own", "monitor", "junk"]
PEOPLE_KINDS = ("unknown", "blog", "forum", "video", "directory", "newsletter", "docs", "award")

# Subdomain labels that are the same site in another skin (mobile, locale,
# redirector, safe-search). A host whose parent is known and whose first label
# is one of these folds into the parent.
FOLD_LABELS = set("""m r l lm old out noai safe start html lite away web mobile amp s go search cn uk us de fr it es
jp br in au ca nl ru pl tr kz uz ph sg hk tw id vn th mx ar co cl pe se no dk fi ie nz za be at ch cz
hu pt ro gr il ae sa eg ng ke malaysia espanol maktoob www2 www3 new beta""".split())

GA_SOURCE_NAMES = {
    "google": "google.com", "bing": "bing.com", "duckduckgo": "duckduckgo.com",
    "yahoo": "search.yahoo.com", "baidu": "baidu.com", "yandex": "yandex.com",
    "gemini": "gemini.google.com", "chatgpt": "chatgpt.com", "copilot": "copilot.microsoft.com",
    "perplexity": "perplexity.ai", "claude": "claude.ai", "ig": "instagram.com", "threads": "threads.com",
    "fb": "facebook.com", "twitter": "x.com", "t.co": "x.com", "youtube": "youtube.com", "linkedin": "linkedin.com",
    "reddit": "reddit.com", "producthunt": "producthunt.com", "hackernews": "news.ycombinator.com",
}
APP_PACKAGES = {
    "com.reddit.frontpage": "reddit.com", "com.google.android.googlequicksearchbox": "google.com",
    "com.google.android.gm": "app:gmail", "com.linkedin.android": "linkedin.com",
    "com.twitter.android": "x.com", "com.facebook.katana": "facebook.com",
    "com.instagram.android": "instagram.com", "com.pinterest": "pinterest.com",
    "org.telegram.messenger": "telegram.org", "com.discord": "discord.com",
    "com.slack": "slack.com", "com.microsoft.teams": "teams.microsoft.com",
    "com.laurencedawson.reddit_sync": "reddit.com", "nativeapp.toutiao.com": "toutiao.com",
    "com.zhiliaoapp.musically": "tiktok.com", "com.ss.android.ugc.trill": "tiktok.com",
}
SKIP_SOURCES = {"(direct)", "(not set)", "file", "localhost", "(none)", "(internal)", "(unparseable)"}

KNOWN = {
    "search": ["google.com", "bing.com", "duckduckgo.com", "search.yahoo.com", "search.brave.com",
               "yahoo.com", "search.yahoo.co.jp", "yandex.com", "ya.ru", "baidu.com", "oceanhero.today",
               "coccoc.com", "quark.cn", "search.naver.com", "search.nortonsafesearch.com", "search.delfi.lt",
               "ntp.msn.cn", "ecosia.org", "yandex.ru", "qwant.com", "startpage.com",
               "kagi.com", "presearch.com", "naver.com", "seznam.cz", "ntp.msn.com", "msn.com",
               "sogou.com", "so.com", "ask.com", "aol.com", "search.aol.com", "swisscows.com",
               "mojeek.com", "you.com", "searx.be", "search.marginalia.nu", "metager.org"],
    "ai": ["chatgpt.com", "chat.openai.com", "gemini.google.com", "claude.ai", "perplexity.ai",
           "copilot.com", "duck.ai", "alice.yandex.ru", "wenxin.baidu.com", "meta.ai", "assistant.kagi.com",
           "uncensored.chat", "yiyan.baidu.com", "tongyi.aliyun.com", "chatglm.cn",
           "copilot.microsoft.com", "yuanbao.tencent.com", "doubao.com", "kimi.com", "kimi.moonshot.cn",
           "poe.com", "grok.com", "x.ai", "chat.mistral.ai", "chat.deepseek.com",
           "deepseek.com", "character.ai", "pi.ai", "huggingface.co", "chat.qwen.ai", "manus.im",
           "genspark.ai", "felo.ai", "iask.ai", "phind.com", "andisearch.com", "komo.ai",
           "liner.com", "getliner.com", "notebooklm.google.com", "aistudio.google.com", "chat.z.ai",
           "you.com", "cursor.com", "lovable.dev", "bolt.new", "v0.dev", "replit.com"],
    "social": ["x.com", "twitter.com", "t.co", "facebook.com", "l.facebook.com", "lm.facebook.com",
               "web.telegram.org", "l.threads.com", "l.messenger.com", "messenger.com", "vk.ru", "away.vk.ru",
               "wx.mail.qq.com", "mail.qq.com", "statics.gov.teams.microsoft.us", "teams.microsoft.us",
               "m.facebook.com", "instagram.com", "l.instagram.com", "linkedin.com", "lnkd.in",
               "pinterest.com", "tiktok.com", "threads.net", "threads.com", "bsky.app", "mastodon.social",
               "vk.com", "t.me", "telegram.org", "snapchat.com", "tumblr.com", "wechat.com", "weibo.com",
               "discord.com", "slack.com", "teams.microsoft.com", "statics.teams.cdn.office.net",
               "teams.public.onecdn.static.microsoft", "classroom.google.com", "whatsapp.com",
               "web.whatsapp.com", "mail.google.com", "outlook.live.com", "outlook.office.com", "toutiao.com",
               "mastodon.online", "fosstodon.org", "hachyderm.io", "indieweb.social", "substack.com",
               "medium.com", "dev.to", "hashnode.com", "lemmy.ml"],
    "forum": ["reddit.com", "news.ycombinator.com", "hacker-news.firebaseio.com", "hacker-news.news", "lobste.rs",
              "hckrnews.com", "hn.algolia.com", "discourse.threejs.org", "quora.com", "stackoverflow.com",
              "lemmy.world", "forums.macrumors.com", "indiehackers.com", "community.openai.com", "tildes.net"],
    "video": ["youtube.com", "youtu.be", "twitch.tv", "vimeo.com", "kick.com"],
    "award": ["awwwards.com", "cssdesignawards.com", "thefwa.com", "csswinner.com", "webflow.com", "godly.website"],
    "directory": ["producthunt.com", "alternativeto.net", "github.com", "toolify.ai", "theresanaiforthat.com",
                  "futurepedia.io", "saashub.com", "pinboard.opera.com", "start.me", "linktr.ee",
                  "betalist.com", "trackawesomelist.com", "indieshowcase.io", "peerlist.io", "sitelike.org",
                  "onepagelove.com", "minimal.gallery", "startup.is", "uneed.best", "startupfa.me",
                  "launchingnext.com", "npmjs.com", "pypi.org", "chromewebstore.google.com", "addons.mozilla.org",
                  "microsoftedge.microsoft.com", "aitools.fyi", "tinylaunch.com", "fazier.com", "devhunt.org"],
    "tool": ["keep.google.com", "app.raindrop.io", "instapaper.com", "inoreader.com", "canva.com",
             "remove.bg", "admin.shopify.com", "encurtador.dev", "search.google.com", "notion.so",
             "docs.google.com", "drive.google.com", "feedly.com", "getpocket.com", "bitly.com", "t.ly",
             "bit.ly", "tinyurl.com", "search.console.google.com", "analytics.google.com", "web.archive.org",
             "translate.google.com", "pagespeed.web.dev", "validator.w3.org", "deepl.com", "readwise.io",
             "accounts.google.com", "login.microsoftonline.com", "appleid.apple.com", "auth0.com", "stripe.com", "checkout.stripe.com"],
}
KNOWN_KIND = {h: k for k, hosts in KNOWN.items() for h in hosts}
JUNK_RE = re.compile(
    r"(^|\.)(vercel\.app|netlify\.app|pages\.dev|herokuapp\.com|repl\.co|glitch\.me|ngrok(-free)?\.(app|io))$"
    r"|seo|semrush|ahrefs|majestic|moz\.com|backlink|rank|traffic|bot|crawl|scan|proxy|cdn-cgi|\.xyz$|\.top$|\.icu$"
    r"|^localhost|\.local$|\.internal$|^translate\.goog|\.execute-api\.|\.run\.app$|\.amazonaws\.com$"
    r"|goguardian|securly|service-now\.com$|sharepoint\.com$|grafana\.|\.wtf$|-dev\."
)
IP_RE = re.compile(r"^\d+\.\d+\.\d+\.\d+$")

# Shape of the ledger JSON. Bump when a field changes meaning; _load migrates older
# ledgers forward and refuses newer ones.
SCHEMA = 1

# Keys that changed name between versions; applied when a ledger is loaded so a rename
# never shows up as a NEW row.
KEY_RENAMES = {
    "unfurl:Facebook / Messenger": "unfurl:Facebook / iMessage",
    "unfurl:X / Twitter": "unfurl:X / iMessage",
}


class Ledger:
    def __init__(self, cfg):
        self.cfg = cfg
        self.md = cfg["ledger"]
        self.json = os.path.splitext(self.md)[0] + ".json"
        self.site = cfg["site"]
        self.own = {h.lower() for h in cfg.get("own") or []}
        self.state = self._load()

    # ------------------------------------------------------------ keys ----

    def norm_host(self, h):
        h = (h or "").strip().lower().rstrip(".")
        if h.startswith("android-app://"):
            h = h[len("android-app://"):].split("/")[0]
        h = h.split(":")[0].rstrip("/")
        if IP_RE.match(h):
            return "(ip literal)"
        if h in APP_PACKAGES:
            return APP_PACKAGES[h]
        if re.match(r"^(com|org|net|io|app)\.[a-z0-9]+\.[a-z0-9.]+$", h) and not h.endswith((".com", ".org", ".net", ".io", ".app")):
            return "app:" + h
        if h.startswith("www."):
            h = h[4:]
        if re.match(r"^google\.(com?\.)?[a-z]{2,3}$", h):
            return "google.com"
        if re.match(r"^bing\.com$|^[a-z]{2}\.bing\.com$", h):
            return "bing.com"
        if re.match(r"^(yandex\.[a-z.]+|ya\.ru)$", h):
            return "yandex.com"
        if h in ("twitter.com", "mobile.twitter.com"):
            return "x.com"
        if h in ("m.youtube.com", "youtu.be"):
            return "youtube.com"
        for _ in range(2):
            label, _, parent = h.partition(".")
            if parent in KNOWN_KIND and (label in FOLD_LABELS or len(label) == 2):
                h = parent
            else:
                break
        return h

    def ga_source_key(self, name):
        s = name.strip().lower()
        if s in SKIP_SOURCES or s.startswith("(") or s.startswith("ga:"):
            return None
        if s in GA_SOURCE_NAMES:
            return GA_SOURCE_NAMES[s]
        if "." in s:
            return self.norm_host(s)
        return "ga:" + s

    def is_internal(self, key):
        return any(key == s or key.endswith("." + s) for s in [self.site] + list(self.cfg.get("aliases") or []))

    def guess_kind(self, key):
        if key.startswith("agent:"):
            return "agent"
        if key.startswith("unfurl:"):
            return "unfurler"
        if key.startswith("app:"):
            return "app"
        if key.startswith("github:"):
            return "directory" if "awesome" in key else "blog"
        if key.startswith("ga:"):
            return "unknown"
        if key in self.own:
            return "own"
        if key in KNOWN_KIND:
            return KNOWN_KIND[key]
        if key == "(ip literal)" or "." not in key or self.is_internal(key) or JUNK_RE.search(key):
            return "junk"
        return "unknown"

    # ----------------------------------------------------------- state ----

    def _load(self):
        state = json.load(open(self.json)) if os.path.exists(self.json) else {"schema": SCHEMA, "last_run": None, "rows": {}}
        if state.get("schema", 1) > SCHEMA:
            sys.exit(f"{self.json} was written by a newer foundby (schema {state['schema']}; this one reads {SCHEMA}). Run `foundby.py update`.")
        state["schema"] = SCHEMA
        for old, new in KEY_RENAMES.items():
            if old in state["rows"]:
                if new in state["rows"]:
                    a, b = state["rows"][new], state["rows"].pop(old)
                    a["hits"] += b["hits"]
                    a["first_seen"] = min(a["first_seen"], b["first_seen"])
                else:
                    state["rows"][new] = state["rows"].pop(old)
        self._read_back_markdown(state)
        return state

    def save(self):
        os.makedirs(os.path.dirname(self.json) or ".", exist_ok=True)
        json.dump(self.state, open(self.json, "w"), indent=1, sort_keys=True)
        self.render()

    def _read_back_markdown(self, state):
        if not os.path.exists(self.md):
            return
        for line in open(self.md):
            if not line.startswith("| `"):
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) < 7:
                continue
            row = state["rows"].get(cells[0].strip("`"))
            if not row:
                continue
            kind, note = cells[1], re.sub(r"\s*<https?://[^>]*>", "", cells[6]).strip()
            if kind in KINDS and kind != row.get("kind"):
                row["kind"] = kind
            if note != (row.get("note") or ""):
                row["note"] = note

    def new_row(self, key, kind, day, via, label=None, note="", pages=None):
        return {"kind": kind, "first_seen": day, "last_seen": day, "hits": 0, "via": [via], "note": note,
                "pages": list(pages or []), "label": label or key, "history": []}

    def observe(self, key, hits, via, since, until, label=None, pages=None):
        rows = self.state["rows"]
        row = rows.get(key)
        if row is None:
            row = rows[key] = self.new_row(key, self.guess_kind(key), since, via, label)
            row["last_seen"] = until
            is_new = True
        else:
            is_new = False
            row["last_seen"] = max(row["last_seen"], until)
        row["hits"] += hits
        if via not in row["via"]:
            row["via"].append(via)
        added = []
        for p in pages or []:
            if p not in row["pages"]:
                row["pages"].append(p)
                added.append(p)
        row["history"] = (row["history"] + [{"since": since, "until": until, "hits": hits, "via": via}])[-24:]
        return is_new, added

    @staticmethod
    def rate_before(row, since):
        prior = [h for h in row["history"] if h["until"] <= since]
        if not prior:
            return None
        first = min(h["since"][:10] for h in prior)
        last = max(h["until"][:10] for h in prior)
        days = max(1, (dt.date.fromisoformat(last) - dt.date.fromisoformat(first)).days)
        return sum(h["hits"] for h in prior) / days

    # ----------------------------------------------------------- merge ----

    def merge(self, outdir, since, until, edge_since=None, edge_until=None, seed=False):
        state = self.state
        new, new_pages, surging, health, mentions_new = [], [], [], {}, []
        days = max(1, (dt.date.fromisoformat(until) - dt.date.fromisoformat(since)).days)
        seen = {}

        def see(key, hits, via, label=None, pages=None, win_since=since):
            if hits <= 0 or not key:
                return
            o = seen.setdefault(key, {"hits": 0, "via": [], "label": label, "pages": [], "since": win_since})
            o["hits"] += hits
            if via not in o["via"]:
                o["via"].append(via)
            o["label"] = o["label"] or label
            for p in pages or []:
                if p not in o["pages"]:
                    o["pages"].append(p)
            o["since"] = min(o["since"], win_since)

        def read(name):
            p = os.path.join(outdir, name)
            return json.load(open(p)) if os.path.exists(p) else None

        edge = read("edge.json")
        if edge and edge.get("available"):
            es = (edge_since or since)[:10]
            health["edge"] = f"{es}..{until} ({edge['coverage']['covered_hours']}h)"
            for r in edge["referrers"]:
                key = self.norm_host(r["name"])
                if key and key not in SKIP_SOURCES:
                    see(key, r["hits"], "edge", win_since=es)
            for r in edge["unfurlers"]:
                see("unfurl:" + r["name"], r["hits"], "edge", r["name"], win_since=es)
            for r in edge["agents"]:
                see("agent:" + r["name"], r["hits"], "edge", f"{r['name']} ({r.get('vendor', '')})", win_since=es)
        elif edge is None:
            health["edge"] = "not run"
        elif edge_since and edge_until and edge_since >= edge_until:
            health["edge"] = "no new complete hour yet"
        else:
            health["edge"] = "unavailable: " + str(edge.get("reason", ""))[:80]

        ga = read("ga.json")
        if ga and ga.get("available"):
            health["ga"] = f"{ga['window']['since']}..{ga['window']['until']}"
            for r in ga.get("sources") or []:
                name, _, channel = r["name"].partition(" · ")
                key = self.ga_source_key(name)
                if key and not self.is_internal(key):
                    see(key, r["hits"], "ga", f"{name} ({channel})")
            pages_by_host = {}
            for r in ga.get("referrer_full") or []:
                u = r["name"]
                if not u.startswith("http"):
                    continue
                p = urllib.parse.urlparse(u)
                if self.is_internal(p.netloc.lower()) or (p.path in ("", "/") and not p.query):
                    continue
                pages_by_host.setdefault(self.norm_host(p.netloc), []).append(u)
            for r in ga.get("in_app") or []:
                name = r["name"].strip().lower()
                if name not in ("none", "(not set)", ""):
                    see("app:" + name, r["hits"], "ga", f"{name} in-app browser")
            for x in ga.get("extra") or []:
                for r in x.get("rows") or []:
                    name = r["name"].strip().lower()
                    if name not in ("none", "(none)", "(not set)", ""):
                        see(x["prefix"] + name, r["hits"], "ga", f"{name} {x.get('label', x['dimension'])}".strip())
            for r in ga.get("referrer_hosts") or []:
                key = self.norm_host(r["name"])
                if key and key not in SKIP_SOURCES and not key.startswith("(") and not self.is_internal(key):
                    see(key, r["hits"], "ga", pages=pages_by_host.get(key))
        elif ga is None:
            health["ga"] = "not run"
        else:
            health["ga"] = "unavailable: " + str(ga.get("reason", ""))[:80]

        mn = read("mentions.json")
        if mn:
            health["mentions"] = " ".join(f"{k}:{v}" for k, v in mn.get("health", {}).items())
            if mn.get("youtube_checked"):
                state["youtube_checked"] = sorted(set(state.get("youtube_checked") or []) | set(mn["youtube_checked"]))
            for r in mn.get("results", []):
                u = r["url"]
                if r["source"] == "github":
                    key, label = "github:" + r.get("repo", urllib.parse.urlparse(u).path.strip("/")), r["title"]
                else:
                    key, label = self.norm_host(urllib.parse.urlparse(u).netloc), None
                row = state["rows"].get(key)
                if row and u in row.get("pages", []):
                    continue
                day = r.get("date") or until
                if row is None:
                    guess = ("directory" if "awesome" in key else "forum" if r["source"] in ("hn", "reddit", "lobsters")
                             else "social" if r["source"] == "bluesky" else "video" if r["source"] == "youtube" else "blog")
                    note = r.get("title", "")[:140] if r["source"] != "github" else ""
                    state["rows"][key] = self.new_row(key, guess, day, "web", label, note, [u])
                    new.append(key)
                else:
                    row["pages"].insert(0, u)
                    if "web" not in row["via"]:
                        row["via"].append("web")
                    mentions_new.append((key, u, r.get("title", ""), day))
        else:
            health["mentions"] = "not run"

        b = read("bing.json")
        if b:
            if b.get("available"):
                health["bing"] = f"{len(b.get('links', []))} inbound links" if b.get("links") else "API returns no links for this site"
                for l in b.get("links") or []:
                    p = urllib.parse.urlparse(l["url"])
                    if p.netloc:
                        see(self.norm_host(p.netloc), 1, "bing", pages=[l["url"]] if p.path not in ("", "/") else None)
            else:
                health["bing"] = "unavailable: " + str(b.get("reason", ""))[:60]

        for key, o in seen.items():
            row = state["rows"].get(key)
            prior = self.rate_before(row, o["since"]) if row else None
            is_new = False
            for via in o["via"]:
                n, added = self.observe(key, o["hits"] if via == o["via"][0] else 0, via, o["since"], until, o["label"], o["pages"])
                is_new = is_new or n
                if not n and added:
                    new_pages.append((key, added))
            if is_new:
                new.append(key)
            elif prior is not None and o["hits"] >= 5 and o["hits"] / days >= 3 * max(prior, 0.34):
                surging.append((key, o["hits"], prior))

        state["last_run"] = edge_until or dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:00:00Z")
        state["last_window"] = {"since": since, "until": until}
        self.save()

        rows = state["rows"]
        report = {
            "site": self.site,
            "window": {"since": since, "until": until, "days": days},
            "health": health,
            "new": [{"key": k, **{f: rows[k][f] for f in ("kind", "hits", "via", "label", "pages")}} for k in new],
            "new_pages": [{"key": k, "pages": p, "kind": rows[k]["kind"]} for k, p in new_pages],
            "surging": [{"key": k, "hits": h, "was_per_day": round(r, 1), "kind": rows[k]["kind"]} for k, h, r in surging],
            "mentions": [{"key": k, "url": u, "title": t, "date": d} for k, u, t, d in mentions_new],
            "totals": {"rows": len(rows), "new": len(new)},
            "seed": seed,
        }
        json.dump(report, open(os.path.join(outdir, "new.json"), "w"), indent=1)
        return report

    # ---------------------------------------------------------- render ----

    def render(self):
        rows = self.state["rows"]
        order = {k: i for i, k in enumerate(ORDER)}
        keys = sorted(rows, key=lambda k: (order.get(rows[k]["kind"], 99), -rows[k]["hits"]))
        edge = self.cfg.get("edge") or {}
        lines = [
            f"# How people find {self.site}",
            "",
            "Every distinct referring host, AI assistant, link-preview platform, native app, GA source",
            "and web mention that has ever brought someone here, with the first date it was seen.",
            "Rendered by foundby (https://foundby.dev) from the JSON next to this file; run `/foundby` to update.",
            "The **kind** and **note** columns can be edited here by hand and are read back on the next run.",
            "",
            f"Last run: {self.state.get('last_run') or 'never'}. Rows: {len(rows)}."
            + (f" Edge logs start {edge['start']}." if edge.get("start") else "")
            + " Hits are cumulative edge hits plus GA sessions and are a magnitude, not a count.",
            "",
            "| key | kind | first seen | last seen | hits | via | note |",
            "|---|---|---|---|---|---|---|",
        ]
        for k in keys:
            r = rows[k]
            note = (r.get("note") or "").replace("|", "/")
            if r.get("pages") and r["kind"] not in ("search", "ai"):
                note = (note + " " if note else "") + " ".join(f"<{p[:120]}>" for p in r["pages"][:3])
            lines.append(f"| `{k}` | {r['kind']} | {r['first_seen'][:10]} | {r['last_seen'][:10]} | {r['hits']} | {','.join(r['via'])} | {note} |")
        open(self.md, "w").write("\n".join(lines) + "\n")

    # ---------------------------------------------------------- window ----

    def window(self, full=False):
        cfg = self.cfg
        now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None, minute=0, second=0, microsecond=0)
        until_edge = now - dt.timedelta(hours=1)
        cap = int(cfg.get("cap_days") or 60)
        capped = False
        edge_start = (cfg.get("edge") or {}).get("start")
        ga_start = (cfg.get("ga") or {}).get("start")
        if full or not self.state.get("last_run"):
            since_edge = dt.datetime.fromisoformat(edge_start) if edge_start else until_edge - dt.timedelta(days=cap)
            if (until_edge - since_edge).days > 400:
                since_edge = until_edge - dt.timedelta(days=400)
            ga_since = ga_start or since_edge.date().isoformat()
        else:
            since_edge = dt.datetime.strptime(self.state["last_run"], "%Y-%m-%dT%H:%M:%SZ")
            if (until_edge - since_edge).days > cap:
                since_edge = until_edge - dt.timedelta(days=cap)
                capped = True
            ga_since = since_edge.date().isoformat()
        return {
            "edge_since": since_edge.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "edge_until": until_edge.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "ga_since": ga_since,
            "ga_until": until_edge.date().isoformat(),
            "since": since_edge.date().isoformat(),
            "until": until_edge.date().isoformat(),
            "capped": capped,
            "last_run": self.state.get("last_run"),
        }


def print_report(rep):
    w = rep["window"]
    if rep.get("seed"):
        print(f"seeded {rep['totals']['rows']} rows for {rep['site']}")
        print("sources: " + " · ".join(f"{k} {v}" for k, v in rep["health"].items()))
        return
    print(f"\nFOUNDBY · {rep['site']} · new since {w['since']} ({w['days']}d window, {rep['totals']['rows']} rows in ledger)\n")
    if not rep["new"] and not rep["new_pages"] and not rep["surging"] and not rep.get("mentions"):
        ran = [k for k, v in rep["health"].items() if v != "not run" and not str(v).startswith("unavailable")]
        if ran:
            print("  Nothing new. Every host, agent and platform in the window was already in the ledger.")
        else:
            print("  No source ran. Run `foundby.py doctor` to see what to wire.")
    by_kind = {}
    for r in rep["new"]:
        by_kind.setdefault(r["kind"], []).append(r)
    for kind in ORDER:
        if kind == "junk":
            continue
        for r in by_kind.get(kind, []):
            pages = ("  " + " ".join(p[:90] for p in r["pages"][:2])) if r["pages"] and kind != "search" else ""
            print(f"  NEW  {kind:<9} {r['key']:<40} {r['hits']:>5}  via {','.join(r['via'])}{pages}")
    junk = by_kind.get("junk", [])
    if junk:
        print(f"  junk ({len(junk)}): " + ", ".join(j["key"] for j in junk[:12]) + (" ..." if len(junk) > 12 else ""))
    for r in rep["new_pages"]:
        if r["kind"] in ("search", "junk", "ai"):
            continue
        for p in r["pages"][:5]:
            print(f"  PAGE {r['kind']:<9} {r['key']:<40}        {p[:110]}")
    for r in rep.get("mentions", []):
        print(f"  MENTION {r['date'] or '      ':<10} {r['key']:<28} {r['title'][:50]:<50} {r['url'][:80]}")
    for r in rep["surging"]:
        print(f"  SURGE {r['kind']:<8} {r['key']:<40} {r['hits']:>5}  was ~{r['was_per_day']}/day")
    print("\n  sources: " + " · ".join(f"{k} {v}" for k, v in rep["health"].items()))
    lookups = sorted((r for r in rep["new"] if r["kind"] in PEOPLE_KINDS),
                     key=lambda r: (r["key"].startswith("github:"), -r["hits"], r["key"]))
    if lookups:
        print(f"\n  to look up ({len(lookups)}): " + ", ".join(r["key"] for r in lookups[:20]))
