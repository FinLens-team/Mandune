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
          工程基线已就绪
        </p>
      </header>

      <main id="main" className="main">
        <section className="intro" aria-labelledby="intro-heading">
          <p className="eyebrow">每日持仓复盘</p>
          <h2 id="intro-heading">从确认的持仓与证据开始</h2>
          <p className="intro-copy">
            满懂将逐步接入组合整理、证据核对与每日复盘。当前版本提供稳定的应用入口与服务基线。
          </p>
        </section>

        <aside className="boundary" aria-labelledby="boundary-heading">
          <h2 id="boundary-heading">当前边界</h2>
          <p>尚未接入私人持仓、外部数据或模型服务。</p>
        </aside>
      </main>

      <footer className="footer">
        <p>满懂 · 不构成投资建议</p>
      </footer>
    </div>
  );
}
