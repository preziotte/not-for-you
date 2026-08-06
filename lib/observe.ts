/**
 * Run `enforce` now and after every DOM change, debounced to one call per
 * animation frame. Returns the schedule function so callers can also hook
 * it to settings changes. Used by the DOM-tier platforms, whose SPAs
 * re-render constantly and resurrect state we've overridden.
 */
export function enforceOnMutations(enforce: () => void): () => void {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      enforce();
    });
  };

  const start = () => {
    new MutationObserver(schedule).observe(document.body, {
      childList: true,
      subtree: true,
    });
    schedule();
  };
  // document_start scripts run before <body> exists.
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
  return schedule;
}
