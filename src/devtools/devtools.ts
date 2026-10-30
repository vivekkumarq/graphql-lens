import { APP_NAME } from '../shared/constants';

// Runs once per DevTools window: register the panel and tell it when it is on screen,
// so background work (WebSocket polling) pauses while another DevTools tab is showing.
chrome.devtools.panels.create(APP_NAME, 'icons/16.png', 'panel.html', (panel) => {
  let win: Window | undefined;
  const notify = (visible: boolean) => {
    try {
      win?.dispatchEvent(new CustomEvent('graphql-lens:visibility', { detail: visible }));
    } catch {
      /* panel window not reachable; it then assumes it is visible */
    }
  };
  panel.onShown.addListener((w) => {
    win = w;
    notify(true);
  });
  panel.onHidden.addListener(() => notify(false));
});
