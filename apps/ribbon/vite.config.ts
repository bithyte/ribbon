import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    // The @ribbon/* packages are devDependencies, so they're bundled in; dependencies stay external.
    entry: ["src/cli.ts"],
    platform: "node",
    target: "node24",
  },
});
