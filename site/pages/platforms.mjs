// Content for the per-platform landing pages, one entry per page.
//
// Each page exists to answer the questions people actually type into a
// search engine about escaping that platform's algorithm, so the FAQ
// entries here are phrased as those queries. Keep the claims in sync with
// the README table and the homepage FAQ: the extension only does what a
// checkbox in the popup says it does.
//
// `platforms` lists every supported platform for the cross-link row;
// only the ones with a `page` entry below get a link. Add an entry and
// run `node scripts/build-pages.mjs` to grow the site.

export const platforms = [
  { slug: "youtube", name: "YouTube" },
  { slug: "instagram", name: "Instagram" },
  { slug: "tiktok", name: "TikTok" },
  { slug: "twitter", name: "X/Twitter" },
  { slug: "reddit", name: "Reddit" },
  { slug: "linkedin", name: "LinkedIn" },
  { slug: "threads", name: "Threads" },
  { slug: "facebook", name: "Facebook" },
];

export const pages = [
  {
    slug: "youtube",
    name: "YouTube",
    title: "Turn Off YouTube Recommendations and Shorts | Not for You",
    description:
      "How to turn off YouTube recommendations: open Subscriptions instead of the Home feed, hide Shorts, and stop autoplay with Not for You, a free extension.",
    h1: "YouTube without the algorithm",
    lead: "A free browser extension that opens YouTube on your <b>Subscriptions feed</b>: every channel you subscribe to, newest video first. <b>No recommendations, no Shorts, no autoplay</b>.",
    changes: [
      "Opens <strong>Subscriptions</strong> instead of the Home feed, so youtube.com lands on the channels you chose, in the order they posted.",
      "Hides the &ldquo;what to watch next&rdquo; recommendations beside and below videos.",
      "Hides the Shorts shelf.",
      "Turns off autoplay, so a video ending is a stopping point instead of a segue.",
    ],
    shots: [
      {
        src: "/shots/youtube-home.webp",
        width: 1600,
        height: 881,
        alt: "The YouTube Home feed before Not for You, with the recommendation grid and the Shorts shelf highlighted; the extension skips this page for Subscriptions and hides Shorts.",
        caption:
          "YouTube&rsquo;s Home feed without the extension. You never land here: youtube.com goes straight to Subscriptions, and the Shorts shelf is hidden everywhere.",
        notes: [
          {
            kind: "kept",
            label: "Your subscriptions: where you land instead",
            box: [0.5, 21, 16, 15],
            labelPos: "inside",
          },
          {
            kind: "changed",
            label: "Home recommendations: skipped for Subscriptions",
            box: [17.3, 8.5, 81.7, 48.5],
            labelPos: "inside",
          },
          {
            kind: "removed",
            label: "Shorts shelf: hidden",
            box: [17.3, 58.5, 81.7, 40.5],
            labelPos: "inside",
          },
        ],
      },
      {
        src: "/shots/youtube-watch.webp",
        width: 1600,
        height: 877,
        alt: "A YouTube watch page before Not for You, with the up-next sidebar and the end-of-video wall of suggested videos highlighted; the extension hides both.",
        caption:
          "The watch page: the recommendations beside the video and the wall that covers it at the end are hidden, and autoplay stays off.",
        notes: [
          {
            kind: "removed",
            label: "End-of-video wall: hidden",
            box: [2, 20.5, 67.5, 43],
            labelPos: "inside",
          },
          {
            kind: "removed",
            label: "&ldquo;Up next&rdquo; recommendations: hidden",
            box: [71.3, 8.5, 26.5, 90],
            labelPos: "inside",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How do I turn off YouTube recommendations?",
        a: [
          "YouTube has no setting for it. The closest built-in option is pausing your watch history, which empties the Home feed entirely but also stops YouTube remembering where you left off in videos.",
          "Not for You takes a different route: you simply never land on the Home feed. YouTube opens on Subscriptions, and the recommendation rails around videos are hidden. Your watch history keeps working.",
        ],
      },
      {
        q: "How do I make Subscriptions my YouTube homepage?",
        a: [
          "YouTube does not offer this. With the extension on, going to youtube.com takes you straight to the Subscriptions feed instead, every time, in every tab.",
        ],
      },
      {
        q: "How do I hide YouTube Shorts?",
        a: [
          "A checkbox in the popup hides the Shorts shelf. Like every option, it works on its own: you can hide Shorts and keep the rest of YouTube exactly as it was.",
        ],
      },
      {
        q: "How do I turn off YouTube autoplay permanently?",
        a: [
          "The toggle in the player works, but it is stored per device and has a habit of finding its way back on. The extension keeps autoplay off for good, and a checkbox turns that behaviour off if you miss it.",
        ],
      },
      {
        q: "Will this affect my account, subscriptions or history?",
        a: [
          "No. Everything happens locally in your browser: the extension redirects you to pages YouTube already has and hides elements on them. Nothing on your account changes, and turning the extension off puts YouTube back exactly as it was.",
        ],
      },
    ],
  },
  {
    slug: "twitter",
    name: "X/Twitter",
    title: "Chronological Feed on X (Twitter), Following Only | Not for You",
    description:
      "How to make X (Twitter) always open the chronological Following feed instead of For You, and hide trends and suggestions, with Not for You, a free extension.",
    h1: "X/Twitter without the algorithm",
    lead: "A free browser extension that keeps X on the <b>Following tab</b>: the accounts you actually follow, in the order they posted. <b>No &ldquo;For You&rdquo;, no trends, no suggested accounts</b>.",
    changes: [
      "Opens the <strong>Following</strong> tab instead of &ldquo;For You&rdquo;, and keeps you there. X can no longer quietly switch you back.",
      "Hides the trends sidebar and &ldquo;Who to follow&rdquo; suggestions.",
    ],
    shots: [
      {
        src: "/shots/twitter.webp",
        width: 1600,
        height: 882,
        alt: "The X home timeline before Not for You, open on the For You tab, with the sidebar of trends, news and Premium upsells highlighted; the extension switches to Following and hides the sidebar.",
        caption:
          "X without the extension: it opens on &ldquo;For You&rdquo; and fills the sidebar with trends, news and upsells. The extension keeps you on Following and hides the sidebar.",
        notes: [
          {
            kind: "changed",
            label: "Opens on Following, not For You",
            box: [26.5, 0.5, 15.5, 5],
            labelPos: "bottom",
          },
          {
            kind: "removed",
            label: "Trends, news &amp; upsells: hidden",
            box: [67.9, 7.5, 24, 91.5],
            labelPos: "inside",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "How do I get a chronological feed on X?",
        a: [
          "X already has one: the Following tab shows the accounts you follow, newest first. The problem is that X opens on &ldquo;For You&rdquo; and keeps steering you back to it. With the extension on, X opens on Following, full stop.",
        ],
      },
      {
        q: "Why does X keep switching me back to the For You tab?",
        a: [
          "X resets your tab choice after you have been away for a while; it is not something you can turn off in settings. The extension makes the choice for you on every visit, so the reset never has a chance to stick.",
        ],
      },
      {
        q: "How do I hide Trends and &ldquo;Who to follow&rdquo;?",
        a: [
          "A checkbox in the popup hides the trends sidebar and account suggestions. Search still works exactly as before when you actually want to look something up.",
        ],
      },
      {
        q: "Will I still see every post from people I follow?",
        a: [
          "Yes, that is the point. The &ldquo;For You&rdquo; feed shows a fraction of what the people you follow post and fills the rest with whatever keeps you scrolling. Following shows all of it, in order.",
        ],
      },
      {
        q: "Does it work in the X mobile app?",
        a: [
          "No. It works in desktop browsers: Firefox, Chrome, Edge, Brave, Opera, Arc, anything built on Chromium. Mobile apps are closed platforms and don&rsquo;t allow extensions.",
        ],
      },
    ],
  },
  {
    slug: "instagram",
    name: "Instagram",
    title: "See Only Accounts You Follow on Instagram | Not for You",
    description:
      "How to make Instagram show only the accounts you follow: open the Following feed every time and hide suggested posts and accounts, with Not for You, a free extension.",
    h1: "Instagram without the algorithm",
    lead: "A free browser extension that opens Instagram on the <b>Following feed</b>: only the accounts you follow, newest post first. <b>No suggested posts, no suggested accounts</b>.",
    changes: [
      "Opens <strong>Following</strong> instead of the Home feed, so instagram.com shows the accounts you chose, in the order they posted.",
      "Hides the suggestions sidebar, with its &ldquo;Suggested for you&rdquo; accounts.",
    ],
    faqs: [
      {
        q: "How do I make Instagram show only accounts I follow?",
        a: [
          "Instagram has a Following feed tucked behind the logo menu in the top corner, but it does not stay: the next visit opens the algorithmic Home feed again. With the extension on, instagram.com opens on Following every time.",
        ],
      },
      {
        q: "How do I get a chronological feed on Instagram?",
        a: [
          "The Following feed is that: the people you follow, newest first. The extension makes it the feed you land on, instead of a menu option Instagram quietly forgets.",
        ],
      },
      {
        q: "How do I turn off suggested posts on Instagram?",
        a: [
          "Instagram only lets you snooze suggested posts for 30 days, and they come back. Landing on Following instead of Home sidesteps the whole thing: that feed has no suggested posts to turn off, and the extension also hides the &ldquo;Suggested for you&rdquo; sidebar.",
        ],
      },
      {
        q: "Will I still see Stories and messages?",
        a: [
          "Yes. Stories, DMs, search, profiles and posting all work exactly as before. The only thing that changes is which feed you land on and the suggestions around it.",
        ],
      },
      {
        q: "Does it work in the Instagram app?",
        a: [
          "No. It works on instagram.com in desktop browsers: Firefox, Chrome, Edge, Brave, Opera, Arc, anything built on Chromium. Mobile apps are closed platforms and don&rsquo;t allow extensions.",
        ],
      },
    ],
  },
  {
    slug: "tiktok",
    name: "TikTok",
    title: "Turn Off TikTok&rsquo;s For You Page | Not for You",
    description:
      "How to make TikTok open on the Following feed instead of the For You page, so you only see creators you chose, with Not for You, a free extension.",
    h1: "TikTok without the algorithm",
    lead: "A free browser extension that opens TikTok on the <b>Following feed</b>: the creators you chose to follow, not the algorithm&rsquo;s picks. <b>No &ldquo;For You&rdquo;</b>.",
    changes: [
      "Opens <strong>Following</strong> instead of the &ldquo;For You&rdquo; feed, so tiktok.com starts with creators you actually follow.",
      "Hides the header bar above the feed.",
    ],
    faqs: [
      {
        q: "How do I turn off TikTok&rsquo;s For You page?",
        a: [
          "TikTok has no setting to change which feed it opens on; For You is the product. What it does have is a Following feed, and with the extension on, tiktok.com opens there instead, every visit.",
        ],
      },
      {
        q: "Can I watch only creators I follow on TikTok?",
        a: [
          "Yes. The Following feed shows videos from the creators you follow and nothing else. That is the feed the extension keeps you on.",
        ],
      },
      {
        q: "Will TikTok still work normally otherwise?",
        a: [
          "Yes. Search, profiles, messages and posting are untouched, and if you want the For You feed back there is a &ldquo;Disable for 5 minutes&rdquo; button in the popup, or a checkbox to turn the redirect off entirely.",
        ],
      },
      {
        q: "Does it work in the TikTok app?",
        a: [
          "No. It works on tiktok.com in desktop browsers: Firefox, Chrome, Edge, Brave, Opera, Arc, anything built on Chromium. Mobile apps are closed platforms and don&rsquo;t allow extensions.",
        ],
      },
    ],
  },
  {
    slug: "reddit",
    name: "Reddit",
    title:
      "Hide Reddit&rsquo;s Promoted Posts and Recommendations | Not for You",
    description:
      "How to browse Reddit without promoted posts, ads or subreddit recommendations, and optionally default to old Reddit, with Not for You, a free extension.",
    h1: "Reddit without the clutter",
    lead: "Reddit&rsquo;s feed is already the communities you joined, so the extension leaves it alone. It removes what gets inserted into it: <b>promoted posts, ads and recommendations</b>.",
    changes: [
      "Hides <strong>promoted posts and ads</strong> in the feed.",
      "Hides Reddit&rsquo;s recommendations: suggested communities and &ldquo;similar to&rdquo; units.",
      "Optionally opens <strong>old Reddit</strong> by default (off unless you turn it on).",
    ],
    shots: [
      {
        src: "/shots/reddit.webp",
        width: 1600,
        height: 869,
        alt: "The Reddit Home feed before Not for You, with the promoted post, the Advertise button and the Games on Reddit section highlighted; the extension removes each of them.",
        caption:
          "Reddit without the extension. Everything marked in red gets removed; the feed itself is already the communities you joined, so it stays.",
        notes: [
          {
            kind: "kept",
            label: "Your communities: untouched",
            box: [24.4, 12.9, 46.6, 19.5],
            labelPos: "inside",
          },
          {
            kind: "removed",
            label: "Promoted posts: hidden",
            box: [24.4, 34.0, 46.6, 64.0],
            labelPos: "inside",
          },
          {
            kind: "removed",
            label: "&ldquo;Games on Reddit&rdquo;: hidden",
            box: [1.2, 34.2, 15.5, 33.8],
            labelPos: "inside",
          },
          {
            kind: "removed",
            label: "Advertise button: hidden",
            box: [81.3, 0.9, 2.7, 4.8],
            labelPos: "bottom-right",
          },
        ],
      },
    ],
    faqs: [
      {
        q: "Does Reddit even have an algorithmic feed?",
        a: [
          "Less than the others: your Home feed is built from the subreddits you joined, which is why the extension leaves the feed itself alone. What Reddit does insert is promoted posts, ads and recommendation units for communities you never asked about, and those are what get hidden.",
        ],
      },
      {
        q: "How do I hide promoted posts on Reddit?",
        a: [
          "A checkbox in the popup hides them, along with the ad slots in the feed and sidebar.",
        ],
      },
      {
        q: "How do I stop Reddit recommending subreddits?",
        a: [
          "Reddit&rsquo;s own setting for this moves around and does not catch everything. The extension hides the recommendation units themselves: suggested communities, &ldquo;popular near you&rdquo;, &ldquo;because you visited&rdquo; and the like.",
        ],
      },
      {
        q: "Can I use old Reddit by default?",
        a: [
          "Yes. A checkbox (off by default) sends reddit.com to old.reddit.com, for the text-dense layout Reddit stopped offering as a simple preference to logged-out visitors.",
        ],
      },
      {
        q: "Is this an ad blocker?",
        a: [
          "Not really. It hides the promoted posts baked into the feed it cleans, but it makes no attempt at the wider ad-blocking problem; uBlock Origin Lite or AdGuard have that covered, and they run happily alongside.",
        ],
      },
    ],
  },
  {
    slug: "linkedin",
    name: "LinkedIn",
    title: "Sort LinkedIn by Recent and Hide Suggested Posts | Not for You",
    description:
      "How to keep the LinkedIn feed sorted by recent instead of top, and hide promoted posts, suggested posts and the news sidebar, with Not for You, a free extension.",
    h1: "LinkedIn without the algorithm",
    lead: "A free browser extension that keeps LinkedIn sorted by <b>Recent</b>: posts from your network, in the order they posted. <b>No suggested posts, no promoted posts, no news box</b>.",
    changes: [
      "Sorts the feed by <strong>Recent</strong> instead of Top, and keeps it there.",
      "Hides promoted and suggested posts in the feed.",
      "Hides the news sidebar.",
    ],
    faqs: [
      {
        q: "How do I sort my LinkedIn feed by recent?",
        a: [
          "LinkedIn has a sort toggle above the feed, but it slides back to Top on the next visit. The extension applies Recent for you every time, so the feed is your network in the order they posted.",
        ],
      },
      {
        q: "How do I get rid of suggested posts on LinkedIn?",
        a: [
          "A checkbox in the popup hides the &ldquo;Suggested&rdquo; and promoted posts LinkedIn mixes into the feed, leaving the posts from people and pages you actually follow.",
        ],
      },
      {
        q: "How do I hide the LinkedIn news sidebar?",
        a: [
          "Also a checkbox. The &ldquo;LinkedIn News&rdquo; box disappears; the rest of the sidebar stays.",
        ],
      },
      {
        q: "Will this affect my profile, messages or job applications?",
        a: [
          "No. Everything happens locally in your browser and only touches the feed. Your profile, messaging, notifications, job search and applications work exactly as before.",
        ],
      },
    ],
  },
  {
    slug: "threads",
    name: "Threads",
    title: "Make Threads Open the Following Feed | Not for You",
    description:
      "How to make Threads always open the chronological Following feed instead of For You, with Not for You, a free extension.",
    h1: "Threads without the algorithm",
    lead: "A free browser extension that opens Threads on the <b>Following feed</b>: the accounts you follow, newest first. <b>No &ldquo;For You&rdquo;</b>.",
    changes: [
      "Opens <strong>Following</strong> instead of the &ldquo;For You&rdquo; feed, so threads.com starts with the accounts you chose, in the order they posted.",
    ],
    faqs: [
      {
        q: "How do I make Threads default to the Following feed?",
        a: [
          "Threads has a Following feed, but every new visit starts you back on For You; there is no setting to change it. With the extension on, Threads opens on Following every time.",
        ],
      },
      {
        q: "Is the Threads Following feed chronological?",
        a: [
          "Yes. It is the accounts you follow, newest post first, with nothing inserted between them.",
        ],
      },
      {
        q: "Will I miss posts from people I follow?",
        a: [
          "The opposite. For You shows a slice of what the people you follow post, mixed with whatever the algorithm expects to hold you. Following shows all of it, in order.",
        ],
      },
      {
        q: "Does it work in the Threads app?",
        a: [
          "No. It works on threads.com in desktop browsers: Firefox, Chrome, Edge, Brave, Opera, Arc, anything built on Chromium. Mobile apps are closed platforms and don&rsquo;t allow extensions.",
        ],
      },
    ],
  },
  {
    slug: "facebook",
    name: "Facebook",
    title: "See Facebook Posts in Chronological Order | Not for You",
    description:
      "How to see Facebook posts from friends, groups and pages in chronological order using the Feeds view, and hide Reels, with Not for You, a free extension.",
    h1: "Facebook without the algorithm",
    lead: "A free browser extension that opens Facebook on the <b>Feeds view</b>: friends, groups and pages, most recent first. <b>No suggested posts, no Reels tab</b>.",
    changes: [
      "Opens the <strong>Feeds</strong> view instead of Home, so facebook.com shows your friends, groups and pages in the order they posted.",
      "Hides the Reels tab.",
    ],
    faqs: [
      {
        q: "How do I see Facebook posts in chronological order?",
        a: [
          "Facebook keeps a chronological view called Feeds, buried in the left-hand menu, and always brings you back to the algorithmic Home feed on the next visit. With the extension on, facebook.com opens on Feeds instead, every time.",
        ],
      },
      {
        q: "What is the Facebook Feeds view?",
        a: [
          "It is Facebook&rsquo;s own most-recent-first feed of your friends, groups and pages, with tabs to see each on its own. No suggested posts, no &ldquo;people you may know&rdquo;.",
        ],
      },
      {
        q: "How do I hide Reels on Facebook?",
        a: [
          "A checkbox in the popup hides the Reels tab. Like every option, it works on its own if that is the only change you want.",
        ],
      },
      {
        q: "Will Marketplace, groups and Messenger still work?",
        a: [
          "Yes. Only the feed you land on changes. Marketplace, groups, events, Messenger, notifications and posting are exactly as before, and turning the extension off puts everything back.",
        ],
      },
    ],
  },
];
