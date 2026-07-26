import { useEffect, useState } from "react";
import mandongLogo from "./assets/mandong-logo.webp";
import "./expo.css";

const METRICS_URL = "/api/metrics/today";

interface MetricsSnapshot {
  date: string;
  visits: number;
  workspace_creations: number;
  review_starts: number;
  service_uses: number;
  updated_at: string | null;
}

function blankMetrics(): MetricsSnapshot {
  return {
    date: "",
    visits: 0,
    workspace_creations: 0,
    review_starts: 0,
    service_uses: 0,
    updated_at: null,
  };
}

export function ExpoApp() {
  const [metrics, setMetrics] = useState<MetricsSnapshot>(blankMetrics);
  const [online, setOnline] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(METRICS_URL, { cache: "no-store" });
        if (!response.ok) throw new Error("metrics unavailable");
        const body = await response.json() as { metrics: MetricsSnapshot };
        if (!active) return;
        setMetrics(body.metrics);
        setOnline(true);
        setUpdatedAt(new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "Asia/Shanghai",
        }));
      } catch {
        if (active) setOnline(false);
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 5_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main className="expo-screen">
      <section className="expo-data" aria-labelledby="expo-heading">
        <div className="expo-topline">
          <img className="expo-logo" src={mandongLogo} alt="满懂 Mandune" />
          <span className={`expo-live ${online ? "is-online" : ""}`}>
            <span aria-hidden="true" />
            {online ? "实时数据" : "等待连接"}
          </span>
        </div>
        <div className="expo-title-block">
          <p className="expo-kicker">今日现场</p>
          <h1 id="expo-heading">让每一次复盘<br />都留下证据</h1>
          <p className="expo-date">{metrics.date || "上海时间"}</p>
        </div>
        <div className="expo-metrics" aria-live="polite">
          <div className="expo-metric expo-metric--primary">
            <span className="expo-metric__label">今日访问</span>
            <strong>{metrics.visits.toLocaleString("zh-CN")}</strong>
            <span className="expo-metric__unit">位独立访客</span>
          </div>
          <div className="expo-metric">
            <span className="expo-metric__label">今日服务使用</span>
            <strong>{metrics.service_uses.toLocaleString("zh-CN")}</strong>
            <span className="expo-metric__unit">次有效操作</span>
          </div>
        </div>
        <div className="expo-breakdown">
          <span>工作区创建 <b>{metrics.workspace_creations.toLocaleString("zh-CN")}</b></span>
          <span>新复盘启动 <b>{metrics.review_starts.toLocaleString("zh-CN")}</b></span>
        </div>
        <p className="expo-updated">上海时间 · {updatedAt ? `更新于 ${updatedAt}` : "数据加载中"}</p>
      </section>
      <aside className="expo-qr-panel" aria-label="扫码体验 Mandune">
        <div className="expo-qr-frame">
          <img src="/mandune-qr.png" alt="扫码打开 Mandune 正式站" width="520" height="520" />
        </div>
        <p className="expo-qr-title">扫码开始一次<br /><strong>带证据的复盘</strong></p>
        <p className="expo-qr-url">mandune.wuxie233.com</p>
      </aside>
    </main>
  );
}
