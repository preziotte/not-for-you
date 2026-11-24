import { browser, storage } from '#imports';
import { NOTICE_MARK } from './platforms';

/**
 * The reminder: a small pill that says the extension is on. People forget
 * it is installed (within a couple of weeks, going by the first reports)
 * and then cannot explain why a site behaves differently, so it has to be
 * on by default: nobody who forgot will go and opt in.
 *
 * It only ever follows a feed switch (a redirect or a tab click), never a
 * page the extension left alone, and shows once a day across all sites:
 * often enough to stay remembered, and one pill a day whether you use one
 * of these sites or all eight.
 */
const VISIBLE_MS = 3500;
const SETTLE_MS = 400;
const LOAD_WAIT_MS = 2500;

/** Synced: turning reminders off is a decision about the extension. */
export const reminders = storage.defineItem<boolean>('sync:reminders', {
  fallback: true,
});

/** Local: the calendar day (this device's clock) the pill last showed. */
const lastDay = storage.defineItem<string>('local:noticeDay', {
  fallback: '',
});

/**
 * Redirects cross a page load, so the reason for the load has to travel
 * with the URL. Same-origin targets only: the mark is read and removed by
 * our own content script on arrival, and nothing would remove it elsewhere.
 */
export function markRedirect(dest: string): string {
  const url = new URL(dest, location.href);
  return url.origin === location.origin ? dest + NOTICE_MARK : dest;
}

/**
 * True if this page load was one of our redirects. Removes the mark from
 * the address bar; call at document_start so the site never sees it.
 */
export function consumeMark(): boolean {
  if (location.hash !== NOTICE_MARK) return false;
  history.replaceState(history.state, '', location.pathname + location.search);
  return true;
}

/** Sent to the background when the pill is clicked. */
export const OPEN_POPUP = 'nfy:open-popup';

/** Sent by notforyou.app to ask whether the extension is installed. */
export const PING = 'nfy:ping';

/** Set by `npm run build:local`: skip the once-a-day limit. */
declare const __NFY_LOCAL__: boolean;

let asked = '';

/** Show the pill, if today's has not been shown yet. */
export async function notify() {
  // The tab-click platforms call this on every enforcement; one storage
  // read per page per day is plenty. Keyed by day, not a plain flag, so a
  // tab left open overnight still gets tomorrow's.
  const today = new Date().toDateString();
  if (asked === today && !__NFY_LOCAL__) return;
  asked = today;
  if (!(await reminders.getValue())) return;
  if ((await lastDay.getValue()) === today && !__NFY_LOCAL__) return;
  await lastDay.setValue(today);

  // Wait for the page to settle: a beat after load is when a small thing
  // gets noticed, and not while the site is still drawing itself.
  if (document.readyState === 'complete') {
    setTimeout(render, SETTLE_MS);
  } else {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      setTimeout(render, SETTLE_MS);
    };
    window.addEventListener('load', go, { once: true });
    setTimeout(go, LOAD_WAIT_MS);
  }
}

