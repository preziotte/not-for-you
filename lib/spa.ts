import type { PlatformId } from './platforms';
import { getEffective, watchSettings } from './settings';

/**
 * DNR redirect rules only see full-page loads; SPAs route in-app without a
 * main_frame request. This watches client-side navigation and applies the
 * same redirect logic there.
 *
 * `target` receives the current URL and returns the path to replace it with,
 * or null to leave it alone. It runs on initial load (backstop for loads DNR
 * missed, e.g. served from the site's own service worker), after every SPA
 * navigation, and when settings change. The redirect must produce a URL that
 * `target` maps to null, or this loops.
 *
 * `extraEvents` are site-specific DOM events that signal navigation (e.g.
 * YouTube's yt-navigate-finish) for engines that predate the Navigation API.
 *
 * `flag` is the settings key that switches this on, for the platforms whose
 * redirect hangs off an option rather than the platform's own checkbox.
 */
export function watchSpaNavigation(
  id: PlatformId,
  target: (url: URL) => string | null,
  extraEvents: string[] = [],
  flag = 'enabled',
) {
  let on = false;

  const check = () => {
    if (!on) return;
    const dest = target(new URL(location.href));
    if (dest !== null) location.replace(dest);
  };

  const sync = async () => {
    on = (await getEffective(id))[flag];
    check();
  };
  void sync();
  watchSettings(() => void sync());

  const nav = (window as { navigation?: EventTarget }).navigation;
  nav?.addEventListener('navigatesuccess', check);
  for (const event of extraEvents) {
    document.addEventListener(event, check);
  }
}
