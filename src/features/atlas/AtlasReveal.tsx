import { useEffect, useState } from "react";
import { BookOpenCheck, X } from "lucide-react";
import type { AtlasCardV1, AtlasOutcome } from "../../atlas/index.js";
import type { AtlasGateway } from "../../app/client/gateway.js";
import { Button, IconButton } from "../../client/ui/index.js";

export interface AtlasRevealProps {
  analysisId: string;
  gateway: AtlasGateway;
  onOpenAtlas: () => void;
}

export function AtlasReveal({ analysisId, gateway, onOpenAtlas }: AtlasRevealProps) {
  const [outcome, setOutcome] = useState<AtlasOutcome | null>(null);
  const [card, setCard] = useState<AtlasCardV1 | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let ignore = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const next = await gateway.getAtlasOutcome(analysisId);
        if (ignore) return;
        setOutcome(next);
        if (!next || next.status === "pending") {
          timer = setTimeout(() => void poll(), 750);
          return;
        }
        if ((next.status === "new_card" || next.status === "encountered") && next.card_id) {
          const detail = await gateway.getAtlasCard(next.card_id);
          if (!ignore) setCard(detail?.card ?? null);
        }
      } catch {
        if (!ignore) setOutcome({
          analysis_id: analysisId,
          selected_kind: "professional_term",
          status: "failed",
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          reason: "generation_failed",
        });
      }
    }
    void poll();
    return () => { ignore = true; if (timer) clearTimeout(timer); };
  }, [analysisId, gateway]);

  if (hidden) return null;
  const terminal = outcome && outcome.status !== "pending";
  const message = !terminal
    ? "图鉴正在辨识，不影响阅读"
    : outcome?.status === "new_card" && card
      ? `新卡已收藏：${card.canonical_name} · ${card.kind === "professional_term" ? "专业名词" : "趣味梗"}`
      : outcome?.status === "encountered" && card
        ? `再次遇见：${card.canonical_name} · 成长轨迹已更新`
        : "本次没有新卡，不影响复盘";
  return (
    <aside className="atlas-reveal" aria-live="polite">
      <div className="atlas-reveal__message" title={message}>
        <BookOpenCheck aria-hidden="true" size={19} />
        <strong>{message}</strong>
      </div>
      <div className="atlas-reveal__actions">
        {(outcome?.status === "new_card" || outcome?.status === "encountered") && card ? <Button onClick={onOpenAtlas} variant="secondary">打开图鉴</Button> : null}
        <IconButton icon={X} label={terminal ? "关闭图鉴提示" : "跳过图鉴辨识"} onClick={() => setHidden(true)} tooltip={terminal ? "关闭" : "跳过"} />
      </div>
    </aside>
  );
}
