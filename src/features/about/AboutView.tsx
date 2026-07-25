import { Clock3, Database, House, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import type { WorkspacePublicStatus } from "../../workspace/index.js";
import {
  Badge,
  Button,
  DemoBadge,
  type DemoBadgeSource,
} from "../../client/ui/index.js";
import type { HistoryAvailability } from "../history-view/HistoryView.js";

export interface AboutViewProps {
  availability?: HistoryAvailability;
  experienceSource?: DemoBadgeSource;
  onNavigateHome: () => void;
  onRequestDeleteWorkspace?: () => void;
  workspace: WorkspacePublicStatus | null;
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

export function AboutView({
  availability = "active",
  experienceSource,
  onNavigateHome,
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
          <DemoBadge source={experienceSource} />
        ) : (
          <Badge tone="observed">每日持仓复盘</Badge>
        )}
        <h2 id="about-heading" ref={headingRef} tabIndex={-1}>关于满懂</h2>
        <p>满懂帮助轻投资者把已确认的持仓、个人约束和带时点证据整理成可核对的方向性复盘。</p>
      </header>

      <section className="about-section" aria-labelledby="about-boundary-heading">
        <ShieldCheck aria-hidden="true" size={24} />
        <div>
          <h3 id="about-boundary-heading">不是投资建议，也不替你交易</h3>
          <p>满懂只提供可追溯的方向性复盘，不提供精确金额、份额、比例、价格或交易时点，不保证收益、回撤、胜率或市场结果，也不连接券商、持有资金或执行交易。它不构成持牌投资意见，所有判断和操作仍由你决定。</p>
        </div>
      </section>

      <section className="about-section" aria-labelledby="about-private-heading">
        <Database aria-hidden="true" size={24} />
        <div>
          <h3 id="about-private-heading">匿名私密工作区</h3>
          <p>公开应用入口不会公开或授予他人访问当前工作区的持仓、约束、复盘与历史。私人持仓不会进入公开页面、URL 或默认日志。无需账号，但也不支持跨设备找回。</p>
          <p>如果未来启用截图提取，原始截图会在提取成功、失败或中止后删除，不进入历史、分析证据或默认日志；Demo V1 的截图入口仍未开放。</p>
        </div>
      </section>

      <section className="about-section" aria-labelledby="about-retention-heading">
        <Clock3 aria-hidden="true" size={24} />
        <div>
          <h3 id="about-retention-heading">30 天无活动后自动删除</h3>
          <p>每次活动都会刷新保留期；连续 30 天无活动后，系统自动删除持仓、约束、复盘与历史。你也可以在到期前主动删除，删除后无法通过正常产品路径恢复。</p>
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
          {availability === "active" && onRequestDeleteWorkspace ? (
            <Button onClick={onRequestDeleteWorkspace} variant="danger">
              <Trash2 aria-hidden="true" size={20} />
              主动删除当前工作区
            </Button>
          ) : null}
        </div>
      </section>

      <section className="about-section" aria-labelledby="about-example-heading">
        <House aria-hidden="true" size={24} />
        <div>
          <h3 id="about-example-heading">示例、缓存与证据时点</h3>
          <p>随机体验身份是虚构示例，不是你的真实持仓或系统推荐约束。缓存或 fixture 证据必须保留原始观察时间、获取时间和证据截止时点，并明确标为非实时；它们不证明供应商当前可用。</p>
          <p>历史复盘只读取当时保存的快照、证据和结果，不会用后来数据静默改写或重算旧结论。</p>
        </div>
      </section>

      <div className="about-actions">
        <Button onClick={onNavigateHome} variant="primary">返回主页</Button>
      </div>
    </article>
  );
}
