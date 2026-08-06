import { defineContentScript } from '#imports';
import { matchesFor } from '../lib/platforms';
import { enforceOnMutations } from '../lib/observe';
import { getEffective, watchSettings } from '../lib/settings';
import { watchSpaNavigation } from '../lib/spa';

export default defineContentScript({
  matches: matchesFor('youtube'),
  runAt: 'document_start',
  main() {
    watchSpaNavigation(
      'youtube',
      (url) => (url.pathname === '/' ? '/feed/subscriptions' : null),
      ['yt-navigate-finish'],
    );

    // Hiding rules (verified live 2026-08-03), one root attribute per
    // popup option:
    // - hideShorts: the rich-section wrapping a shelf marked is-shorts,
    //   plus the All subscriptions button on the subscriptions feed
    // - hideRelated: the watch-page related renderer (NOT all of
    //   #secondary, which also hosts playlist panels and live chat) and
    //   the end-of-video wall in both its modern and classic forms
    const railStyle = document.createElement('style');
    railStyle.textContent = `
      html[data-nfy-yt-shorts] ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
      html[data-nfy-yt-shorts] ytd-button-renderer:has(a[href="/feed/channels"]) {
        display: none !important;
      }
      html[data-nfy-yt-related] ytd-watch-next-secondary-results-renderer,
      html[data-nfy-yt-related] .ytp-fullscreen-grid,
      html[data-nfy-yt-related] .ytp-endscreen-content {
        display: none !important;
      }
    `;
    (document.head ?? document.documentElement).append(railStyle);

    let autoplayOff = false;
    let lastClick = 0;

    // The player toggle exposes aria-checked and YouTube persists the
    // setting, so this rarely has to act more than once.
    const enforceAutoplayOff = () => {
      if (!autoplayOff || !location.pathname.startsWith('/watch')) return;
      const toggle = document.querySelector<HTMLElement>(
        '.ytp-autonav-toggle-button',
      );
      if (
        toggle?.getAttribute('aria-checked') === 'true' &&
        Date.now() - lastClick > 1000
      ) {
        lastClick = Date.now();
        (toggle.closest('button') ?? toggle).click();
      }
    };

    const schedule = enforceOnMutations(enforceAutoplayOff);

    const sync = async () => {
      const youtube = await getEffective('youtube');
      autoplayOff = youtube.autoplayOff;
      document.documentElement.toggleAttribute(
        'data-nfy-yt-shorts',
        youtube.hideShorts,
      );
      document.documentElement.toggleAttribute(
        'data-nfy-yt-related',
        youtube.hideRelated,
      );
      schedule();
    };
    void sync();
    watchSettings(() => void sync());
  },
});
