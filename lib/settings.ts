import { storage } from '#imports';
import type { PlatformId } from './platforms';
import { PLATFORMS } from './platforms';

/**
 * A platform's flags: `enabled` (the core behavior) plus one boolean per
 * entry in the platform's `options` list, keyed by option key. All
 * independent of each other; only the global disable overrides everything.
 */
export type PlatformSettings = { enabled: boolean } & Record<string, boolean>;

export type Settings = Record<PlatformId, PlatformSettings>;

function defaultsFor(id: PlatformId): PlatformSettings {
  const platform = PLATFORMS.find((p) => p.id === id)!;
  return {
    enabled: true,
    ...Object.fromEntries(
      platform.options.map((o) => [o.key, o.defaultOn ?? true]),
    ),
  };
}

export const DEFAULT_SETTINGS: Settings = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, defaultsFor(p.id)]),
) as Settings;

export const settings = storage.defineItem<Settings>('sync:settings', {
  fallback: DEFAULT_SETTINGS,
});

/**
 * Read settings, filling in defaults for platforms and options added since
 * last save and migrating the v1 shape (flat boolean per platform).
 */
export async function getSettings(): Promise<Settings> {
  const raw = (await settings.getValue()) as Record<string, unknown> | null;
  const out = {} as Settings;
  for (const platform of PLATFORMS) {
    const defaults = defaultsFor(platform.id);
    const value = raw?.[platform.id];
    if (typeof value === 'boolean') {
      out[platform.id] = { ...defaults, enabled: value };
    } else if (value && typeof value === 'object') {
      out[platform.id] = {
        ...defaults,
        ...(value as Record<string, boolean>),
      };
    } else {
      out[platform.id] = defaults;
    }
  }
  return out;
}

export async function updatePlatform(
  id: PlatformId,
  patch: Partial<PlatformSettings>,
) {
  const current = await getSettings();
  current[id] = { ...current[id], ...(patch as Record<string, boolean>) };
  await settings.setValue(current);
}

/**
 * Global disable: a time-boxed escape hatch that turns everything off until
 * the stored timestamp. Local (not synced): disabling is a this-device,
 * this-moment decision. The background alarm resets it to 0 at expiry.
 */
export const DISABLE_MINUTES = 5;
export const DISABLE_ALARM = 'disable-end';

export const disabledUntil = storage.defineItem<number>('local:disabledUntil', {
  fallback: 0,
});

export async function isGloballyDisabled(): Promise<boolean> {
  return (await disabledUntil.getValue()) > Date.now();
}

/** Per-platform settings with the global disable applied (all flags off). */
export async function getEffective(id: PlatformId): Promise<PlatformSettings> {
  const current = (await getSettings())[id];
  if (!(await isGloballyDisabled())) return current;
  return Object.fromEntries(
    Object.keys(current).map((key) => [key, false]),
  ) as PlatformSettings;
}

/** Watch everything that affects effective settings. */
export function watchSettings(callback: () => void) {
  settings.watch(callback);
  disabledUntil.watch(callback);
}
