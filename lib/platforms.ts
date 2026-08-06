import type { Browser } from 'wxt/browser';

export type PlatformId =
  | 'youtube'
  | 'instagram'
  | 'threads'
  | 'tiktok'
  | 'twitter'
  | 'reddit'
  | 'facebook'
  | 'linkedin';

export interface PlatformOption {
  /** Settings key; content scripts read this flag by name. */
  key: string;
  /** Popup checkbox label. */
  label: string;
  /**
   * Options ship on. Set this false for the ones opinionated enough that
   * turning them on has to be the user's own decision.
   */
  defaultOn?: boolean;
  /**
   * declarativeNetRequest rules installed while this option is on, for the
   * options that are themselves a redirect. Ids are assigned from the
   * option's id block at registration time, so leave `id` set to 0 here.
   */
  dnrRules?: Browser.declarativeNetRequest.Rule[];
}

export interface Platform {
  id: PlatformId;
  label: string;
  /** Popup checkbox label describing the platform's core behavior. */
  enabledLabel: string;
  /** True while the platform has no behavior built yet. */
  comingSoon?: boolean;
  /** Match patterns for host_permissions and content script injection. */
  matches: string[];
  /**
   * declarativeNetRequest redirect rules for this platform. Rule ids are
   * assigned from the platform's id block at registration time, so leave
   * `id` set to 0 here.
   */
  dnrRules: Browser.declarativeNetRequest.Rule[];
  /**
   * Additional independent toggles rendered under the enabled checkbox.
   * Each defaults to on and is independent of `enabled` (only the global
   * disable overrides everything).
   */
  options: PlatformOption[];
}

/**
 * Each platform owns a block of 100 DNR rule ids, starting at
 * (index + 1) * 100, so rules can be added or removed per platform without
 * colliding. Inside that block the platform's own rules take the first ten
 * ids and each option takes the ten after that, so an option's rules keep
 * their ids when a rule is added to the platform above them.
 */
export const RULE_ID_BLOCK = 100;
export const OPTION_ID_BLOCK = 10;

