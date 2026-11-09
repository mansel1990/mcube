import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/mlive/**/*.test.ts", "components/mlive/**/*.test.ts", "engine/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
