// Mounts the decisions-chess React arena.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element.");

/** Renders the benchmark application with strict checks in development. */
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
