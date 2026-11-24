import { defineContentScript } from '#imports';
import { matchesFor } from '../lib/platforms';
import { notify } from '../lib/notice';
import { enforceOnMutations } from '../lib/observe';
import { getEffective, watchSettings } from '../lib/settings';
import { watchSpaNavigation } from '../lib/spa';

/**
 * - `enabled`: keep the home page on Following rather than Discover. The
 *   tabs are a client-side tablist with no URL each, so this clicks the tab
 *   (same approach as X). Handles verified live 2026-11-11, logged in:
 *   button[data-feed-token="for-you" | "following"] inside
 *   shreddit-feed-tabs, with the faceplate-tab-selected attribute on the
 *   active one. The tokens are language-independent; the visible labels
 *   ("Discover", "Following") are not. shreddit-feed-tabs also carries a
 *   current-feed attribute, but it is only correct at page load and is not
 *   updated on a tab switch, so it is not used. Reddit saves the chosen feed
 *   on the account, so after one click later loads arrive on Following.
 * - `hidePromoted`: ads. Every surface is a custom element, which is as
 *   stable a handle as this codebase gets. Verified live 2026-08-05:
 *   shreddit-ad-post (in-feed promoted posts, four in a 35-post feed),
 *   shreddit-sidebar-ad, shreddit-dynamic-ad-link, and advertise-button
 *   (the "Advertise on Reddit" item in the header). Each is the whole
 *   unit, so hiding it leaves no gap or orphaned divider.
 * - `hideRecommendations`: the "Games on Reddit" sidebar section (which
 *   also holds its "Discover More" link) and the Trending block in the
 *   search dropdown, whose items are labelled "Based on your interests".
 * - `oldReddit`: handled by a DNR redirect. old.reddit.com is served with
 *   no ads, no trending, no recommendations and no Discover feed at all, so
 *   it needs no content script and this platform asks for no permission on
 *   that host.
 */
const AD_SELECTORS = [
  'shreddit-ad-post',
  'shreddit-sidebar-ad',
  'shreddit-dynamic-ad-link',
  'advertise-button',
];

const RECOMMENDATION_SELECTORS = [
  'games-section-badge-controller',
  'games-section-badge-wrapper',
];

/**
 * The search dropdown lives in reddit-search-large's shadow root, out of
 * reach of a page-level stylesheet, so it gets its own <style> injected
 * into the root. Its sections are flat siblings rather than nested
 * containers, so the trending header and everything after it go together:
 * "Trending" is followed only by "Trending communities", while "Recent"
 * (your own search history, not a recommendation) sits above and survives.
 *
 * The header's id is `section_<n>_pipeline_<n>_trending_query`, with
 * ordinals that shift as the sections above it come and go, hence the
 * suffix match rather than the literal id.
 */
const SEARCH_HOSTS = 'reddit-search-large, reddit-search-small';
const SEARCH_CSS =
  '[id$="_trending_query"], [id$="_trending_query"] ~ * { display: none !important; }';

export default defineContentScript({
  matches: matchesFor('reddit'),
  // document_start so the hiding CSS is in place before first paint; the
  // shadow-root work below is driven by mutations, so an empty document at
  // startup is fine.
  runAt: 'document_start',
  main() {
    // Backstop for the old Reddit DNR rule, for loads DNR does not see
    // (Reddit's own service worker can serve the page). This script only
    // runs on reddit.com, never on old.reddit.com, so the target is always
    // somewhere it does not run again and cannot loop.
    watchSpaNavigation(
      'reddit',
      (url) => `https://old.reddit.com${url.pathname}${url.search}`,
      [],
      'oldReddit',
    );

    const hideStyle = document.createElement('style');
    hideStyle.textContent = `
      ${AD_SELECTORS.map((s) => `html[data-nfy-rd-ads] ${s}`).join(',\n      ')} {
        display: none !important;
      }
      ${RECOMMENDATION_SELECTORS.map((s) => `html[data-nfy-rd-recs] ${s}`).join(',\n      ')} {
        display: none !important;
      }
    `;
    // document_start can run before <head> exists; a <style> is effective
    // anywhere in the tree, including the root element.
    (document.head ?? document.documentElement).append(hideStyle);

    let hideRecommendations = false;
    let followingOnly = false;
    let lastClick = 0;

    // Only the home page has the feed tabs; Popular, News and custom feeds
    // are destinations the user picked, so they are left alone.
    const enforceFollowing = () => {
      if (!followingOnly || location.pathname !== '/') return;
      const discover = document.querySelector<HTMLElement>(
        'shreddit-feed-tabs button[data-feed-token="for-you"]',
      );
      const following = document.querySelector<HTMLElement>(
        'shreddit-feed-tabs button[data-feed-token="following"]',
      );
      if (!discover || !following) return;
      if (!discover.hasAttribute('faceplate-tab-selected')) return;
      // Guard against a click loop if Reddit ever stops moving the
      // selected attribute.
      if (Date.now() - lastClick > 500) {
        lastClick = Date.now();
        following.click();
        void notify();
      }
    };

    // Only reddit-search-large is verified live; the narrow-viewport
    // sibling is included because it costs nothing when it is absent.
    const applySearchStyle = () => {
      const css = hideRecommendations ? SEARCH_CSS : '';
      for (const host of document.querySelectorAll(SEARCH_HOSTS)) {
        const root = host.shadowRoot;
        if (!root) continue;
        let style = root.querySelector<HTMLStyleElement>('style[data-nfy]');
        if (!style) {
          style = document.createElement('style');
          style.dataset.nfy = '';
          root.append(style);
        }
        // Guarded so the common case (nothing changed) stays a read rather
        // than a style recalculation on every frame the page mutates.
        if (style.textContent !== css) style.textContent = css;
      }
    };

    const schedule = enforceOnMutations(() => {
      enforceFollowing();
      applySearchStyle();
    });

    const sync = async () => {
      const reddit = await getEffective('reddit');
      hideRecommendations = reddit.hideRecommendations;
      followingOnly = reddit.enabled;
      document.documentElement.toggleAttribute(
        'data-nfy-rd-ads',
        reddit.hidePromoted,
      );
      document.documentElement.toggleAttribute(
        'data-nfy-rd-recs',
        hideRecommendations,
      );
      schedule();
    };
    void sync();
    watchSettings(() => void sync());
  },
});
