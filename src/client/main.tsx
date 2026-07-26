import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ExpoApp } from "./ExpoApp";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

const isExpoScreen = window.location.hostname === "expo.wuxie233.com"
  || window.location.pathname === "/expo";

createRoot(rootElement).render(
  <StrictMode>
    {isExpoScreen ? <ExpoApp /> : <App />}
  </StrictMode>,
);
