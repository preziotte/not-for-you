import { defineContentScript } from '#imports';
import { matchesFor } from '../lib/platforms';
import { getEffective, watchSettings } from '../lib/settings';
import { watchSpaNavigation } from '../lib/spa';

export default defineContentScript({
  matches: matchesFor('instagram'),
  runAt: 'document_start',
  main() {
    watchSpaNavigation('instagram', (url) =>
      url.pathname === '/' && !url.searchParams.has('variant')
        ? '/?variant=following'
        : null,
    );

    // Suggestions sidebar: the column next to the feed containing the
    // "See All" link to /explore/people. Instagram's class names are
    // obfuscated, so target that shape; :not(:has(article)) keeps the rule
    // off ancestors that also contain the feed. Verified live 2026-08-03.
    const railStyle = document.createElement('style');
    railStyle.textContent =
      'html[data-nfy-ig-rails] main div:not(:has(article)):has(a[href^="/explore/people"]) { display: none !important; }';
    // document_start can run before <head> exists; a <style> is effective
    // anywhere in the tree, including the root element.
    (document.head ?? document.documentElement).append(railStyle);

    const syncRails = async () => {
      const instagram = await getEffective('instagram');
      document.documentElement.toggleAttribute(
        'data-nfy-ig-rails',
        instagram.hideRails,
      );
    };
    void syncRails();
    watchSettings(() => void syncRails());
  },
});
