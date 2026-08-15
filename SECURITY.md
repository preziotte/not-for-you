# Security

Not for You runs on eight social platforms with permission to read and change
their pages, so a flaw here matters more than the extension's size suggests.
Reports are welcome, including from people who found it by accident.

## Reporting

Email **mat.preziotte@gmail.com** with "Not for You security" in the subject.
Please do not open a public issue for anything exploitable.

Useful to include, as much as you have:

- What an attacker gets, and roughly how
- The platform and page it happens on
- Extension version (bottom of `chrome://extensions` or `about:addons`) and
  browser version
- Any proof of concept, even a rough one

This is a one-person project, so expect a reply within a few days rather than
a few hours. If a fix is warranted it goes out as a store update, and both
stores review it before users get it, which usually adds a day or two. You
will get credit in the changelog unless you would rather not.

## Supported versions

Only the current release is supported. Both stores update automatically, so
in practice everyone is on it within a day or so of publication.

## Scope

In scope is anything in this repository: the background script, the content
scripts, the popup, and the site under `site/`.

A few things are known and deliberate rather than vulnerabilities:

- **Broad host permissions.** The extension asks for access to every platform
  it supports because it has to read and modify those pages. They are listed
  in `lib/platforms.ts` and are the only hosts requested.
- **Broken selectors.** Platforms change their markup constantly and options
  stop working. That is a bug, not a security issue.
  [Open an issue](https://github.com/preziotte/not-for-you/issues) instead.
- **Settings sync.** Settings live in the browser's own extension storage and
  ride the browser's sync if you have it on. No server of ours ever sees them.
