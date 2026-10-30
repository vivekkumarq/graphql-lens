import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };
import manifest from './manifest.json' with { type: 'json' };

// package.json is the single source of the version; the manifest gets it at build time.
function manifestPlugin(): Plugin {
  return {
    name: 'graphql-lens-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify({ ...manifest, version: pkg.version }, null, 2),
      });
    },
  };
}

// dist/ is the unpacked extension: public/ (icons, locales) is copied to its root,
// and each HTML entry becomes an extension page next to it.
export default defineConfig(({ mode }) => ({
  plugins: [react(), manifestPlugin()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: mode === 'development',
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      input: { devtools: 'devtools.html', panel: 'panel.html' },
    },
  },
  worker: { format: 'es' },
  test: {
    include: ['tests/**/*.test.ts?(x)'],
    passWithNoTests: true,
  },
}));
