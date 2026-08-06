import { browser, defineBackground } from '#imports';
import { PLATFORMS, rulesFor } from '../lib/platforms';
import { getSettings, isGloballyDisabled, DISABLE_ALARM, disabledUntil } from '../lib/settings';
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
  browser.runtime.onInstalled.addListener(() => void syncRedirectRules());
  browser.runtime.onStartup.addListener(() => void syncRedirectRules());
  watchSettings(() => void syncRedirectRules());

  // The popup schedules this alarm when a global disable starts; ending it
  // is just clearing the timestamp, and the storage watch above re-syncs
  // rules and notifies content scripts.
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === DISABLE_ALARM) void disabledUntil.setValue(0);
  });
});
