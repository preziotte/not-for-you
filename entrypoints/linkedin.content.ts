import { defineContentScript } from '#imports';
import { matchesFor } from '../lib/platforms';
import { consumeMark, notify } from '../lib/notice';
import { enforceOnMutations } from '../lib/observe';
import { getEffective, watchSettings } from '../lib/settings';

/**
 * LinkedIn's home feed has two tabs, each with its own URL (new layout,
 * verified live 2026-11-24): /feed/foryou/ ("For you", ranked, with
 * Promoted units and posts from strangers) and /feed/network/ ("Network",
 * posts from your connections and follows only). Bare /feed/ is served as
 * is and then rewritten to /feed/foryou/ in the client.
 *
 * Three independent behaviors, one per checkbox:
 * - `enabled`: keep the home feed on Network. A direct load of
 *   /feed/foryou/ is redirected by the DNR rule in lib/platforms.ts; the
 *   usual arrival (bare /feed/, rewritten in-app) never makes a request
 *   for that URL, so here the Network tab is clicked instead, which
 *   switches without a reload. On the older single-feed layout, which has
 *   no tabs, the sort is forced to Recent via its dropdown as before.
 * - `hidePromoted`: hide algorithmic units, meaning Promoted posts,
 *   "Recommended for you", and LinkedIn's own ad boxes
 * - `hideRails`: hide the news/puzzles rail
 *
 * Markup: the For you feed is [data-testid="mainFeed"] (children are
 * composer, spacer, sort row, new-posts button, then one div per post);
 * the Network feed is [data-testid="NetworkFeedListCollection"] (a notice,
 * a spacer, then one div per post). The tab bar has no role=tablist and no
 * selected-state attribute: it is two [role="button"] divs in the element
 * just ahead of the feed's branch, [For you, Network], so position is the
 * only language-independent handle and the URL says which one is active.
 * The sort dropdown is the only visible two-item [role=menuitem] menu:
 * [Top, Recent].
 *
 * Text markers are English-first. Non-English UIs: the filter misses and
 * the already-on-Recent check falls through to one click per page load.
 *
 * The Promoted label must be matched structurally (a short header element
 * whose text starts with "Promoted"), NOT by word-boundary regex on the
 * post's textContent: textContent concatenates nodes without whitespace
 * ("776,462 followersPromotedAccording to..."), which destroys word
 * boundaries.
 */
function isAlgorithmic(post: HTMLElement): boolean {
  const text = (post.textContent ?? '').slice(0, 300);
  if (
    text.includes('Recommended for you') ||
    text.includes('Grow your business on LinkedIn')
  ) {
    return true;
  }
  for (const el of post.querySelectorAll('span,div,p,a')) {
    const t = el.textContent?.trim() ?? '';
    if (t.length < 80 && (t === 'Promoted' || t.startsWith('Promoted •'))) {
      return true;
    }
  }
  return false;
}

