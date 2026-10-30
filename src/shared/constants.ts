declare const __APP_VERSION__: string;

// The product name lives in public/_locales/en/messages.json, so renaming is a one-file change.
export const APP_NAME = globalThis.chrome?.i18n?.getMessage('appName') || 'GraphQL Lens';
export const APP_VERSION = __APP_VERSION__;
export const TAGLINE = 'Inspect. Debug. Understand GraphQL traffic.';
