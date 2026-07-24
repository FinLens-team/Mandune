import { ReviewPage } from "../features/review/ReviewPage";

export function App() {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p className="brand-kicker">Mandong</p>
            <h1 className="brand-title">满懂</h1>
          </div>
        </div>
        <p className="workspace-status">
          <span className="status-dot" aria-hidden="true" />
          组合复核已开放
        </p>
      </header>

      <main id="main" className="main">
        <section className="intro" aria-labelledby="intro-heading">
          <p className="eyebrow">每日持仓复盘</p>
          <h2 id="intro-heading">先确认持仓，再进入证据边界</h2>
          <p className="intro-copy">
            示例与手工录入进入同一复核页。只有可用行可写入不可变快照；四项约束允许全部未知。
          </p>
        </section>

        <div className="review-column">
          <ReviewPage />
        </div>
      </main>

      <footer className="footer">
        <p>满懂 · 不构成投资建议</p>
      </footer>
    </div>
  );
}
