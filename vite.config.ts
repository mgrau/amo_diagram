import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import packageJson from "./package.json";

export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), svelte()],
  define: {
    PACKAGE_VERSION: JSON.stringify(packageJson.version)
  },
  worker: {
    format: "es"
  },
  optimizeDeps: {
    include: [
      "mathjax-full/js/mathjax.js",
      "mathjax-full/js/input/tex.js",
      "mathjax-full/js/input/tex/AllPackages.js",
      "mathjax-full/js/output/svg.js",
      "mathjax-full/js/adaptors/liteAdaptor.js",
      "mathjax-full/js/handlers/html.js"
    ]
  }
});
