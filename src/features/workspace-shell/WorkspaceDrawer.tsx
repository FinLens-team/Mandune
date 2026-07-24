import { useRef } from "react";
import {
  BriefcaseBusiness,
  CircleHelp,
  History,
  Home,
  Lock,
  X,
} from "lucide-react";
import type { WorkspacePublicStatus } from "../../workspace/index.js";
import { DemoBadge, IconButton, LockBadge } from "../../client/ui/index.js";
import { handleOverlayKeyDown, useOverlayFocus } from "./focus.js";

export type WorkspaceView = "home" | "portfolio";

export interface WorkspaceDrawerProps {
  open: boolean;
  currentView: WorkspaceView;
  workspace: WorkspacePublicStatus | null;
  reduceMotion: boolean;
  returnFocus: HTMLElement | null;
  onClose: () => void;
  onNavigate: (view: WorkspaceView) => void;
  onNavigateHistory: () => void;
  onNavigateAbout: () => void;
  onReduceMotionChange: (enabled: boolean) => void;
}

export function formatWorkspaceTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function WorkspaceDrawer(props: WorkspaceDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  useOverlayFocus({
    open: props.open,
    focusScopeRef: drawerRef,
    returnFocus: props.returnFocus,
  });

  if (!props.open) return null;

  function navigate(action: () => void) {
    action();
    props.onClose();
  }

  return (
    <div className="workspace-drawer-layer" data-reduce-motion={props.reduceMotion || undefined}>
      <button
        aria-label="关闭导航菜单"
        className="workspace-drawer__backdrop"
        onClick={props.onClose}
        tabIndex={-1}
        type="button"
      />
      <aside
        aria-label="工作区导航"
        aria-modal="true"
        className="workspace-drawer"
        onKeyDown={(event) => {
          if (drawerRef.current) {
            handleOverlayKeyDown(event, drawerRef.current, props.onClose);
          }
        }}
        ref={drawerRef}
        role="dialog"
      >
        <header className="workspace-drawer__header">
          <div>
            <strong>满懂</strong>
            <span>匿名私密工作区</span>
          </div>
          <IconButton
            data-initial-focus="true"
            icon={X}
            label="关闭导航菜单"
            onClick={props.onClose}
            tooltip="关闭"
          />
        </header>

        <div className="workspace-drawer__identity">
          <DemoBadge />
        </div>

        <nav className="workspace-drawer__nav" aria-label="主要导航">
          <button
            aria-current={props.currentView === "home" ? "page" : undefined}
            onClick={() => navigate(() => props.onNavigate("home"))}
            type="button"
          >
            <Home aria-hidden="true" size={20} />
            <span>主页</span>
          </button>
          <button
            aria-current={props.currentView === "portfolio" ? "page" : undefined}
            onClick={() => navigate(() => props.onNavigate("portfolio"))}
            type="button"
          >
            <BriefcaseBusiness aria-hidden="true" size={20} />
            <span>仓位／身份</span>
          </button>
          <button onClick={() => navigate(props.onNavigateHistory)} type="button">
            <History aria-hidden="true" size={20} />
            <span>历史记录</span>
          </button>
          <button onClick={() => navigate(props.onNavigateAbout)} type="button">
            <CircleHelp aria-hidden="true" size={20} />
            <span>关于项目</span>
          </button>
          <button aria-disabled="true" className="is-locked" type="button">
            <Lock aria-hidden="true" size={20} />
            <span>更多观察方式</span>
            <LockBadge />
          </button>
        </nav>

        <footer className="workspace-drawer__footer">
          {props.workspace ? (
            <dl>
              <div>
                <dt>最后活动</dt>
                <dd>{formatWorkspaceTime(props.workspace.last_active_at)}</dd>
              </div>
              <div>
                <dt>预计删除</dt>
                <dd>{formatWorkspaceTime(props.workspace.expires_at)}</dd>
              </div>
            </dl>
          ) : (
            <p>正在读取工作区保留时间。</p>
          )}
          <p>30 天无活动后自动删除；不提供账号或跨设备找回。</p>
          <label className="workspace-drawer__toggle">
            <input
              checked={props.reduceMotion}
              onChange={(event) => props.onReduceMotionChange(event.target.checked)}
              type="checkbox"
            />
            <span>减少动态效果</span>
          </label>
        </footer>
      </aside>
    </div>
  );
}
