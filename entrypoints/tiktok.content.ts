import { defineContentScript } from '#imports';
import { matchesFor } from '../lib/platforms';
import { getEffective, watchSettings } from '../lib/settings';
import { watchSpaNavigation } from '../lib/spa';

export default defineContentScript({
  matches: matchesFor('tiktok'),
  runAt: 'document_start',
  main() {
    watchSpaNavigation('tiktok', (url) =>
      url.pathname === '/' || url.pathname === '/foryou'
        ? '/following'
        : null,
    );

    // Header action bar: Get Coins / Get App / PC App upsells plus the
    // avatar menu. Hidden wholesale; the left sidebar has a profile link.
    const railStyle = document.createElement('style');
    railStyle.textContent =
      'html[data-nfy-tt-rails] #top-right-action-bar { display: none !important; }';
    (document.head ?? document.documentElement).append(railStyle);

    const syncRails = async () => {
      const tiktok = await getEffective('tiktok');
      document.documentElement.toggleAttribute(
        'data-nfy-tt-rails',
        tiktok.hideRails,
      );
    };
    void syncRails();
    watchSettings(() => void syncRails());
  },
});
