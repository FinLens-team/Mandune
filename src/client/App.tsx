import { useEffect, useState } from "react";
import { ReviewPage } from "../features/review/ReviewPage";

interface WorkspaceStatus {
  workspace_id: string;
  last_active_at: string;
  expires_at: string;
  ttl_days: number;
}

function formatTime(value: string): string {
  try {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return value;
  }
}

export function App() {
  const [workspace, setWorkspace] = useState<WorkspaceStatus | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function ensureWorkspace(): Promise<void> {
      try {
        const current = await fetch("/api/workspaces/current", {
          credentials: "same-origin",
        });
        if (current.ok) {
          const body = (await current.json()) as { workspace: WorkspaceStatus };
          if (!cancelled) {
            setWorkspace(body.workspace);
            setWorkspaceError(null);
          }
          await fetch("/api/workspaces/current/activity", {
            method: "POST",
            credentials: "same-origin",
          });
          return;
        }

        const created = await fetch("/api/workspaces", {
          method: "POST",
          credentials: "same-origin",
        });
        if (!created.ok) {
          throw new Error("workspace_create_failed");
        }
        const body = (await created.json()) as { workspace: WorkspaceStatus };
        if (!cancelled) {
          setWorkspace(body.workspace);
          setWorkspaceError(null);
        }
      } catch {
        if (!cancelled) {
          setWorkspaceError("无法建立私密工作区");
        }
      }
    }

    void ensureWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

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
          {workspace
            ? `私密工作区 · 预计删除 ${formatTime(workspace.expires_at)}`
            : workspaceError
              ? workspaceError
              : "正在准备私密工作区…"}
        </p>
      </header>

      <main id="main" className="main">
        <section className="intro" aria-labelledby="intro-heading">
          <p className="eyebrow">每日持仓复盘</p>
          <h2 id="intro-heading">先确认持仓，再进入证据边界</h2>
          <p className="intro-copy">
            示例与手工录入进入同一复核页。只有可用行可写入不可变快照；四项约束允许全部未知。
            {workspace ? (
              <>
                {" "}
                最后活动：{formatTime(workspace.last_active_at)}。
              </>
            ) : null}
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
