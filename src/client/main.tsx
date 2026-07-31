import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
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

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Mandune render failure", error, info.componentStack);
  }

  override render() {
    if (this.state.failed) {
      return (
        <main className="app-render-error" role="alert">
          <h1>页面组件加载失败</h1>
          <p>工作区数据仍然保留，请刷新后重试。</p>
          <button onClick={() => window.location.reload()} type="button">刷新页面</button>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      {isExpoScreen ? <ExpoApp /> : <App />}
    </AppErrorBoundary>
  </StrictMode>,
);
