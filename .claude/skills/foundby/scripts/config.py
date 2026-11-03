"""foundby.json: where the site is, what it owns, and which sources are wired.

The file is looked up from the current directory upward, so the skill works from
anywhere inside the repo. Every source is optional; a missing block means that
source is skipped and the report says so. Paths starting with ~ are expanded, and
paths are resolved relative to the config file's directory.

    {
      "site": "example.com",
      "aliases": ["clips.example.com"],
      "own": ["my-other-site.com"],
      "ledger": "docs/foundby.md",
      "cap_days": 60,
      "check_updates": true,
      "ga": {"property": "123456789", "key_file": "~/.config/gcloud/ga-key.json",
             "start": "2025-01-01", "custom_dimensions": true,
             "extra_dimensions": [{"dimension": "host_app", "prefix": "app:host=", "label": "?host= embed"}]},
      "edge": {"kind": "cloudfront", "bucket": "logs.example.com",
               "prefix": "cloudfront/apex/", "start": "2026-08-14", "profile": null},
      "bing": {"key_file": "~/.config/bing-webmaster-key.txt", "site_url": "https://example.com/"},
      "mentions": {"queries": ["example.com", "example com"], "youtube": true,
                   "youtube_langs": ["en-US,en", "es-419,es"], "skip_github_owners": ["me"],
                   "reddit_json": null}
    }
"""

import json
import os
import sys

FILENAME = "foundby.json"

DEFAULTS = {
    "aliases": [],
    "own": [],
    "ledger": "docs/foundby.md",
    "cap_days": 60,
    "check_updates": True,  # `foundby.py update --check` fetches VERSION from GitHub; false skips it
    "ga": None,
    "edge": None,
    "bing": None,
    "mentions": {},
}
MENTION_DEFAULTS = {
    "queries": None,  # defaults to [site, site with the dot replaced by a space]
    "youtube": True,
    "youtube_langs": ["en-US,en", "es-419,es", "pt-BR,pt", "de-DE,de", "fr-FR,fr", "ja-JP,ja"],
    "skip_github_owners": [],
    "reddit_json": None,
    "hn": True,
    "github": True,
    "bluesky": True,
    "lobsters": True,
    "reddit": True,
}
GA_DEFAULTS = {"key_file": "~/.config/gcloud/ga-mcp-key.json", "start": "2025-01-01", "custom_dimensions": False}
EDGE_DEFAULTS = {"kind": "cloudfront", "prefix": "", "profile": None, "start": None}
BING_DEFAULTS = {"key_file": "~/.config/bing-webmaster-key.txt"}


def find(start=None):
    """Path of the nearest foundby.json at or above `start`, or None."""
    d = os.path.abspath(start or os.getcwd())
    while True:
        p = os.path.join(d, FILENAME)
        if os.path.exists(p):
            return p
        parent = os.path.dirname(d)
        if parent == d:
            return None
        d = parent


def _expand(path, base):
    if not path:
        return path
    path = os.path.expanduser(path)
    return path if os.path.isabs(path) else os.path.normpath(os.path.join(base, path))


class Config(dict):
    path = None
    root = None

    def __getattr__(self, k):
        try:
            return self[k]
        except KeyError:
            raise AttributeError(k) from None


def load(path=None, required=True):
    path = path or os.environ.get("FOUNDBY_CONFIG") or find()
    if not path:
        if required:
            sys.exit(f"no {FILENAME} found here or in any parent directory; run `foundby.py init <site>` first")
        return None
    raw = json.load(open(path))
    cfg = Config({**DEFAULTS, **raw})
    cfg.path = os.path.abspath(path)
    cfg.root = os.path.dirname(cfg.path)
    if not cfg.get("site"):
        sys.exit(f"{path}: \"site\" is required (the bare host, e.g. example.com)")
    cfg["site"] = cfg["site"].lower().removeprefix("https://").removeprefix("http://").strip("/")
    cfg["ledger"] = _expand(cfg["ledger"], cfg.root)
    m = {**MENTION_DEFAULTS, **(raw.get("mentions") or {})}
    if not m["queries"]:
        site = cfg["site"]
        m["queries"] = [site] + ([site.replace(".", " ", 1)] if site.count(".") == 1 else [])
    if m["reddit_json"]:
        m["reddit_json"] = _expand(m["reddit_json"], cfg.root)
    cfg["mentions"] = m
    if raw.get("ga"):
        g = {**GA_DEFAULTS, **raw["ga"]}
        g["key_file"] = _expand(g["key_file"], cfg.root)
        g["property"] = str(g.get("property", "")).removeprefix("properties/")
        cfg["ga"] = g
    if raw.get("edge"):
        cfg["edge"] = {**EDGE_DEFAULTS, **raw["edge"]}
    if raw.get("bing"):
        b = {**BING_DEFAULTS, **raw["bing"]}
        b["key_file"] = _expand(b["key_file"], cfg.root)
        b.setdefault("site_url", f"https://{cfg['site']}/")
        cfg["bing"] = b
    return cfg


def internal_hosts(cfg):
    """Hosts that count as the site itself (never a referrer)."""
    return [cfg["site"]] + list(cfg.get("aliases") or [])


def is_internal(host, cfg):
    h = (host or "").lower()
    return any(h == s or h.endswith("." + s) for s in internal_hosts(cfg))
