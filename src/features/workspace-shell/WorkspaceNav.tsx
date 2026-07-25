import { useState } from "react";
import { Menu } from "lucide-react";
import { IconButton } from "../../client/ui/index.js";
import { WorkspaceDrawer, type WorkspacePage } from "./WorkspaceDrawer.js";
import "./styles.css";

export interface WorkspaceNavProps {
  currentPage: Exclude<WorkspacePage, "home" | "portfolio">;
  reduceMotion?: boolean;
  onNavigateHome: () => void;
  onNavigatePortfolio: () => void;
  onNavigateHistory: () => void;
  onNavigateAtlas?: () => void;
  onNavigateTheme: () => void;
  onNavigateAbout: () => void;
}

/**
 * Persistent workspace navigation for analysis and secondary pages: the same
 * floating menu button + drawer that the data management view uses.
 */
export function WorkspaceNav({
  currentPage,
  reduceMotion = false,
  onNavigateHome,
  onNavigatePortfolio,
  onNavigateHistory,
  onNavigateAtlas,
  onNavigateTheme,
  onNavigateAbout,
}: WorkspaceNavProps) {
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);

  return (
    <>
      <div className="workspace-shell__menu">
        <IconButton
          icon={Menu}
          label="打开工作区导航"
          onClick={(event) => {
            setTrigger(event.currentTarget);
            setOpen(true);
          }}
          tooltip="工作区导航"
        />
      </div>
      <WorkspaceDrawer
        currentPage={currentPage}
        onClose={() => setOpen(false)}
        onNavigateAbout={onNavigateAbout}
        onNavigateAtlas={onNavigateAtlas}
        onNavigateHistory={onNavigateHistory}
        onNavigateTheme={onNavigateTheme}
        onNavigateHome={onNavigateHome}
        onNavigatePortfolio={onNavigatePortfolio}
        open={open}
        reduceMotion={reduceMotion}
        returnFocus={trigger}
      />
    </>
  );
}
