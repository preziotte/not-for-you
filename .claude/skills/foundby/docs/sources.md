# Sources: what each one sees, what it costs, how to wire it

foundby reads up to four kinds of source. Each is optional and degrades alone. The union
is the best available picture; none of them sees everything, and the blind spots below are
structural, not bugs.

| Source | Sees | Blind to | Needs |
|---|---|---|---|
| Mention search | pages that talk about the site, clicked or not | X, Instagram, TikTok, most of Reddit | nothing (GitHub: `gh auth login`) |
| GA4 | utm and gclid sources, the AI Assistant channel, in-app browsers, referring *pages* (with custom dimensions) | anything without JS: agents, unfurlers, ad-blocked visitors | a service account on the property |
| Edge logs | every request: referrers without JS, link unfurlers, AI live-fetch agents | nothing that reaches the CDN, but nothing that does not (native apps, email clients, Discord desktop send no Referer) | CloudFront standard logs in S3, aws CLI |
| Bing backlinks | pages Bing knows link to you | most backlinks (often empty) | Bing Webmaster API key |

## Mention search

Pages found by searching, not by a click. This is the only way unlinked coverage (a
YouTube description, a newsletter issue, a Reddit comment) ever reaches the ledger.

- **Hacker News**: Algolia's public API. Stories and comments whose text contains the
  domain. No key.
- **GitHub code search**: `gh api search/code` for the quoted domain. Finds awesome lists,
  READMEs, and projects that cite the site; it is where awesome-list listings show up
  first. Needs `gh auth login`. One row per repo, README preferred; mirrors of awesome
  lists and domain dumps are dropped (`GITHUB_SKIP` in `mentions.py`). Put your own GitHub
  user in `mentions.skip_github_owners`.
- **Bluesky**: public `searchPosts`, no key. (`public.api.bsky.app` 403s on search; the
  script uses `api.bsky.app`.)
- **Lobsters**: the per-domain story feed. It 404s until the first story links the
  domain, which the script reports as 0, not a failure. Comments are not covered.
- **Reddit**: anonymous `search.json` is 403 for nearly every client. Two ways in: an OAuth
  app (not implemented; `mentions.py` is the place), or save the search from a logged-in
  browser and point `mentions.reddit_json` at the file:
  `https://www.reddit.com/search.json?q=%22<site>%22&sort=new&limit=100`. Browser-automation
  extensions usually block reddit.com, so this is a manual step when you want it.
