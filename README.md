# Not for You

A browser extension that removes the algorithm from every major social platform.
No suggested posts, no recommended accounts, no "people you may know." Just the
accounts you chose to follow, in the order they posted.

[notforyou.app](https://notforyou.app)

<img
  src="site/public/og-dark.png"
  alt="Not for You. A browser extension that removes the algorithm from every major social platform. The extension popup sits alongside: a checkbox per option, grouped by platform."
/>

## What it changes

Every option below is a checkbox in the popup, on by default (except where
noted), and can be turned off per platform.

| Platform  | Feed                                    | Extra options                                                     |
| --------- | --------------------------------------- | ----------------------------------------------------------------- |
| YouTube   | Subscriptions instead of the Home feed  | turn off autoplay, hide the Shorts row, hide "what to watch next" |
| Instagram | Following instead of the Home feed      | hide the suggestions sidebar                                      |
| TikTok    | Following instead of the "For You" feed | hide the header bar                                               |
| X/Twitter | Following instead of the "For You" feed | hide trends and suggestions                                       |
| Reddit    | left alone, it is already followed-only | hide promoted posts and ads, hide recommendations, use old Reddit (off by default) |
| LinkedIn  | Recent instead of the Top sort          | hide promoted and suggested posts, hide the news sidebar          |
| Threads   | Following instead of the "For You" feed |                                                                   |
| Facebook  | The Feeds view instead of Home          | hide the Reels tab                                                |

Nothing else changes. Search, profiles, messages and posting all work exactly as
before, and a button in the popup turns the whole thing off for a few minutes
when you want the algorithm back.

## Install

[Firefox Add-ons](https://addons.mozilla.org/firefox/addon/notforyou/)

The Chrome Web Store listing is still in review. Until it is live, Chrome and
the other Chromium browsers (Edge, Brave, Opera, Arc) run it from source:

```sh
npm install
npm run build
```

Then open `chrome://extensions`, turn on Developer mode, choose "Load unpacked"
and pick `.output/chrome-mv3`.

For a Firefox build of your own, `npm run build:firefox` and load
`.output/firefox-mv3` as a temporary add-on from `about:debugging`.

## How it works

Two mechanisms, and the first is always preferred:

1. **URL redirect.** Where a platform has a real chronological route, the
   extension sends you there with a `declarativeNetRequest` rule: YouTube to
   `/feed/subscriptions`, Instagram to `?variant=following`, Threads and TikTok
   to `/following`, Facebook to its `Feeds` view, and Reddit to `old.reddit.com`
   if you ask for it. Durable, and it degrades gracefully.
2. **DOM work.** Only where no such route exists (X keeps snapping back to "For
   You"; LinkedIn buries its Recent sort in a dropdown) or to hide the leftover
   recommendation blocks that no URL avoids. This part is matched against the
   platforms' current markup and will break when they change it.

Redirects that a single-page app performs internally never hit the network, so
`lib/spa.ts` catches those in the content script as a fallback.

## Possible additions

Platforms worth supporting, roughly in the order they make sense to build.

| Platform  | Why                                                                                 |
| --------- | ----------------------------------------------------------------------------------- |
| Twitch    | Home is pure recommendations, and `/directory/following/live` is a clean redirect.   |
| Bluesky   | The closest fit to the premise, but Following is client state, so DOM work like X.   |
| Substack  | The Notes home feed is algorithmic; `/inbox` is just what you subscribed to.         |
| Pinterest | The most algorithmic feed of the lot. Its Following view keeps coming and going.     |
| Medium    | `/following` is chronological, the home feed is not.                                 |
| Tumblr    | The dashboard grew a "For you" tab. Unclear whether Following is URL-addressable.    |
| GitHub    | The dashboard feed has For you and Following tabs. Small audience, tiny fix.         |

## Privacy

No accounts, no servers, no analytics, and the extension makes no network
requests of its own. The only thing stored is which platforms are enabled and
their options, in the browser's own extension storage. Full policy:
[notforyou.app/privacy.html](https://notforyou.app/privacy.html).

## Development

Built with [WXT](https://wxt.dev) and TypeScript, Manifest V3 on every browser.

```sh
npm run dev         # load into Chrome with hot reload
npm run dev:firefox # the same in Firefox
npm run compile     # typecheck
npm run zip         # package for the Chrome Web Store
npm run zip:firefox # package for Firefox Add-ons
```

| Path               | What lives there                                                    |
| ------------------ | ------------------------------------------------------------------- |
| `lib/platforms.ts` | Every platform: labels, match patterns, redirect rules. Start here. |
| `entrypoints/`     | The background script, one content script per platform, the popup.  |
| `lib/settings.ts`  | Stored settings and the temporary-disable timer.                    |
| `site/public/`     | The landing page and privacy policy, deployed to notforyou.app.     |
| `site/main.tf`     | Terraform for the site's S3 and CloudFront setup.                   |

`lib/platforms.ts` is the single source of truth: content scripts take their
match patterns from it via `matchesFor()`, and `wxt.config.ts` builds
`host_permissions` from the same list, so the two cannot drift apart.

The social card at `site/public/og.png` is generated from `site/og-image.html`.
Regenerating it after an edit is a headless screenshot; the command is in a
comment at the top of that file.

## Contributing

Platforms change their markup constantly, so the most useful thing you can file
is a broken selector: which platform, which option, and what you see instead.
[Open an issue](https://github.com/preziotte/not-for-you/issues).

## License

MIT. See [LICENSE](LICENSE).
