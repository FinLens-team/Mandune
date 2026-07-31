import { useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import { longCardRuntimeIsDisplayable, type LongCardRuntimeInput } from "../long-card/LongCard.js";
import { scorePortfolio, type PortfolioScore } from "../../scoring/index.js";
import { themeCssVariables } from "../../theme/client.js";
import { themeForId } from "../../theme/index.js";
import "./ScoreShareCard.css";

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const lines: string[] = [];
  let current = "";
  for (const character of text) {
    const next = current + character;
    if (context.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = character;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines && visible.length > 0) {
    visible[visible.length - 1] = `${visible[visible.length - 1]!.slice(0, -1)}…`;
  }
  visible.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return y + visible.length * lineHeight;
}

export async function createScoreCardBlob(
  score: PortfolioScore,
  role: string,
  themeId: string,
): Promise<Blob> {
  const theme = themeForId(themeId);
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");

  context.fillStyle = theme.tokens.backgroundDeep;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  context.fillStyle = theme.tokens.surface;
  roundedRect(context, 60, 60, 960, 1230, 24);

  context.fillStyle = theme.tokens.inkSoft;
  context.font = '600 32px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  context.fillText("满懂 · 今日持仓段位", 110, 135);

  context.fillStyle = theme.tokens.accent;
  context.font = '900 188px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  context.fillText(score.tier, 105, 360);

  context.fillStyle = theme.tokens.ink;
  context.font = '800 72px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  context.fillText(`${score.score.toFixed(1)} / 10.0`, 110, 465);

  context.fillStyle = theme.tokens.background;
  roundedRect(context, 105, 525, 870, 112, 16);
  context.fillStyle = theme.tokens.ink;
  context.font = '700 34px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  context.fillText(`本局角色  ${role}`, 145, 596);

  context.fillStyle = theme.tokens.inkSoft;
  context.font = '600 31px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  const roastBottom = drawWrappedText(context, score.roast, 110, 720, 850, 54, 4);

  let rowY = Math.max(930, roastBottom + 80);
  context.font = '600 26px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  for (const dimension of score.dimensions) {
    context.fillStyle = theme.tokens.inkSoft;
    context.fillText(dimension.label, 110, rowY);
    context.fillStyle = theme.tokens.accent;
    context.textAlign = "right";
    context.fillText(`${dimension.score.toFixed(1)} / ${dimension.maxScore.toFixed(1)}`, 970, rowY);
    context.textAlign = "left";
    rowY += 66;
  }

  context.fillStyle = theme.tokens.inkSoft;
  context.font = '500 23px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  context.fillText("基于已确认信息与证据覆盖生成 · 不代表收益预测", 110, 1240);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Card export failed.")), "image/png");
  });
}

export interface ScoreShareCardProps {
  input: LongCardRuntimeInput;
}

export function ScoreShareCard({ input }: ScoreShareCardProps) {
  const [status, setStatus] = useState("");
  const score = useMemo(() => scorePortfolio(input), [input]);
  const theme = themeForId(input.snapshot.theme_id);
  if (!longCardRuntimeIsDisplayable(input)) return null;

  async function shareCard() {
    try {
      setStatus("正在生成卡片…");
      const blob = await createScoreCardBlob(score, theme.mascot.name, theme.id);
      const file = new File([blob], `满懂-${score.tier}-${score.score.toFixed(1)}分.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `我的持仓段位：${score.tier}` });
        setStatus("已打开分享面板");
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.download = file.name;
      anchor.href = url;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setStatus("评分卡已下载");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("");
        return;
      }
      setStatus("卡片生成失败，请稍后重试");
    }
  }

  return (
    <section
      aria-labelledby="portfolio-score-heading"
      className="score-share-card"
      data-tier={score.tier}
      data-theme={theme.id}
      style={themeCssVariables(theme.id)}
    >
      <div className="score-share-card__hero">
        <div>
          <p className="score-share-card__eyebrow">今日持仓段位</p>
          <h2 id="portfolio-score-heading">{score.tier}</h2>
        </div>
        <p className="score-share-card__score" aria-label={`评分 ${score.score.toFixed(1)} 分，满分 10 分`}>
          <strong>{score.score.toFixed(1)}</strong><span>/10.0</span>
        </p>
      </div>
      <div className="score-share-card__verdict">
        <p><span>本局角色</span><strong>{theme.mascot.name}</strong></p>
        <blockquote>{score.roast}</blockquote>
      </div>
      <dl className="score-share-card__dimensions">
        {score.dimensions.map((dimension) => (
          <div key={dimension.id} title={dimension.summary}>
            <dt>{dimension.label}</dt>
            <dd>{dimension.score.toFixed(1)}<span>/{dimension.maxScore.toFixed(1)}</span></dd>
          </div>
        ))}
      </dl>
      <div className="score-share-card__footer">
        <p>基于已确认信息与证据覆盖，不代表收益预测</p>
        <button className="score-share-card__share" onClick={() => void shareCard()} type="button">
          <Share2 aria-hidden="true" size={18} />
          分享评分卡
        </button>
      </div>
      <p aria-live="polite" className="score-share-card__status">{status}</p>
    </section>
  );
}
