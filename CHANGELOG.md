# Changelog

## 1.4.0 (2026-11-24)

- LinkedIn: opens on the Network feed instead of the new For You tab.
  LinkedIn split its home page into For You and Network, which left the
  extension doing nothing there. Network is only your connections and the
  people you follow. The checkbox now reads "Show Network, not the
  “For You” feed"
- LinkedIn: hiding promoted and suggested posts works again, on both tabs
- LinkedIn accounts still on the older single feed keep the Recent sort

## 1.3.0 (2026-11-24)

- A small "Not for You" reminder appears at the top right once a day, the
  first time the extension switches a feed, so it is clear why a site looks
  different. Clicking it opens the popup. A new setting at the bottom of the
  popup makes it weekly or monthly, or turns it off, and so does the bell on
  the reminder itself
- On notforyou.app in Chrome, the install button reads "Installed" and opens
  the popup when the extension is already there, and so does the Extensions
  button on the welcome page
- TikTok: language-specific home pages (tiktok.com/en/, /de-DE/ and the
  rest) now go to Following too. They showed the For You feed before
  ([#5](https://github.com/preziotte/not-for-you/issues/5))

## 1.2.0 (2026-11-11)

- Reddit: keeps the home page on Following instead of the new Discover feed.
  Hiding promoted posts and ads is now its own checkbox, still on by default
  (if you had turned Reddit off to keep its ads, turn that checkbox off)

## 1.1.0 (2026-08-28)

- The temporary disable now offers 5m, 30m, 1h and 24h instead of a fixed
  five minutes, with a re-enable button while it runs
- While paused, the popup fades and locks the platform list so the state is
  obvious at a glance
- Quieter popup footer: a soft segmented control instead of outlined buttons,
  and plain text links

## 1.0.1 (2026-08-14)

- Opens [notforyou.app/welcome](https://notforyou.app/welcome) once on a
  fresh install, so there is some confirmation the extension is working
- Asks why on the way out: uninstalling opens
  [notforyou.app/goodbye](https://notforyou.app/goodbye)

## 1.0.0 (2026-08-07)

Initial release. Live on the
[Chrome Web Store](https://chromewebstore.google.com/detail/not-for-you/pakdneaipkfgaahgbafblmdebfoadjca)
and [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/notforyou/).

- YouTube: Subscriptions instead of Home, turn off autoplay, hide the Shorts
  row, hide "what to watch next"
- Instagram: Following instead of Home, hide the suggestions sidebar
- TikTok: Following instead of For You, hide the header bar
- X/Twitter: Following instead of For You, hide trends and suggestions
- Reddit: hide promoted posts and ads, hide recommendations, optional
  old Reddit redirect
- LinkedIn: Recent instead of Top, hide promoted and suggested posts, hide
  the news sidebar
- Threads: Following instead of For You
- Facebook: the Feeds view instead of Home, hide the Reels tab
- Temporary disable button in the popup
