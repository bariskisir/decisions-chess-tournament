// Configures Vite to build the React benchmark arena with local engine assets.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
