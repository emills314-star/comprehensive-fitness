import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const root = document.getElementById("redesign-root");

if (!root) throw new Error("Missing #redesign-root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