- **YouTube**: the Data API cannot search descriptions, so the results page is scraped for
  each query in `mentions.queries` (videos-only filter; without it channels and shelves
  crowd out real hits) plus the bare domain per locale in `mentions.youtube_langs` (YouTube
  surfaces non-English tutorials only in the viewer's language), three pages each via the
  innertube continuation, then each candidate's watch page is read to confirm the
  description names the site. Every video id read is kept in the ledger JSON
  (`youtube_checked`) and skipped on later runs, so the first run takes two to three
  minutes and later ones seconds; a description edited after it was checked is missed.
  Results are fuzzy run to run, so the ledger is the record. `"youtube": false` to turn
  it off.
- **Not covered**: X (paid API only), Instagram (Graph API searches hashtags only), TikTok
  (Research API is academic-only). Brave Search's API has no free tier any more. GA's
  `in_app_browser` dimension is the only trace of TikTok and Instagram traffic.
  Sources that could be added, with what has been checked, are in `docs/roadmap.md`.

`mentions.queries` defaults to the domain plus the domain with its dot replaced by a space
(`vizz.fm`, `vizz fm`). Add the product name if it differs from the domain, and the
`@handle` if you have a YouTube channel; the match is case-insensitive and treats `.`,
space, `_` and `-` between the parts as the same.

## GA4

Adds what the edge cannot see: utm and gclid tagged sources, GA's AI Assistant channel
grouping for assistants that send no Referer, and the in-app browsers that send none
either.

**Wire it.** Create a Google Cloud service account, download its JSON key, and add its
email as a Viewer on the GA4 property (Admin, Property access management). Put the
numeric property id and the key path under `ga` in `foundby.json`:

```json
"ga": {"property": "123456789", "key_file": "~/.config/gcloud/ga-key.json", "start": "2025-01-01"}
```

`start` is how far back `--full` reads when seeding. The script signs its own JWT with
the `cryptography` package (`pip install cryptography`); no gcloud, no OAuth.

**Custom dimensions (optional, high value).** Standard GA strips the path from referrers
and does not record webviews. Three event-scoped custom dimensions fix that, and `doctor`
checks for them. Register them in GA4 Admin (Custom definitions, event scope) as
`referrer_host`, `referrer_full`, `in_app_browser`, then set them on every hit before
the gtag config call. The snippet, which runs before gtag loads:

```html
<script>
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function(){ dataLayer.push(arguments); };
(function () {
  var ref = document.referrer || '', host = '';
  try { host = ref ? new URL(ref).hostname : ''; } catch (e) {}
  var ua = navigator.userAgent || '', inApp = 'none';
  var apps = [[/TikTok|BytedanceWebview|musical_ly/i,'tiktok'],[/Instagram/i,'instagram'],
    [/FBAN|FBAV|FB_IAB/i,'facebook'],[/MicroMessenger/i,'wechat'],[/Snapchat/i,'snapchat'],
    [/Twitter/i,'twitter'],[/LinkedInApp/i,'linkedin'],[/Pinterest/i,'pinterest'],
    [/Reddit/i,'reddit'],[/Line\//i,'line'],[/GSA\//i,'google_app']];
  for (var i = 0; i < apps.length; i++) if (apps[i][0].test(ua)) { inApp = apps[i][1]; break; }
  if (inApp === 'none') {
    if (/; wv\)/.test(ua)) inApp = 'android_webview';
    else if (/iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)) inApp = 'ios_webview';
  }
  // config(), not set(): set() values do not reach the collect call.
  gtag('config', 'G-XXXXXXX', {
    referrer_host: host || '(direct)',
    referrer_full: ref || '(direct)',
    in_app_browser: inApp
  });
})();
</script>
```

Then `"custom_dimensions": true` under `ga`. `referrer_full` is `document.referrer`
verbatim: cross-origin it is usually origin-only, but a linking site with a permissive
referrer policy leaks the path, and that path is the only place a referring *page* ever
shows up in any source. Dimensions take about a day to start populating.

**Facts.** GA runs on calendar days from the last run's date, so the boundary day is
counted twice; hits are a magnitude. GA sources are session-scoped and already
deduplicated by GA, but they overlap with edge referrers for the same visit.

## Edge logs

CDN logs see every request: referrers that need no JS, the link unfurlers that fire when
someone pastes the URL into Slack, Discord, iMessage or WhatsApp (each hit is a private
share nothing else records), and AI live-fetch agents (ChatGPT-User, Claude-User,
Perplexity-User: a person asked an assistant about the site right then).

**Wire it (CloudFront).** Turn on standard logging to an S3 bucket (logging v2 with
user-selected fields is fine; the header line is parsed). Then:

```json
"edge": {"kind": "cloudfront", "bucket": "logs.example.com",
         "prefix": "AWSLogs/123456789012/CloudFront/cloudfront/apex/",
         "start": "2026-08-14", "profile": null}
```

`prefix` is the full key prefix inside the bucket, everything before the `yyyy/MM/dd` folders.
Legacy logging writes at the prefix you configured; standard logging v2 nests it under
`AWSLogs/<account-id>/CloudFront/`, so the value is usually
`AWSLogs/123456789012/CloudFront/cloudfront/apex/`. `aws s3 ls s3://logs.example.com/` shows
which; `doctor` lists the bucket root when the prefix finds nothing. `start` is the day logging began; `--full`
seeds from it and the ledger header shows it. The aws CLI must be able to list the
bucket; set `profile` if it is not the default. Files are synced per day into a temp dir
and deleted after the run. Client IPs are never read.

**Facts.** Native apps, email clients, Discord desktop and most AI assistants arrive with
no Referer at all; GA's utm tags and AI Assistant channel cover part of that. Logs are
delivered with a delay of minutes to an hour, so each run ends at the last complete UTC
hour and `no new complete hour yet` means the run came too soon after the last one.
Other CDNs and nginx/Apache logs are not read yet; `agenttraffic` (agenttraffic.io) reads
them and is the natural adapter.

## Bing backlinks

Bing Webmaster Tools has the only free backlink API (Search Console has none). It is
empty for many sites, so the run keeps trying and rows arrive `via bing` if it ever
populates. Get an API key in Bing Webmaster Tools settings, add the site under the same
account, and:

```json
"bing": {"key_file": "~/.config/bing-webmaster-key.txt", "site_url": "https://example.com/"}
```

`site_url` is the URL-prefix property with its trailing slash.

## Reading hits

Hits are cumulative edge hits plus GA sessions and overlap, so they are a magnitude, not a
count. Never present a hits column as sessions or visitors. First-seen for rows seeded by
`--full` is the start of the configured history, not the true first visit.
