import path from "node:path";
import { defineConfig } from "vitest/config";

// Kept separate from vite.config.js so tests don't load the Base44 plugin.
// The function imports the SDK the Deno way ("npm:..."); tests swap in a stub.
export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(import.meta.dirname, "src") },
      { find: /^npm:@base44\/sdk.*$/, replacement: path.resolve(import.meta.dirname, "test/sdk-stub.js") },
    ],
  },
  test: { include: ["src/**/*.test.js", "base44/**/*.test.js"] },
});
