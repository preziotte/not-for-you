import { defineContentScript } from '#imports';
import { matchesFor } from '../lib/platforms';
import { enforceOnMutations } from '../lib/observe';
import { getEffective, watchSettings } from '../lib/settings';

/**
 * Nuanced LinkedIn mode. There is no chronological URL, so on /feed there
 * are two independent behaviors, one per checkbox:
 * - `enabled`: force the sort to Recent via the sort dropdown (a real
 *   chronological feed of your connections exists behind it)
 * - `hidePromoted`: hide algorithmic units, meaning Promoted posts,
 *   "Recommended for you", and LinkedIn's own ad boxes
 *
 * Current markup (verified live 2026-08-03): the feed is
 * [data-testid="mainFeed"]; children are composer, spacer, sort row,
 * new-posts button, then one div per post. The sort dropdown is the only
 * visible two-item [role=menuitem] menu: [Top, Recent].
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

    // News/puzzles rail: anchored on its /news/story links, with the
    // (English) aria-label as backup. Verified live 2026-08-03.
    const railStyle = document.createElement('style');
    railStyle.textContent =
      'html[data-nfy-li-rails] main aside:has(a[href*="/news/story"]), html[data-nfy-li-rails] main aside[aria-label="Aside"] { display: none !important; }';
    (document.head ?? document.documentElement).append(railStyle);

    const feedEl = () =>
      document.querySelector<HTMLElement>('main [data-testid="mainFeed"]');
    const onFeed = () =>
      location.pathname === '/feed' || location.pathname === '/feed/';

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
      if (!onFeed()) {
        restore(feed);
        return;
      }
      if (!feed) return;
      // restore() when the filter is off, so unchecking the box brings the
      // hidden posts back without a reload.
      if (hidePromoted) filterPosts(feed);
      else restore(feed);
      if (enabled) void forceRecentSort(feed);
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
