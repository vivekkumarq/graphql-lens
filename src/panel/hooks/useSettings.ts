import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  onSettingsChanged,
  sanitizeSettings,
  saveSettings,
  type Settings,
} from '../../storage/settings';

/** Settings from chrome.storage.local, kept in sync across open DevTools windows. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void loadSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
    return onSettingsChanged(setSettings);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = sanitizeSettings({ ...prev, ...patch });
      void saveSettings(next).catch(() => undefined);
      return next;
    });
  }, []);

  return { settings, update, loaded };
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Resolve "system" against DevTools' own theme first, then the OS. */
export function useTheme(setting: Settings['theme']) {
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const devtools = globalThis.chrome?.devtools?.panels?.themeName;
      const resolved =
        setting !== 'system'
          ? setting
          : devtools === 'dark'
            ? 'dark'
            : devtools === 'default'
              ? 'light'
              : media.matches
                ? 'dark'
                : 'light';
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [setting]);
}
