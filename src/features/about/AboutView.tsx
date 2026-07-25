import {
  ChevronDown,
  Clock3,
  Database,
  ExternalLink,
  House,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import type { WorkspacePublicStatus } from "../../workspace/index.js";
import {
  Badge,
  Button,
} from "../../client/ui/index.js";
import type { HistoryAvailability } from "../history-view/HistoryView.js";

export interface AboutViewProps {
  availability?: HistoryAvailability;
  experienceSource?: string;
  onRequestDeleteWorkspace?: () => void;
  workspace: WorkspacePublicStatus | null;
}

const PROJECT_REPO_URL = "https://github.com/FinLens-team/finlens";
const PROJECT_REPO_NAME = "FinLens-team/finlens";

interface DeveloperEntry {
  handle: string;
  role: string;
  url: string;
}

const DEVELOPERS: DeveloperEntry[] = [
  { handle: "Wuxie233", role: "发起人 · Owner", url: "https://github.com/Wuxie233" },
  { handle: "eviaaaaa", role: "开发者", url: "https://github.com/eviaaaaa" },
  { handle: "johnq-sketch", role: "开发者", url: "https://github.com/johnq-sketch" },
  { handle: "suli062777-oss", role: "开发者", url: "https://github.com/suli062777-oss" },
];

function GithubMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="currentColor"
      height={size}
      viewBox="0 0 16 16"
      width={size}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function formatWorkspaceTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function experienceSourceLabel(value: string): string {
  if (value === "edited") return "体验持仓 · 已编辑";
  if (value === "random") return "随机体验身份 · 示例数据";
  return value;
}

interface AboutTopic {
  body: ReactNode;
  gist: string;
  icon: ReactNode;
  id: string;
  title: string;
}

const TOPICS: AboutTopic[] = [
  {
    id: "boundary",
    icon: <ShieldCheck aria-hidden="true" size={20} />,
    title: "不是投资建议，也不替你交易",
    gist: "只给可追溯的方向性复盘，判断和操作由你决定",
    body: (
      <p>满懂只提供可追溯的方向性复盘，不提供精确金额、份额、比例、价格或交易时点，不保证收益、回撤、胜率或市场结果，也不连接券商、持有资金或执行交易。它不构成持牌投资意见，所有判断和操作仍由你决定。</p>
    ),
  },
  {
    id: "private",
    icon: <Database aria-hidden="true" size={20} />,
    title: "匿名私密工作区",
    gist: "持仓与复盘不进公开页面、URL 或默认日志",
    body: (
      <>
        <p>公开应用入口不会公开或授予他人访问当前工作区的持仓、约束、复盘与历史。私人持仓不会进入公开页面、URL 或默认日志。无需账号，但也不支持跨设备找回。</p>
        <p>如果未来启用截图提取，原始截图会在提取成功、失败或中止后删除，不进入历史、分析证据或默认日志；Demo V1 的截图入口仍未开放。</p>
      </>
    ),
  },
  {
    id: "retention",
    icon: <Clock3 aria-hidden="true" size={20} />,
    title: "30 天无活动后自动删除",
    gist: "活动会刷新保留期，也可以随时主动删除",
    body: (
      <p>每次活动都会刷新保留期；连续 30 天无活动后，系统自动删除持仓、约束、复盘与历史。你也可以在到期前主动删除，删除后无法通过正常产品路径恢复。</p>
    ),
  },
  {
    id: "example",
    icon: <House aria-hidden="true" size={20} />,
    title: "示例、缓存与证据时点",
    gist: "示例是虚构数据，证据都标注观察时点",
    body: (
      <>
        <p>随机体验身份是虚构示例，不是你的真实持仓或系统推荐约束。缓存或 fixture 证据必须保留原始观察时间、获取时间和证据截止时点，并明确标为非实时；它们不证明供应商当前可用。</p>
        <p>历史复盘只读取当时保存的快照、证据和结果，不会用后来数据静默改写或重算旧结论。</p>
      </>
    ),
  },
];

export function AboutView({
  availability = "active",
  experienceSource,
  onRequestDeleteWorkspace,
  workspace,
}: AboutViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <article className="about-view" aria-labelledby="about-heading">
      <header className="about-view__header">
        {experienceSource ? (
          <Badge tone="observed">{experienceSourceLabel(experienceSource)}</Badge>
        ) : (
          <Badge tone="observed">每日持仓复盘</Badge>
        )}
        <h1 id="about-heading" ref={headingRef} tabIndex={-1}>关于满懂</h1>
        <p>满懂帮助轻投资者把已确认的持仓、个人约束和带时点证据整理成可核对的方向性复盘。</p>
        <p className="about-view__hint">以下说明按主题收起，点开你关心的条目查看完整细节。</p>
      </header>

      <section
        className="about-card about-status"
        aria-labelledby="about-status-heading"
        style={{ "--item-index": 0 } as CSSProperties}
      >
        <div className="about-card__heading">
          <h3 id="about-status-heading">当前工作区</h3>
          <span>30 天无活动自动删除</span>
        </div>
        {availability === "active" && workspace ? (
          <dl className="about-workspace-times">
            <div><dt>最后活动</dt><dd><time dateTime={workspace.last_active_at}>{formatWorkspaceTime(workspace.last_active_at)}</time></dd></div>
            <div><dt>预计删除</dt><dd><time dateTime={workspace.expires_at}>{formatWorkspaceTime(workspace.expires_at)}</time></dd></div>
          </dl>
        ) : (
          <p className="about-workspace-state" role="status">
            {availability === "expired"
              ? "此工作区已到期并完成自动清理。"
              : availability === "deleted"
                ? "此工作区已主动删除。"
                : "当前没有可显示的工作区保留时间。"}
          </p>
        )}
      </section>

      <div className="about-topics">
        {TOPICS.map((topic, index) => (
          <details
            className="about-topic"
            key={topic.id}
            style={{ "--item-index": index + 1 } as CSSProperties}
          >
            <summary className="about-topic__summary">
              <span className="about-topic__icon">{topic.icon}</span>
              <span className="about-topic__titles">
                <h3 className="about-topic__title">{topic.title}</h3>
                <span className="about-topic__gist">{topic.gist}</span>
              </span>
              <ChevronDown aria-hidden="true" className="about-topic__chevron" size={20} />
            </summary>
            <div className="about-topic__body">{topic.body}</div>
          </details>
        ))}
      </div>

      <section
        className="about-card about-project"
        aria-labelledby="about-project-heading"
        style={{ "--item-index": TOPICS.length + 1 } as CSSProperties}
      >
        <div className="about-card__heading">
          <h3 id="about-project-heading">项目与开发者</h3>
          <span>共 {DEVELOPERS.length} 人</span>
        </div>
        <a
          className="about-project__repo"
          href={PROJECT_REPO_URL}
          rel="noreferrer"
          target="_blank"
        >
          <span className="about-project__repo-icon"><GithubMark /></span>
          <span className="about-project__repo-text">
            <span className="about-project__repo-name">{PROJECT_REPO_NAME}</span>
            <span className="about-project__repo-hint">在 GitHub 查看源码仓库</span>
          </span>
          <ExternalLink aria-hidden="true" size={16} />
        </a>
        <ul className="about-devs">
          {DEVELOPERS.map((developer, index) => (
            <li key={developer.handle} style={{ "--row-index": index + 1 } as CSSProperties}>
              <a href={developer.url} rel="noreferrer" target="_blank">
                <span aria-hidden="true" className="about-devs__avatar">
                  {developer.handle.slice(0, 1).toUpperCase()}
                </span>
                <span className="about-devs__text">
                  <span className="about-devs__name">{developer.handle}</span>
                  <span className="about-devs__role">{developer.role}</span>
                </span>
                <ExternalLink aria-hidden="true" size={16} />
              </a>
            </li>
          ))}
        </ul>
        <p className="about-devs__note">成员按加入顺序排列，先后顺序不代表贡献大小。</p>
      </section>

      <div className="about-actions">
        {availability === "active" && onRequestDeleteWorkspace ? (
          <Button onClick={onRequestDeleteWorkspace} variant="danger">
            <Trash2 aria-hidden="true" size={20} />
            注销数据
          </Button>
        ) : null}
      </div>
    </article>
  );
}
