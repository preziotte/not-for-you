import { defineContentScript } from '#imports';
import { matchesFor } from '../lib/platforms';
import { watchSpaNavigation } from '../lib/spa';

export default defineContentScript({
  matches: matchesFor('threads'),
  runAt: 'document_start',
  main() {
    watchSpaNavigation('threads', (url) =>
      url.pathname === '/' ? '/following' : null,
    );
  },
});
