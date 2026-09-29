import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const serverPort = Number(env.SERVER_PORT || 3001);
  return {
    plugins: [react()],
    base: env.VITE_GITHUB_PAGES === "true" ? "/vibe_workcheck/" : "/",
    server: {
      host: "0.0.0.0",
      port: Number(env.CLIENT_PORT || 228),
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${serverPort}`,
          changeOrigin: true
        }
      }
    }
  };
});
