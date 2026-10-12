// One origin serves both HTML and assets. Restart/rebuild on source changes.
process.env.API_PORT = process.env.DEV_PORT || '5173';
await import('./build.mjs');
await import('./index.mjs');
