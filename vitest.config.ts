import { defineConfig } from 'vitest/config';

// Stops vitest from walking up to the governance root's vitest.config.ts.
// The source repository has no vitest config; this reproduces its defaults,
// restricted to test/ as its `npm test` script (`vitest run --dir test`) does.
export default defineConfig({
  test: { dir: 'test' },
});