export const PLATFORMS: Platform[] = [
  {
    id: 'youtube',
    enabledLabel: 'Show Subscriptions, not the Home feed',
    label: 'YouTube',
    matches: ['*://www.youtube.com/*', '*://youtube.com/*'],
    options: [
      { key: 'autoplayOff', label: 'Turn off autoplay' },
      { key: 'hideShorts', label: 'Hide Shorts row' },
      { key: 'hideRelated', label: 'Hide what to watch next' },
    ],
    dnrRules: [
      {
        id: 0,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            regexSubstitution: 'https://www.youtube.com/feed/subscriptions',
          },
        },
        condition: {
          // Home page only, with or without query params.
          regexFilter: '^https?://(www\\.)?youtube\\.com/(\\?.*)?$',
          resourceTypes: ['main_frame'],
        },
      },
    ],
  },
  {
    id: 'instagram',
    enabledLabel: 'Show Following, not the Home feed',
    label: 'Instagram',
    matches: ['*://www.instagram.com/*', '*://instagram.com/*'],
    options: [{ key: 'hideRails', label: 'Hide suggestions sidebar' }],
    dnrRules: [
      {
        id: 0,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            regexSubstitution: 'https://www.instagram.com/?variant=following',
          },
        },
        condition: {
          // Bare home page only. The redirect target has a query string, so
          // it cannot match this condition and loop (RE2 has no lookaheads,
          // hence no `?variant=` exclusion).
          regexFilter: '^https?://(www\\.)?instagram\\.com/$',
          resourceTypes: ['main_frame'],
        },
      },
    ],
  },
  {
    id: 'twitter',
    enabledLabel: 'Show Following, not the “For You” feed',
    label: 'X / Twitter',
    matches: ['*://x.com/*', '*://twitter.com/*'],
    dnrRules: [],
    options: [{ key: 'hideRails', label: 'Hide trends & suggestions' }],
  },
  {
    id: 'tiktok',
    enabledLabel: 'Show Following, not the “For You” feed',
    label: 'TikTok',
    matches: ['*://www.tiktok.com/*', '*://tiktok.com/*'],
    options: [{ key: 'hideRails', label: 'Hide header bar' }],
    dnrRules: [
      {
        id: 0,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            regexSubstitution: 'https://www.tiktok.com/following',
          },
        },
        condition: {
          // Home ("/", the For You feed) and its legacy /foryou alias.
          regexFilter: '^https?://(www\\.)?tiktok\\.com/(foryou/?)?(\\?.*)?$',
          resourceTypes: ['main_frame'],
        },
      },
    ],
  },
  {
    id: 'facebook',
    enabledLabel: 'Show the Feeds view, not Home',
    label: 'Facebook',
    matches: ['*://www.facebook.com/*', '*://facebook.com/*'],
    options: [{ key: 'hideReels', label: 'Hide the Reels tab' }],
    dnrRules: [
      {
        id: 0,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            regexSubstitution: 'https://www.facebook.com/?filter=all&sk=h_chr',
          },
        },
        condition: {
          // Bare home page only. The redirect target carries a query
          // string, so it cannot match this condition and loop; home URLs
          // that arrive with tracking params are left to the content
          // script (same tradeoff as Instagram).
          regexFilter: '^https?://(www\\.)?facebook\\.com/$',
          resourceTypes: ['main_frame'],
        },
      },
    ],
  },
  /*
   * Reddit is a cleanup platform, not a feed platform. Measured live
   * 2026-08-05 against a 104-subreddit account: 400 posts of the home feed
   * came entirely from subscribed subreddits, on both the Best default and
   * the New sort, and post pages carry no related-posts or recommendation
   * units at all. Reddit's home is already what this extension asks every
   * other platform for, so there is no feed to take back.
   *
   * That also rules out the redirect we used to ship here (Best -> New).
   * Ranking on Reddit decides order within communities you joined, and it
   * is community votes doing the ranking, not a model of you. Swapping to
   * New threw that curation away and called it de-algorithming.
   *
   * What is actually foreign to a subscribed feed is ads and Reddit's own
   * recommendation surfaces, so those are what the checkboxes hide.
   */
  {
    id: 'reddit',
    enabledLabel: 'Hide promoted posts and ads',
    label: 'Reddit',
    matches: ['*://www.reddit.com/*', '*://reddit.com/*'],
    dnrRules: [],
    options: [
      { key: 'hideRecommendations', label: 'Hide Reddit’s recommendations' },
      {
        key: 'oldReddit',
        label: 'Use old Reddit',
        // Off by default: it is the most complete answer available on this
        // platform and also the most opinionated, so it stays a choice.
        defaultOn: false,
        dnrRules: [
          {
            id: 0,
            priority: 1,
            action: {
              type: 'redirect',
              redirect: { regexSubstitution: 'https://old.reddit.com/\\1' },
            },
            condition: {
              // Whole host, path and query preserved. old.reddit.com does
              // not match the pattern (the optional group covers "www."
              // only), so the target cannot loop back through this rule.
              regexFilter: '^https?://(?:www\\.)?reddit\\.com/(.*)',
              resourceTypes: ['main_frame'],
            },
          },
        ],
      },
    ],
  },
  {
    id: 'linkedin',
    enabledLabel: 'Show Recent, not the Top sort',
    label: 'LinkedIn',
    matches: ['*://www.linkedin.com/*', '*://linkedin.com/*'],
    dnrRules: [],
    options: [
      { key: 'hidePromoted', label: 'Hide promoted & suggested posts' },
      { key: 'hideRails', label: 'Hide news sidebar' },
    ],
  },
  {
    id: 'threads',
    options: [],
    enabledLabel: 'Show Following, not the “For You” feed',
    label: 'Threads',
    matches: [
      '*://www.threads.com/*',
      '*://threads.com/*',
      '*://www.threads.net/*',
      '*://threads.net/*',
    ],
    dnrRules: [
      {
        id: 0,
        priority: 1,
        action: {
          type: 'redirect',
          redirect: {
            regexSubstitution: 'https://www.threads.com/following',
          },
        },
        condition: {
          // Home page only; /following is a distinct path, so no loop.
          regexFilter: '^https?://(www\\.)?threads\\.(com|net)/(\\?.*)?$',
          resourceTypes: ['main_frame'],
        },
      },
    ],
  },
];

/**
 * Match patterns for a platform's content script. Content scripts read this
 * rather than repeating their patterns, so a host added here is always both
 * requested in host_permissions and actually injected into; the two drifting
 * apart means asking for a permission we never use.
 */
export function matchesFor(id: PlatformId): string[] {
  return PLATFORMS.find((p) => p.id === id)!.matches;
}

/**
 * The DNR rules a platform wants installed given its current flags, with
 * concrete ids assigned from its id block. Takes plain flags rather than
 * PlatformSettings so that settings.ts can keep depending on this module
 * and not the other way around.
 */
export function rulesFor(
  platform: Platform,
  flags: Record<string, boolean>,
): Browser.declarativeNetRequest.Rule[] {
  const base = (PLATFORMS.indexOf(platform) + 1) * RULE_ID_BLOCK;
  const rules = flags.enabled
    ? platform.dnrRules.map((rule, i) => ({ ...rule, id: base + i }))
    : [];
  platform.options.forEach((option, index) => {
    if (!option.dnrRules || !flags[option.key]) return;
    const optionBase = base + (index + 1) * OPTION_ID_BLOCK;
    rules.push(
      ...option.dnrRules.map((rule, i) => ({ ...rule, id: optionBase + i })),
    );
  });
  return rules;
}
