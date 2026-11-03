---
name: foundby
description: Keep a cumulative ledger of every distinct way people find a website (referring hosts, AI assistants, link-unfurl platforms, in-app browsers, GA sources, backlinks and web mentions) in the repo, and report only what is new since the last run. Use when the user asks how people are finding the site, who is linking to or writing about it, wants the ledger updated, says /foundby, or wants foundby set up for a site. `/foundby open` only opens the ledger viewer. `/foundby setup` wires a new site.
---

# /foundby: how people find this site

Answers two questions analytics dashboards cannot: **what new path brought someone here
since I last looked**, and **who is writing about or linking to the site**. It remembers.
Every host, agent and platform ever seen lives in the ledger (default `docs/foundby.md` plus
a `.json` next to it) with its first-seen date, a kind, and a note saying what it actually
is, so a junk host surfaces once and never again, and a real blog post gets looked at once
and recorded.

There is no interval. The ledger stores `last_run`; each run covers exactly the gap since
then (capped at `cap_days`, 60 by default, and said so when capped).

All commands are `python3 <skill dir>/scripts/foundby.py ...`. The skill dir is the
directory holding this file. Config is `foundby.json`, found upward from the working
directory. Use the scratchpad directory from the environment for `<outdir>`; never a
path inside the user's repo.

## Arguments

- none: refresh the ledger (Run it).
- `open`: skip the refresh and only open the viewer (`foundby.py view`). Reply with one line.
- `setup [site]`: first-time wiring for a site (Set it up). Also do this when `run` says no
  `foundby.json` was found.
- `--full`: rebuild the ledger from the start of the configured sources. Rare.
- `update`: update the skill to the latest version (Keep it current) without a run.

## Set it up

The goal is a `foundby.json` that reads every source the user can reasonably wire, and a
clear statement of what each unwired source would add for *this* site. Keep it short; the
user can always run `/foundby setup` again.

0. If this skill dir is a fresh clone sitting inside the user's repo (it has its own
   `.git` and the repo root is above it), delete that `.git` so the skill is committed as
   plain files like any other skill; `foundby.py update` handles both this and a real
   clone. Leave it alone when the skill dir is a symlink or lives outside the repo.
1. If there is no `foundby.json`, work out the site: the repo's config (`SITE_ORIGIN`,
   `metadataBase`, `package.json` homepage, a CNAME file) or ask. Ask one question before
   writing it: run the YouTube description search? Say what it is in a sentence (YouTube
   has no description API, so results pages are scraped with the domain in the query and
   each candidate video page is read; a few minutes on the first run, seconds after). Then
   `foundby.py init <site>` in the repo root, with `--no-youtube` if they said no. Add
   `--ga <property id>` and `--bucket <logs bucket> --prefix <prefix> --edge-start YYYY-MM-DD`
   if you can find them in the repo (Terraform, deploy scripts, analytics config); `--bing`
   if a Bing key file exists. The other mention searches (HN, GitHub, Bluesky, Lobsters)
   are single API requests and stay on; mention once that each is a key under `mentions`
   in `foundby.json` and `false` turns it off.
2. `foundby.py doctor`. It checks each source's credential, reaches the GA property if there
   is one, prints the 90-day channel mix, and ends with a numbered list of recommendations
   specific to this property (for example: Direct is 40% of sessions and there are no edge
   logs, so unfurlers are invisible; YouTube already sends sessions, so turn on the video
   description search; the GA custom dimensions that reveal referring *pages* are missing).
3. Walk the recommendations with the user, highest value first. For each one, the exact
   setup is in `docs/sources.md` in this skill dir; read the relevant section and give the
   user the steps, not a link. Every source is optional; a site with only a domain still
   gets the mention search (HN, GitHub, Bluesky, Lobsters, YouTube).
