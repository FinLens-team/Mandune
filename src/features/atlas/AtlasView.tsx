import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpenCheck, Trash2 } from "lucide-react";
import type { AtlasCardDetail, AtlasCardV1 } from "../../atlas/index.js";
import type { AtlasGateway } from "../../app/client/gateway.js";
import { Button } from "../../client/ui/index.js";
import { AtlasCard } from "./AtlasCard.js";

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function DeleteCardDialog(props: {
  card: AtlasCardV1;
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !props.open) return;
    dialog.showModal();
    return () => dialog.close();
  }, [props.open]);
  return (
    <dialog className="atlas-delete-dialog" onCancel={props.onCancel} ref={ref}>
      <h2>删除「{props.card.canonical_name}」？</h2>
      <p>这会删除图鉴卡和全部复遇轨迹，但不会修改任何历史复盘。之后再次遇到时可以重新收藏。</p>
      <div>
        <Button onClick={props.onCancel} variant="secondary">取消</Button>
        <Button className="atlas-delete-dialog__confirm" onClick={props.onConfirm}>
          <Trash2 aria-hidden="true" size={18} />
          确认删除
        </Button>
      </div>
    </dialog>
  );
}

export interface AtlasViewProps {
  gateway: AtlasGateway;
  reducedMotion: boolean;
  onOpenHistory: (recordId: string) => void;
}

export function AtlasView({ gateway, reducedMotion, onOpenHistory }: AtlasViewProps) {
  const [cards, setCards] = useState<AtlasCardV1[] | null>(null);
  const [detail, setDetail] = useState<AtlasCardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let ignore = false;
    gateway.listAtlasCards()
      .then((value) => { if (!ignore) setCards(value); })
      .catch(() => { if (!ignore) setError("图鉴暂时无法读取，请稍后重试。"); });
    return () => { ignore = true; };
  }, [gateway]);

  useEffect(() => { headingRef.current?.focus(); }, [detail]);

  async function openDetail(cardId: string) {
    setError(null);
    try {
      const value = await gateway.getAtlasCard(cardId);
      if (!value) throw new Error("not_found");
      setDetail(value);
    } catch {
      setError("这张卡已经不存在或暂时无法读取。");
    }
  }

  async function confirmDelete() {
    if (!detail) return;
    try {
      await gateway.deleteAtlasCard(detail.card.card_id);
      setCards((current) => current?.filter((card) => card.card_id !== detail.card.card_id) ?? []);
      setDeleteOpen(false);
      setDetail(null);
    } catch {
      setDeleteOpen(false);
      setError("卡片删除未完成，当前内容仍保留。");
    }
  }

  if (detail) {
    return (
      <main className="atlas-page atlas-detail" data-reduce-motion={reducedMotion || undefined} id="main">
        <Button onClick={() => setDetail(null)} variant="secondary">
          <ArrowLeft aria-hidden="true" size={18} />
          返回卡片墙
        </Button>
        <header className="atlas-page__header">
          <p>单卡成长轨迹</p>
          <h1 ref={headingRef} tabIndex={-1}>{detail.card.canonical_name}</h1>
          <p>首次发现于 {formatDateTime(detail.card.first_discovered_at)}，累计遇见 {detail.card.encounter_count} 次。</p>
        </header>
        <div className="atlas-detail__card"><AtlasCard card={detail.card} reducedMotion={reducedMotion} /></div>
        <section className="atlas-timeline" aria-labelledby="atlas-timeline-heading">
          <h2 id="atlas-timeline-heading">相遇记录</h2>
          <ol>
            {detail.encounters.map((encounter, index) => (
              <li key={encounter.encounter_id}>
                <div><span>{index === 0 ? "首次发现" : `第 ${index + 1} 次遇见`}</span><time dateTime={encounter.occurred_at}>{formatDateTime(encounter.occurred_at)}</time></div>
                <p>{encounter.context_summary}</p>
                <Button onClick={() => onOpenHistory(encounter.history_record_id)} variant="secondary">打开关联复盘</Button>
              </li>
            ))}
          </ol>
        </section>
        <section className="atlas-danger" aria-labelledby="atlas-delete-heading">
          <h2 id="atlas-delete-heading">删除卡片</h2>
          <p>删除只影响图鉴，不会修改关联历史复盘。</p>
          <Button onClick={() => setDeleteOpen(true)} variant="secondary">
            <Trash2 aria-hidden="true" size={18} />
            删除这张卡
          </Button>
        </section>
        <DeleteCardDialog card={detail.card} onCancel={() => setDeleteOpen(false)} onConfirm={() => void confirmDelete()} open={deleteOpen} />
      </main>
    );
  }

  return (
    <main className="atlas-page" data-reduce-motion={reducedMotion || undefined} id="main">
      <header className="atlas-page__header">
        <p>个人概念相遇路径</p>
        <h1 ref={headingRef} tabIndex={-1}>满懂图鉴</h1>
        <p>这里保存随每日复盘遇见的专业名词与趣味梗，保留首次发现和之后的每次相遇。</p>
      </header>
      {error ? <p className="atlas-state" role="alert">{error}</p> : null}
      {cards === null && !error ? <p className="atlas-state" role="status">正在读取图鉴…</p> : null}
      {cards?.length === 0 ? (
        <section className="atlas-empty">
          <BookOpenCheck aria-hidden="true" size={32} />
          <h2>图鉴还没有卡片</h2>
          <p>完成每日复盘后，系统可能收藏一张专业名词或趣味梗。</p>
        </section>
      ) : null}
      {cards && cards.length > 0 ? (
        <section aria-label="图鉴卡片墙" className="atlas-wall">
          {cards.map((card) => (
            <AtlasCard card={card} key={card.card_id} onOpenDetail={(cardId) => void openDetail(cardId)} reducedMotion={reducedMotion} />
          ))}
        </section>
      ) : null}
    </main>
  );
}
