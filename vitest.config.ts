import { defineConfig } from "vitest/config";

const root = import.meta.dirname.replace(/\\/g, "/");

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${root}/` }],
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
