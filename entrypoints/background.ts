import { browser, defineBackground } from '#imports';
import { OPEN_POPUP, PING } from '../lib/notice';
import { PLATFORMS, rulesFor } from '../lib/platforms';
import {
  getSettings,
  isGloballyDisabled,
  DISABLE_ALARM,
  disabledUntil,
} from '../lib/settings';
import { watchSettings } from '../lib/settings';

/**
 * Replace all dynamic DNR rules with the rules the current settings ask
 * for (none while globally disabled). Rebuilding from scratch keeps this
 * idempotent: no drift between settings and installed rules, and rules
 * dropped in an update are cleared on the first sync after it.
 */
async function syncRedirectRules() {
  const current = await getSettings();
  const addRules = (await isGloballyDisabled())
    ? []
    : PLATFORMS.flatMap((p) => rulesFor(p, current[p.id]));
  const existing = await browser.declarativeNetRequest.getDynamicRules();
  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules,
  });
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    void syncRedirectRules();
    // Fresh installs only: updates and browser upgrades stay silent. The
    // page is the one confirmation the user gets that anything happened,
    // since the extension's whole effect is things quietly not appearing.
    if (details.reason === 'install') {
      void browser.tabs.create({ url: 'https://notforyou.app/welcome' });
    }
  });
  browser.runtime.onStartup.addListener(() => void syncRedirectRules());
  watchSettings(() => void syncRedirectRules());

  // Asks why on the way out; the browser opens this after an uninstall.
  void browser.runtime.setUninstallURL('https://notforyou.app/goodbye');

  // A click on the reminder pill. Opening the popup from here needs a
  // recent browser (Chrome 127) and, in Firefox, a user gesture that does
  // not survive the message hop, so the homepage is the fallback.
  browser.runtime.onMessage.addListener((message, sender) => {
    if (message !== OPEN_POPUP) return;
    void browser.action
      .openPopup({ windowId: sender.tab?.windowId })
      .catch(() => browser.tabs.create({ url: 'https://notforyou.app' }));
  });

  // Messages from notforyou.app (see externally_connectable in
  // wxt.config.ts). A ping lets the homepage say "installed" in place of
  // "Add to Chrome"; the answer stays in that page. Opening the popup has
  // no fallback here: the sender is already on the site, and its own text
  // says where the button is.
  browser.runtime.onMessageExternal?.addListener(
    (message, sender, sendResponse) => {
      if (message === PING) sendResponse(true);
      if (message !== OPEN_POPUP) return;
      void browser.action
        .openPopup({ windowId: sender.tab?.windowId })
        .catch(() => {});
    },
  );

  // The popup schedules this alarm when a global disable starts; ending it
  // is just clearing the timestamp, and the storage watch above re-syncs
  // rules and notifies content scripts.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === DISABLE_ALARM) void disabledUntil.setValue(0);
  });
});
