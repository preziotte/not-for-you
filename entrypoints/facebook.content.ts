import { defineContentScript } from '#imports';
import { matchesFor } from '../lib/platforms';
import { getEffective, watchSettings } from '../lib/settings';
import { watchSpaNavigation } from '../lib/spa';

/**
 * Facebook is a redirect platform after all. "Feeds" is a first-party
 * chronological surface: Facebook's own left-sidebar bookmark points at
 * /?filter=all&sk=h_chr, so this is a supported route rather than the
 * folklore /?sk=h_chr of old (which still works and lands in the same
 * place, defaulting to the All tab).
 *
 * Feeds carries sub-tabs — All, Favorites, Friends, Groups, Pages — as
 * ?filter=. All is the target: everything you chose to follow, newest
 * first. The narrower tabs are a deliberate choice and are left alone,
 * because ?filter= is only rewritten when absent.
 *
 * Verified live 2026-08-03: the surface renders with no right-hand column
 * at all, so the Sponsored rail that sits beside the Home feed is gone as
 * a side effect of the redirect, with no selector to maintain.
 *
 * Note for future DOM work: Facebook interleaves junk characters into its
 * own text nodes (a timestamp reads "s͏o͏r͏d͏t͏n͏o͏e͏p͏S͏..."), so text
 * markers are actively hostile here in a way LinkedIn's are not. Anchor on
 * hrefs, roles and aria-labels only.
 */
export default defineContentScript({
  matches: matchesFor('facebook'),
  // document_start so the Reels tab never paints before the hiding CSS
  // lands; the redirect below tolerates an empty document.
  runAt: 'document_start',
  main() {
    // Backstop for the DNR rule: catches in-app navigation (the Home
    // button routes client-side, making no main_frame request) and home
    // URLs that arrive carrying tracking params. Keyed on sk rather than
    // the full query so the target maps to null and cannot loop, and so
    // the legacy /?sk=h_chr is recognised as already-chronological.
    watchSpaNavigation('facebook', (url) =>
      url.pathname === '/' && url.searchParams.get('sk') !== 'h_chr'
        ? '/?filter=all&sk=h_chr'
        : null,
    );

    // Reels is the one purely algorithmic surface still reachable from the
    // Feeds view. Both entry points are links to /reel/, scoped to the top
    // bar and the sidebar bookmarks so that reel links inside posts (which
    // are things people you follow actually shared) are never touched.
    //
    // Hide the <li>, not the <a>: the tab's tooltip and its 130x56 hover
    // target live on the list item, so hiding only the anchor leaves an
    // empty slot that still says "Reels" on hover. With the item gone the
    // row is a flexbox and re-centers itself. Verified live 2026-08-03.
    const reelsStyle = document.createElement('style');
    reelsStyle.textContent =
      'html[data-nfy-fb-reels] [role="banner"] li:has(a[href*="/reel/"]), html[data-nfy-fb-reels] [role="navigation"] li:has(a[href*="/reel/"]), html[data-nfy-fb-reels] [role="navigation"] a[href*="/reel/"] { display: none !important; }';
    // document_start can run before <head> exists; a <style> is effective
    // anywhere in the tree, including the root element.
    (document.head ?? document.documentElement).append(reelsStyle);

    const syncReels = async () => {
      const facebook = await getEffective('facebook');
      document.documentElement.toggleAttribute(
        'data-nfy-fb-reels',
        facebook.hideReels,
      );
    };
    void syncReels();
    watchSettings(() => void syncReels());
  },
});