const CSS = `
  :host {
    all: initial;
    position: fixed;
    /* One fixed spot on every site, under the toolbar corner where the
       extension itself lives, so it is recognised by where it appears as
       much as by what it says. It can sit over a site's own header
       controls for the few seconds it is up; placing it around them was
       tried and is not worth a per-site guess that breaks with redesigns. */
    top: 16px;
    right: 16px;
    z-index: 2147483647;
  }

  /* Two layers. .pill is the thing that arrives and leaves, and carries the
     ring that pulses off it; .surface is the plate, clipped so the sheen
     can cross it. The ring has to live outside that clip.

     Every animation below runs once and ends on the element's ordinary
     style, so the resting pill is what the rules say with the keyframes
     ignored: reduced motion, or an engine that drops one, still shows the
     finished thing. Only transform, opacity and stroke-dashoffset move, so
     none of it costs the page a layout. */
  .pill {
    position: relative;
    border-radius: 999px;
    opacity: 0;
    transform: translateY(-8px) scale(0.96);
    transition:
      opacity 0.35s ease,
      transform 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }
  .pill.in {
    opacity: 1;
    transform: none;
  }
  /* The "you are covered" beat, borrowed from security software: one ring
     leaves the pill and fades, right as the check lands. */
  .pill::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: 0 0 0 1.5px #a2a8dc;
    opacity: 0;
    pointer-events: none;
    --delay: 0.75s;
    animation: ring 0.9s cubic-bezier(0.2, 0.7, 0.3, 1) var(--delay) backwards;
  }
  @keyframes ring {
    from {
      opacity: 0.7;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(1.14, 1.5);
    }
  }

  .surface {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 5px 4px 12px;
    border-radius: inherit;
    overflow: hidden;
    /* The brand plate, lit from the top left like the site's glass. */
    background: linear-gradient(160deg, #343750 0%, #24263a 60%, #1f2133 100%);
    /* Two rings, so the edge holds on any page: a light one inside for
       dark backgrounds, where the plate would otherwise melt in, and a
       dark one outside for light backgrounds. */
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.14),
      inset 0 0 0 1px rgb(255 255 255 / 0.12),
      0 0 0 1px rgb(0 0 0 / 0.5),
      0 10px 28px rgb(0 0 0 / 0.42),
      0 2px 6px rgb(0 0 0 / 0.3);
    color: #fff;
    font: 12px/1 system-ui, sans-serif;
    white-space: nowrap;
    transition: box-shadow 0.15s ease;
  }
  /* The scan: a band of light crosses the plate once, before the check. */
  .surface::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 45%;
    background: linear-gradient(
      100deg,
      transparent,
      rgb(255 255 255 / 0.16) 50%,
      transparent
    );
    opacity: 0;
    pointer-events: none;
    --delay: 0.25s;
    animation: sheen 0.75s ease-in-out var(--delay) backwards;
  }
  @keyframes sheen {
    from {
      opacity: 1;
      transform: translateX(-110%);
    }
    to {
      opacity: 1;
      transform: translateX(240%);
    }
  }

  svg {
    width: 16px;
    height: 16px;
    flex: none;
  }
  /* The mark with no plate of its own: the pill is the plate. A second
     container inside the pill's rounded end (a rounded square, then a
     disc) always read as one shape jammed into another. The outer two
     tiles fade into the pill at top and bottom, which is the same idea as
     the icon cropping them at its edge. */
  .logo {
    width: 11px;
    height: 22px;
    -webkit-mask-image: linear-gradient(#0000, #000 34%, #000 66%, #0000);
    mask-image: linear-gradient(#0000, #000 34%, #000 66%, #0000);
  }
  .name {
    font-family: 'Iowan Old Style', Charter, 'Bitstream Charter', 'Sitka Text',
      Cambria, Georgia, 'Times New Roman', serif;
    font-size: 14px;
    letter-spacing: -0.01em;
  }
  /* The check on a disc of the brand's lavender: a seal, not a glyph. The
     disc pops and then the tick is drawn into it. */
  .check {
    --delay: 0.62s;
    animation: pop 0.4s cubic-bezier(0.3, 1.6, 0.5, 1) var(--delay) backwards;
  }
  .check path {
    stroke-dasharray: 9;
    --delay: 0.8s;
    animation: draw 0.3s ease-out var(--delay) backwards;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.3);
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 9;
    }
  }

  button {
    all: unset;
    cursor: pointer;
  }
  .open {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-right: 4px;
  }
  /* Pointing at the name lights the whole pill's edge, so it reads as one
     button (the bell beside it has a highlight of its own). */
  .surface:has(.open:hover),
  .surface:has(.open:focus-visible) {
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.2),
      inset 0 0 0 1px rgb(162 168 220 / 0.7),
      0 0 0 1px rgb(0 0 0 / 0.5),
      0 10px 28px rgb(0 0 0 / 0.42),
      0 2px 6px rgb(0 0 0 / 0.3);
  }
  /* Set apart by a hairline: a different kind of action from the rest. */
  .off {
    display: flex;
    margin-left: 2px;
    padding: 5px;
    border-radius: 999px;
    color: rgb(255 255 255 / 0.45);
    position: relative;
  }
  .off::before {
    content: '';
    position: absolute;
    left: -3px;
    top: 5px;
    bottom: 5px;
    width: 1px;
    background: rgb(255 255 255 / 0.12);
  }
  .off:hover,
  .off:focus-visible {
    background: rgb(255 255 255 / 0.1);
    color: #fff;
  }

  @media (prefers-reduced-motion: reduce) {
    .pill {
      transition: opacity 0.2s ease;
      transform: none;
    }
    .pill::after,
    .surface::before,
    .check,
    .check path {
      animation: none;
    }
  }
`;

/**
 * The logo's three tiles, same geometry as scripts/icons.mjs. Built node by
 * node: several of these sites enforce Trusted Types, which rejects
 * innerHTML, and an <img> would need the icon exposed as a web accessible
 * resource (which lets any page detect the extension).
 */
