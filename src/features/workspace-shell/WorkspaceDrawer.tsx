import { useEffect, useRef } from "react";
import {
  BriefcaseBusiness,
  CircleHelp,
  History,
  Home,
} from "lucide-react";
import { BrandLockup } from "../../client/ui/index.js";
import { handleOverlayKeyDown, useOverlayFocus } from "./focus.js";

export type WorkspaceView = "home" | "portfolio";

export interface WorkspaceDrawerProps {
  open: boolean;
  currentView: WorkspaceView;
  reduceMotion: boolean;
  returnFocus: HTMLElement | null;
  onClose: () => void;
  onNavigate: (view: WorkspaceView) => void;
  onNavigateHistory: () => void;
  onNavigateAtlas?: () => void;
  onNavigateAbout: () => void;
}

export function WorkspaceDrawer(props: WorkspaceDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const presence = useOverlayPresence(props.open, props.reduceMotion ? 100 : 180);
  useOverlayFocus({
    open: presence.present,
    focusScopeRef: drawerRef,
    returnFocus: props.returnFocus,
  });

  // Global Escape fallback — ensures close even if focus is outside the aside
  useEffect(() => {
    if (!props.open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props.open, props.onClose]);

  if (!props.open) return null;

  function navigate(action: () => void) {
    action();
    props.onClose();
  }

  return (
    <div
      className="workspace-drawer-layer"
      data-reduce-motion={props.reduceMotion || undefined}
      data-state="open"
    >
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
            <BrandLockup compact />
            <span>匿名私密工作区</span>
          </div>
        </header>

        <nav className="workspace-drawer__nav" aria-label="主要导航">
          <button
            aria-current={props.currentView === "home" ? "page" : undefined}
            data-initial-focus={props.currentView === "home" ? "true" : undefined}
            onClick={() => navigate(() => props.onNavigate("home"))}
            type="button"
          >
            <Home aria-hidden="true" size={20} />
            <span>主页</span>
          </button>
          <button
            aria-current={props.currentView === "portfolio" ? "page" : undefined}
            data-initial-focus={props.currentView === "portfolio" ? "true" : undefined}
            onClick={() => navigate(() => props.onNavigate("portfolio"))}
            type="button"
          >
            <BriefcaseBusiness aria-hidden="true" size={20} />
            <span>数据管理</span>
          </button>
          <button onClick={() => navigate(props.onNavigateHistory)} type="button">
            <History aria-hidden="true" size={20} />
            <span>历史记录</span>
          </button>
          <button onClick={() => navigate(() => props.onNavigateAtlas?.())} type="button">
            <LibraryBig aria-hidden="true" size={20} />
            <span>满懂图鉴</span>
          </button>
          <button onClick={() => navigate(props.onNavigateAbout)} type="button">
            <CircleHelp aria-hidden="true" size={20} />
            <span>关于项目</span>
          </button>
        </nav>
      </aside>
    </div>
  );
}
