import { toast } from './toast';

/**
 * DevTools hosts extension panels in an iframe where the async Clipboard API is often blocked
 * by permissions policy, so fall back to a hidden textarea + execCommand.
 */
export async function copyText(text: string, what = 'Copied to clipboard'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast(what);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    toast(ok ? what : 'Copy failed: the browser blocked clipboard access', ok ? 'info' : 'error');
    return ok;
  }
}