function logo(): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'logo');
  // Cropped to the column of tiles: the icon's side margins were plate.
  svg.setAttribute('viewBox', '8 0 16 32');
  svg.setAttribute('aria-hidden', 'true');
  const rect = (
    x: number,
    y: number,
    size: number,
    rx: number,
    fill: string,
  ) => {
    const r = document.createElementNS(NS, 'rect');
    for (const [k, v] of Object.entries({
      x,
      y,
      width: size,
      height: size,
      rx,
    }))
      r.setAttribute(k, String(v));
    r.setAttribute('fill', fill);
    svg.append(r);
  };
  const TILE = '#a2a8dc';
  rect(9.4694, -8.4898, 13.0612, 4.0816, TILE);
  rect(9.4694, 27.4286, 13.0612, 4.0816, TILE);
  // The middle tile as a ring with a real hole (the icon files knock a
  // plate-coloured tile out of a filled one, which needs a plate behind).
  const ring = document.createElementNS(NS, 'rect');
  for (const [k, v] of Object.entries({
    x: 10.94,
    y: 10.94,
    width: 10.12,
    height: 10.12,
    rx: 2.6,
    fill: 'none',
    stroke: TILE,
    'stroke-width': 2.94,
  }))
    ring.setAttribute(k, String(v));
  svg.append(ring);
  return svg;
}

function check(): SVGElement {
  const svg = icon('check', 'M4.9 8.3l2.1 2.1 4.1-4.5', 1.7);
  const disc = document.createElementNS(svg.namespaceURI!, 'circle');
  for (const [k, v] of Object.entries({ cx: 8, cy: 8, r: 7.5 }))
    disc.setAttribute(k, String(v));
  disc.setAttribute('fill', '#a2a8dc');
  disc.setAttribute('stroke', 'none');
  svg.prepend(disc);
  svg.setAttribute('stroke', '#1f2133');
  return svg;
}

/** A struck-through bell: the usual sign for silencing a notification. */
function bellOff(): SVGElement {
  return icon(
    'bell',
    'M8 2.6a3.4 3.4 0 0 0-3.4 3.4v2.3L3.4 10.6h9.2L11.4 8.3V6A3.4 3.4 0 0 0 8 2.6Z' +
      'M6.7 12.6a1.4 1.4 0 0 0 2.6 0M2.8 2.8l10.4 10.4',
    1.3,
  );
}

/** A 16px line icon in the current text colour. */
function icon(name: string, d: string, width: number): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', name);
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(width));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

function render() {
  const host = document.createElement('div');
  // Closed, so the page's own scripts and styles cannot reach in.
  const root = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = CSS;

  const pill = document.createElement('div');
  pill.className = 'pill';
  pill.setAttribute('role', 'status');

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = 'Not for You';

  // The pill itself opens the popup, where every setting lives.
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'open';
  // No tooltip: the pill is on screen for five seconds and a label popping
  // up under it is a second thing to read. The check stands for "is on",
  // which the label spells out for screen readers.
  open.setAttribute('aria-label', 'Not for You is on. Open its settings.');
  open.append(logo(), name, check());

  const off = document.createElement('button');
  off.type = 'button';
  off.className = 'off';
  // An icon rather than words, so the pill stays the size of its message;
  // the tooltip carries the words.
  off.title = 'Stop showing this reminder';
  off.setAttribute('aria-label', off.title);
  off.append(bellOff());

  const surface = document.createElement('div');
  surface.className = 'surface';
  surface.append(open, off);
  pill.append(surface);
  root.append(style, pill);
  // On <html>, not <body>: these apps replace body children freely.
  document.documentElement.append(host);

  let timer = 0;
  const leave = () => {
    pill.classList.remove('in');
    setTimeout(() => host.remove(), 500);
  };
  const arm = () => {
    timer = window.setTimeout(leave, VISIBLE_MS);
  };
  // Pointing at it holds it open, so the button is reachable.
  pill.addEventListener('mouseenter', () => clearTimeout(timer));
  pill.addEventListener('mouseleave', arm);
  open.addEventListener('click', () => {
    void browser.runtime.sendMessage(OPEN_POPUP);
    clearTimeout(timer);
    leave();
  });
  off.addEventListener('click', () => {
    void reminders.setValue(false);
    clearTimeout(timer);
    leave();
  });

  requestAnimationFrame(() => {
    pill.classList.add('in');
    arm();
  });
}
