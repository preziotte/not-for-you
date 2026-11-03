# Roadmap: sources not yet read

Candidates for new sources, ranked by how much unlinked or unclicked coverage each one
finds, then by how many people it lets use foundby at all. Nothing here is promised on
foundby.dev; the landing page and `llms.txt` list shipped sources only. Each entry notes
what was checked (probed 2026-10-31 from a plain `curl`, no key) so the next person does
not repeat it. Keep every new source to the rules in `CLAUDE.md`: standard library,
degrades alone, counts only.

## Ledger change first

- **Record which mention source found a row.** Every mention currently lands as `via web`.
  `mentions.json` already carries `source`, so write `via hn`, `via github`, `via youtube`,
  `via bluesky`, `via lobsters`, `via reddit`, and keep `web` for pages the agent records
  by hand with `foundby.py mention`. One change in `ledger.py` merge. Then regroup the table
  at the top of `docs/sources.md` by how a row is obtained: clicked (edge, GA), linked
  (Bing), talked about (one row per mention source). `mentions.py` stays one file.

## Mention sources

1. **Reddit, OAuth script app.** The biggest gap. The browser-saved `search.json` step is
   manual and nobody repeats it. A script app is free; client-credentials, then search
   `url:<domain>` and the quoted domain. Probed: `/domain/<site>/.rss` returns 200 with an
   Atom body and zero entries (unclear if real), `search.rss` is 429.
2. **Google Alerts as RSS.** Create the alert for `"<domain>"` once, deliver as RSS, put the
   feed URL in `foundby.json`. Broadest blog and news coverage with no key. Talkwalker Alerts
   has the same shape.
3. **GitHub issues and discussions.** `gh api search/issues` with the quoted domain, same
   auth as code search. Finds recommendations inside other people's threads. The owner's own
   awesome-list PRs show up, so `skip_github_owners` must apply here too. Probed: works.
4. **Wikipedia external link usage.** `action=query&list=exturlusage&euquery=<domain>` per
   language wiki, no key. A citation is a one-row event worth noticing. Probed: works, empty.
5. **Stack Exchange.** `search/excerpts?q=<domain>&site=stackoverflow`, no key, 300 requests
   per day. Matters for developer tools more than consumer sites. Probed: works, empty.
6. **Mastodon.** Sibling of Bluesky. Status search needs an app token on most instances; any
   free account provides one. Probed: anonymous `api/v2/search` returns 200 and empty.
7. **Webmention endpoint** (webmention.io). One link tag on the site, then poll. Low volume,
   but it is mentions sent to you.

## Click and surface sources

8. **Search Console surfaces.** Not backlinks (the API has none). `searchType` Discover and
   News, and search appearance, as rows like `google:discover`. Same service account as GA.
   Do not import queries; a query ledger is a different product.
9. **GitHub repo referrers** for open-source projects: `repos/<owner>/<repo>/traffic/popular/
   referrers`, 14-day window, owner only. The edge log equivalent for a repo.

## Adoption, not new sources

- **Combined-format log reader** (nginx, Apache, Caddy) as an `edge.kind`. Most users do
  not have CloudFront.
- **Plausible or Fathom** as a GA alternative. The indie audience that installs a skill
  often does not run GA4.

## Considered and left out

- Podcast Index, Listen Notes: keys, niche.
- Threads, Product Hunt: app approval for little coverage.
- Common Crawl backlinks: the host graph is gigabytes, not a stdlib script.
- DuckDuckGo HTML search: returns a challenge page (202).
- Bing News RSS: works, but returned nothing for a site with real coverage.
- "Does ChatGPT recommend us" prompt panels: a monitoring loop over prompts, not a ledger
  of arrivals. The edge log already catches the live-fetch agents.
