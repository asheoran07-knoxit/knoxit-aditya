import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@db": fileURLToPath(new URL("./lib/db/src", import.meta.url)),
      "@api-zod": fileURLToPath(new URL("./lib/api-zod/src", import.meta.url)),
      "@server": fileURLToPath(new URL("./server/src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.{ts,tsx}"],
    setupFiles: "./src/tests/setup.ts"
  }
});