4. Set `aliases` (other hosts that are the site itself, like `clips.<site>`) and `own`
   (the user's other sites, so they are classified `own` rather than looked up).
5. First run: `foundby.py run <outdir> --full` seeds the ledger from the configured history
   without the mention search, then `foundby.py run <outdir>` does the first incremental
   run with mentions. Then do the lookup step below for the people-shaped rows: this is the
   run where the ledger gets its notes. Budget it: on a site with a year of GA history the
   first lookup pass can be 30 to 50 rows, so do the people-shaped ones and leave `unknown`
   rows with no hits in the last 60 days for later.
6. Add a line to the repo's CLAUDE.md pointing at the ledger and `/foundby`, and commit the
   ledger files if the user commits.

## Keep it current

Before every run (not for `open`):

```bash
python3 <skill dir>/scripts/foundby.py update --check
```

One GET for the `VERSION` file on GitHub; nothing about the user or the ledger is sent,
and `"check_updates": false` in `foundby.json` turns it off. If it says a newer version is
available, tell the user in one line and ask whether to update first. On yes,
`foundby.py update` (a `git pull` when the skill dir is a clone, otherwise the GitHub
tarball unpacked over the skill files only; `foundby.json` and the ledger are never
touched), then continue with the run. If it says it could not reach GitHub, or is up to
date, say nothing and carry on.

## Run it

```bash
python3 <skill dir>/scripts/foundby.py run <outdir>
```

Before launching it, tell the user in one line what is about to happen, naming the
sources this site has wired: "Pulling CloudFront logs and GA since Oct 22, then searching
HN, GitHub, Bluesky and YouTube for mentions." Give the command a specific description too
(what it pulls, not "running foundby"). Nothing is shown while it runs, so that line is
the only progress indicator. The first run on a site, and `setup`, take a few minutes
because every YouTube candidate is read once; say so. Later runs take well under a
minute.

One command: computes the window, pulls edge logs (if configured), GA distinct sources and
custom dimensions (if configured), searches for mentions (HN, Reddit, GitHub code, Bluesky,
Lobsters, YouTube descriptions), tries Bing inbound links (if configured), folds everything
into the ledger, rewrites the markdown, and prints the report. Sources degrade
independently; the report's `sources:` line says which ran.

## Then do the lookup step

The report ends with `to look up (N): host, host, ...`. These are new rows whose kind is
unknown or people-shaped (blog, forum, video, directory, newsletter, docs, award).
`github:` rows usually need no fetch: the repo name and path say what they are, so write
the note from the report line. For the rest, in parallel, up to about 15 per run:

1. `WebFetch` the host root: what is the site, what language, does the home page mention us.
2. If that is inconclusive and the row looks like a real place, `WebSearch`
   `site:<host> <site>` (or `"<site>" <host>`) to find the page that links us.
3. Record them all in one command, not one per row, so the user approves once:
   ```bash
   python3 <skill dir>/scripts/foundby.py set --stdin <<'EOF'
   {"key": "annika.dev", "kind": "blog", "note": "Personal blog, links from an inner page"}
   {"key": "parked-thing.xyz", "kind": "junk", "note": "parked domain"}
   {"url": "https://example.org/post", "kind": "blog", "note": "Tutorial that credits us", "date": "2026-10-20"}
   EOF
   ```
   A line with `key` classifies an existing row; a line with `url` records a mention
   (same as `foundby.py mention`). The single-row form is
   `foundby.py set <key> --kind <kind> --note "<one line>"`.
   Kinds: search ai social forum video blog directory award newsletter docs own app unfurler
   agent tool monitor junk unknown. Leave `unknown` with a note when the fetch fails (403,
   404, parked) so it is not retried every run.

Also, once per run, do one brand-mention search, `"<site>" -site:<site>` in extended mode,
and record any page the ledger does not already hold (grep the markdown for the URL first)
as a `url` line in the same `set --stdin` batch, or on its own:

```bash
python3 <skill dir>/scripts/foundby.py mention <url> --kind <kind> --note "<one line>" [--date YYYY-MM-DD]
```

A mention is a page found by search rather than by a click, so it attaches to the host row
with `via web` and shows in the note as a URL. It is the only way unlinked coverage (a
YouTube description, a newsletter issue, a Reddit comment) ever reaches the ledger.

When a lookup reveals a host that should fold into a known one, or belongs in a known list
(a new search engine, AI assistant, or directory), add it to the tables at the top of
`scripts/ledger.py` so every user's next run classifies it without a lookup. That table is
the shared part of the product; the notes are the user's.

## Present it

Paste the report block byte-for-byte in a fence (it is column-aligned; no markdown tables,
no emoji in the fence). Then two or three sentences: lead with the people-shaped new rows
and what the lookups found (a thread to reply in, a site to thank, a directory that listed
us), then mention any surge worth knowing about. When the report says nothing is new, say
so in one line. Do not restate totals or source health; the block already has them.

## Browse it

```bash
python3 <skill dir>/scripts/foundby.py view
```

Inlines the current ledger into a single HTML page and opens it: filter box, kind chips
(click to toggle, shift-click to solo), sortable columns, page links, rows first seen in
the last 14 days marked. Search and junk are hidden by default.

## Reading the report

- **NEW** rows are keys the ledger had never seen, grouped people-first (blog, newsletter,
  forum, video, award, directory, docs, social, unknown) then search, AI, agents, apps,
  unfurlers, tools. Junk is collapsed to a count. One hit is meaningful here; it is where a
  new path starts.
- **PAGE** rows are a new *page* on a known host, from GA's `referrer_full` dimension.
  Cross-origin referrers are origin-only by default, so a path only arrives when the linking
  site sets a permissive referrer policy. When it does, it names the exact post or thread.
  Not shown for search, AI or junk hosts.
- **MENTION** rows are pages found by search on a host the ledger already had. A
  `github:<owner/repo>` row is one repository, deduped to its README when it has one.
- **app:** rows come from GA's `in_app_browser` dimension (TikTok, Instagram and other
  webviews send no Referer, so this is the only trace of that traffic).