export default defineContentScript({
  matches: matchesFor('linkedin'),
  // document_start so the rail-hiding CSS is in place before first paint;
  // everything below tolerates an empty document and re-runs on mutation.
  runAt: 'document_start',
  main() {
    let enabled = false;
    let hidePromoted = false;
    let sorting = false;
    let sortAttemptAt = 0;
    let tabClickAt = 0;

    // A load that arrives carrying the mark was redirected by the DNR rule.
    if (consumeMark()) void notify();

    // News/puzzles rail: anchored on its /news/story links, with the
    // (English) aria-label as backup. Verified live 2026-08-03.
    const railStyle = document.createElement('style');
    railStyle.textContent =
      'html[data-nfy-li-rails] main aside:has(a[href*="/news/story"]), html[data-nfy-li-rails] main aside[aria-label="Aside"] { display: none !important; }';
    (document.head ?? document.documentElement).append(railStyle);

    const feedEl = () =>
      document.querySelector<HTMLElement>(
        'main [data-testid="mainFeed"], main [data-testid="NetworkFeedListCollection"]',
      );
    const path = () => location.pathname.replace(/\/$/, '');
    const FEED_PATHS = ['/feed', '/feed/foryou', '/feed/network'];

    /**
     * The [For you, Network] tabs: the buttons in the element just ahead of
     * the feed's branch. Empty on the older layout, which has no tab bar.
     */
    const feedTabs = (feed: HTMLElement): HTMLElement[] => {
      const main = feed.closest('main');
      let branch: HTMLElement | null = feed;
      while (branch && branch !== main && !branch.previousElementSibling) {
        branch = branch.parentElement;
      }
      if (!branch || branch === main) return [];
      return [
        ...branch.previousElementSibling!.querySelectorAll<HTMLElement>(
          '[role="button"]',
        ),
      ];
    };

    const showNetwork = (feed: HTMLElement) => {
      const tabs = feedTabs(feed);
      if (tabs.length !== 2) return;
      // Guard against a click loop if the click ever stops changing the URL.
      if (Date.now() - tabClickAt < 2000) return;
      tabClickAt = Date.now();
      tabs[1].click();
      void notify();
    };

    /*
     * A post's classification never changes once it has rendered, and this
     * runs on every animation frame the feed mutates, so each post is
     * scanned exactly once and then marked. Without the mark, every post
     * that is legitimately kept gets re-scanned (a full querySelectorAll
     * over its subtree) for as long as the tab stays open.
     *
     * LinkedIn inserts a post's shell before filling it, so a child that is
     * still near-empty is left unmarked to be judged on a later frame.
     */
    const RENDERED_LENGTH = 40;

    const filterPosts = (feed: HTMLElement) => {
      for (const child of [...feed.children] as HTMLElement[]) {
        if (child.dataset.nfyScanned !== undefined) continue;
        if ((child.textContent ?? '').length < RENDERED_LENGTH) continue;
        child.dataset.nfyScanned = '';
        if (isAlgorithmic(child)) child.style.display = 'none';
      }
    };

    const restore = (feed: HTMLElement | null) => {
      if (!feed) return;
      for (const child of [...feed.children] as HTMLElement[]) {
        child.style.removeProperty('display');
        delete child.dataset.nfyScanned;
      }
    };

    const forceRecentSort = async (feed: HTMLElement) => {
      const sortRow = feed.children[2] as HTMLElement | undefined;
      const trigger = sortRow?.querySelector<HTMLElement>('[role="button"]');
      if (!sortRow || !trigger) return;
      if (/Recent/.test(sortRow.textContent ?? '')) return;
      if (sorting || Date.now() - sortAttemptAt < 5000) return;
      sorting = true;
      sortAttemptAt = Date.now();
      try {
        trigger.click();
        await new Promise((resolve) => setTimeout(resolve, 600));
        const items = [
          ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
        ].filter((item) => item.getBoundingClientRect().height > 0);
        if (items.length === 2) {
          items[1].click();
          void notify();
        } else {
          // Unexpected surface; close what we opened and leave it alone.
          trigger.click();
        }
      } finally {
        sorting = false;
      }
    };

    const enforce = () => {
      const feed = feedEl();
      const here = path();
      if (!FEED_PATHS.includes(here)) {
        restore(feed);
        return;
      }
      if (!feed) return;
      // restore() when the filter is off, so unchecking the box brings the
      // hidden posts back without a reload.
      if (hidePromoted) filterPosts(feed);
      else restore(feed);
      if (!enabled) return;
      if (here === '/feed/foryou') showNetwork(feed);
      // Bare /feed with a tab bar is the new layout a moment before it
      // rewrites its own URL; only the older layout gets the sort.
      else if (here === '/feed' && feedTabs(feed).length !== 2)
        void forceRecentSort(feed);
    };

    const schedule = enforceOnMutations(enforce);

    const sync = async () => {
      const linkedin = await getEffective('linkedin');
      enabled = linkedin.enabled;
      hidePromoted = linkedin.hidePromoted;
      document.documentElement.toggleAttribute(
        'data-nfy-li-rails',
        linkedin.hideRails,
      );
      schedule();
    };
    void sync();
    watchSettings(() => void sync());
  },
});
