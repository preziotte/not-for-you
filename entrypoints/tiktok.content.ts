import { defineContentScript } from '#imports';
import { matchesFor, TIKTOK_HOME_PATH } from '../lib/platforms';
import { getEffective, watchSettings } from '../lib/settings';
import { watchSpaNavigation } from '../lib/spa';

export default defineContentScript({
  matches: matchesFor('tiktok'),
  runAt: 'document_start',
  main() {
    const home = new RegExp(`^${TIKTOK_HOME_PATH}$`);
    watchSpaNavigation('tiktok', (url) =>
      home.test(url.pathname) ? '/following' : null,
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
