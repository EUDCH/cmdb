import { defineConfig } from "astro/config";
import node from "@astrojs/node";

export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  server: {
    host: "127.0.0.1",
    port: 4321,
  },
  vite: {
    server: {
      // Allow tailnet / mDNS hostnames so the dev server can sit behind
      // `tailscale serve` or be reached via `<host>.local`. Has no effect
      // in production builds.
      allowedHosts: [".ts.net", ".local", "localhost", "127.0.0.1"],
      watch: {
        ignored: ["**/node_modules/**", "**/.git/**"],
      },
    },
  },
});
