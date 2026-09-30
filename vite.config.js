import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "renderer",
  base: "./",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true, target: "chrome130" },
  server: { port: 5173, strictPort: true },
});
