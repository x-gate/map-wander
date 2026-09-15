import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
});