- **unfurl:** rows are link-preview fetches, each one a person pasting the link somewhere
  private (Slack, Discord, iMessage, WhatsApp). Only edge logs see them.
- **agent:** rows are AI live-fetch agents (ChatGPT-User, Claude-User, Perplexity-User): a
  person asked an assistant about the site right then. Only edge logs see them.
- **SURGE** is a known row at 3x or more its lifetime daily rate with at least 5 hits in the
  window. Short windows make this noisy; a 1-day window surging on a search engine is weather.
- **sources** says what ran. `edge ... (Nh)` is covered hours. `no new complete hour yet`
  means the run came too soon after the last one for edge logs; GA still ran.

## Keys and folding

A row key is a folded host (`www.` stripped, `google.<cctld>` and `xx.bing.com` into their
family, `m.`/`old.`/`out.`/`noai.`/two-letter locale labels folded into a known parent, IP
literals collapsed to `(ip literal)`), or a prefixed key: `agent:<name>`, `unfurl:<platform>`,
`app:<package or webview>`, `github:<owner/repo>`, `ga:<source>` for a GA source that is not
a host (utm names). Folding and the known-host tables live at the top of `scripts/ledger.py`.

## Hand edits

The markdown ledger is rendered from the JSON, but the **kind** and **note** columns are
read back from the markdown before every write. Fixing a classification in either file
sticks. Everything else in the markdown is overwritten.

## Measurement facts

What each source can and cannot see, and the known failure modes, are in `docs/sources.md`.
The ones that change how you read a report: hits are cumulative edge hits plus GA sessions
and overlap, so present them as a magnitude, never as sessions; GA runs on calendar days
from the last run's date, so the boundary day is counted twice; first-seen for seeded rows
is the start of the configured history, not the true first visit.
