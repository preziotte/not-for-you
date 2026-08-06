import { defineContentScript } from '#imports';
import { matchesFor } from '../lib/platforms';
import { enforceOnMutations } from '../lib/observe';
import { getEffective, watchSettings } from '../lib/settings';

/**
 * X has no URL for the Following timeline; the tab state is client-side.
 * Enforce it in the DOM: whenever the home tablist shows For You as the
 * selected tab, click Following instead. X re-renders and resets this state
 * aggressively, so a MutationObserver reapplies on every DOM change
 * (debounced to one check per animation frame).
 *
 * The home tablist is [For you, Following, ...pinned lists], so index 1 is
 * the Following tab. Position is the only language-independent handle;
 * aria-selected tracks the active tab.
 */
export default defineContentScript({
  matches: matchesFor('twitter'),
  // document_start so the sidebar never paints before the hiding CSS lands;
  // the tab enforcement below is driven by mutations, so an empty document
  // at startup is fine.
  runAt: 'document_start',
  main() {
    let enabled = false;
    let lastClick = 0;

    // Sidebar rail hiding is pure CSS keyed off a root attribute, so it
    // survives X's re-renders without observer work and toggles instantly.
    const railStyle = document.createElement('style');
    railStyle.textContent =
      'html[data-nfy-x-rails] [data-testid="sidebarColumn"] { display: none !important; }';
    (document.head ?? document.documentElement).append(railStyle);

    const enforce = () => {
      if (!enabled) return;
      if (location.pathname !== '/home' && location.pathname !== '/') return;
      const tabs = document.querySelectorAll<HTMLElement>(
        'main [role="tablist"] [role="tab"]',
      );
      if (tabs.length < 2) return;

      // Only intervene when the algorithmic tab is active. Pinned list tabs
      // are a deliberate choice and stay clickable; hiding the For You tab
      // is off the table because it desyncs X's tab carousel (phantom
      // scroll-back arrow).
      if (tabs[0].getAttribute('aria-selected') === 'true') {
        // Guard against a click loop if X ever stops updating aria-selected.
        if (Date.now() - lastClick > 500) {
          lastClick = Date.now();
          tabs[1].click();
        }
      }
    };

    const schedule = enforceOnMutations(enforce);

    const sync = async () => {
      const twitter = await getEffective('twitter');
      enabled = twitter.enabled;
      document.documentElement.toggleAttribute(
        'data-nfy-x-rails',
        twitter.hideRails,
      );
      schedule();
    };
    void sync();
    watchSettings(() => void sync());
  },
});
