import { defineContentScript } from '#imports';
import { matchesFor } from '../lib/platforms';
import { enforceOnMutations } from '../lib/observe';
import { getEffective, watchSettings } from '../lib/settings';
import { watchSpaNavigation } from '../lib/spa';

/**
 * Reddit's home feed is already subscribed-only, so there is no feed to
 * redirect (see the note in lib/platforms.ts). What is left to remove is
 * everything Reddit adds that you did not subscribe to:
 *
 * - `enabled`: ads. Every surface is a custom element, which is as stable
 *   a handle as this codebase gets. Verified live 2026-08-05:
 *   shreddit-ad-post (in-feed promoted posts, four in a 35-post feed),
 *   shreddit-sidebar-ad, shreddit-dynamic-ad-link, and advertise-button
 *   (the "Advertise on Reddit" item in the header). Each is the whole
 *   unit, so hiding it leaves no gap or orphaned divider.
 * - `hideRecommendations`: the "Games on Reddit" sidebar section (which
 *   also holds its "Discover More" link) and the Trending block in the
 *   search dropdown, whose items are labelled "Based on your interests"
 *   and are the one genuinely personalized surface on the site.
 * - `oldReddit`: handled by a DNR redirect. old.reddit.com is served with
 *   no ads, no trending and no recommendations at all, so it needs no
 *   content script and this platform asks for no permission on that host.
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

    const schedule = enforceOnMutations(applySearchStyle);

    const sync = async () => {
      const reddit = await getEffective('reddit');
      hideRecommendations = reddit.hideRecommendations;
      document.documentElement.toggleAttribute(
        'data-nfy-rd-ads',
        reddit.enabled,
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
