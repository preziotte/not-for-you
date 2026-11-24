import { defineConfig } from 'wxt';
import { PLATFORMS } from './lib/platforms';

// The repo has no @types/node; this is the one Node global the config reads.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  /*
   * MV3 on every browser. WXT would default Firefox to MV2, where
   * declarativeNetRequest does not exist: the background would throw on
   * startup and every redirect would fall back to the slower in-page
   * handoff in lib/spa.ts, flashing the For You feed on the way. Firefox
   * ships DNR for MV3 only, which is what strict_min_version 121 pins.
   */
  manifestVersion: 3,
  // True only in `npm run build:local`; lib/notice.ts reads it to show the
  // reminder on every feed switch, so it can be looked at without waiting
  // a day. Never set in a release build.
  vite: () => ({
    define: { __NFY_LOCAL__: JSON.stringify(Boolean(process.env.NFY_LOCAL)) },
  }),
  manifest: ({ browser, mode }) => ({
    name: 'Not for You',
    description:
      'Removes algorithmic and suggested content from social media sites.',
    homepage_url: 'https://notforyou.app',
    permissions: ['storage', 'declarativeNetRequest', 'alarms'],
    // Coming-soon platforms are listed in the popup but have no content
    // script or rules yet, so asking for their hosts would be requesting
    // access we never use. They join the prompt when they ship.
    host_permissions: PLATFORMS.filter((p) => !p.comingSoon).flatMap(
      (p) => p.matches,
    ),
    ...(browser !== 'firefox' && {
      /*
       * Lets notforyou.app ask the background whether the extension is
       * installed and to open the popup (the homepage's install button and
       * the welcome page's Extensions chip). Not a permission and no install
       * warning: it only names who may send us a message. Firefox has no
       * equivalent for web pages, so those stay as written there.
       * localhost is for trying it against `npm run dev:site`: dev builds,
       * and `npm run build:local` for a production build that trusts it.
       */
      externally_connectable: {
        matches: [
          'https://notforyou.app/*',
          ...(mode === 'development' || process.env.NFY_LOCAL
            ? ['http://localhost/*']
            : []),
        ],
      },
      /*
       * The popup draws its checkbox borders and fills with color-mix(),
       * which Chrome shipped in 111. Older versions drop those declarations
       * and the boxes lose the outline that makes them look clickable, so
       * this is the floor for a working popup rather than a nicer one.
       * ( :has() in the content scripts wants 105, color-mix wins.)
       */
      minimum_chrome_version: '111',
    }),
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'extension@notforyou.app',
          strict_min_version: '121.0',
          // AMO rejects new extensions without a data collection
          // declaration. "none" is the reserved value for collecting
          // nothing, and cannot be combined with other permissions.
          data_collection_permissions: {
            required: ['none'],
          },
        },
      },
    }),
  }),
});
