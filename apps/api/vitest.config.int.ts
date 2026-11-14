import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.int-spec.ts'],
    // The suites share one database; run them one after another.
    fileParallelism: false,
  },
});
