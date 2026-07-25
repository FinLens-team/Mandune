import { useEffect, useRef } from "react";
import {
  BriefcaseBusiness,
  CircleHelp,
  History,
  Home,
  LibraryBig,
  SwatchBook,
} from "lucide-react";
import { BrandLockup } from "../../client/ui/index.js";
import { handleOverlayKeyDown, useOverlayFocus, useOverlayPresence } from "./focus.js";

export type WorkspaceView = "home" | "portfolio";

/** All destinations reachable from the persistent workspace drawer. */
export type WorkspacePage = "home" | "portfolio" | "history" | "atlas" | "theme" | "about" | "analysis";

export interface WorkspaceDrawerProps {
  open: boolean;
  currentPage: WorkspacePage;
  reduceMotion: boolean;
  returnFocus: HTMLElement | null;
  onClose: () => void;
  onNavigateHome: () => void;
  onNavigatePortfolio: () => void;
  onNavigateHistory: () => void;
  onNavigateAtlas?: () => void;
  onNavigateTheme: () => void;
  onNavigateAbout: () => void;
}

export function WorkspaceDrawer(props: WorkspaceDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const presence = useOverlayPresence(props.open, props.reduceMotion ? 100 : 220);
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

  if (!presence.present) return null;

  function navigate(action: (() => void) | undefined) {
    action?.();
    props.onClose();
  }

  const items: Array<{
    action: (() => void) | undefined;
    icon: typeof Home;
    label: string;
    page: WorkspacePage;
  }> = [
    { action: props.onNavigateHome, icon: Home, label: "主页", page: "home" },
    { action: props.onNavigatePortfolio, icon: BriefcaseBusiness, label: "数据管理", page: "portfolio" },
    { action: props.onNavigateHistory, icon: History, label: "历史记录", page: "history" },
    { action: props.onNavigateAtlas, icon: LibraryBig, label: "满懂图鉴", page: "atlas" },
    { action: props.onNavigateTheme, icon: SwatchBook, label: "主题切换", page: "theme" },
    { action: props.onNavigateAbout, icon: CircleHelp, label: "关于项目", page: "about" },
  ];

  return (
    <div
      className="workspace-drawer-layer"
      data-reduce-motion={props.reduceMotion || undefined}
      data-state={presence.phase}
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
          <p className="workspace-drawer__title">让持仓分析 像刷梗一样自然</p>
        </header>

        <nav className="workspace-drawer__nav" aria-label="主要导航">
          {items.map(({ action, icon: Icon, label, page }) => (
            <button
              aria-current={props.currentPage === page ? "page" : undefined}
              data-initial-focus={
                props.currentPage === page || (props.currentPage === "analysis" && page === "home")
                  ? "true"
                  : undefined
              }
              key={page}
              onClick={() => navigate(action)}
              type="button"
            >
              <Icon aria-hidden="true" size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <footer className="workspace-drawer__footer">
          <BrandLockup compact />
        </footer>
      </aside>
    </div>
  );
}
