import { defineConfig } from 'wxt';
import { PLATFORMS } from './lib/platforms';

export default defineConfig({
  /*
   * MV3 on every browser. WXT would default Firefox to MV2, where
   * declarativeNetRequest does not exist: the background would throw on
   * startup and every redirect would fall back to the slower in-page
   * handoff in lib/spa.ts, flashing the For You feed on the way. Firefox
   * ships DNR for MV3 only, which is what strict_min_version 121 pins.
   */
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Not for You',
    description:
      'Removes algorithmic For You feeds, leaving only the people you follow, in chronological order.',
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
        },
      },
    }),
  }),
});
