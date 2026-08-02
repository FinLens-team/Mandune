import { useMemo, useState } from "react";
import { Share2 } from "lucide-react";
import { longCardRuntimeIsDisplayable, type LongCardRuntimeInput } from "../long-card/LongCard.js";
import { portfolioScoreIsAvailable, scorePortfolio, type PortfolioScore } from "../../scoring/index.js";
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
      if (/^[，。；：、！？）】》]/u.test(character)) {
        current = next;
      } else {
        lines.push(current);
        current = character;
      }
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

  const outer = 48;
  const panelWidth = CARD_WIDTH - outer * 2;
  context.fillStyle = theme.tokens.backgroundDeep;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const wash = context.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  wash.addColorStop(0, theme.tokens.background);
  wash.addColorStop(1, theme.tokens.backgroundDeep);
  context.fillStyle = wash;
  roundedRect(context, outer, outer, panelWidth, CARD_HEIGHT - outer * 2, 32);

  context.fillStyle = theme.tokens.surfaceRaised;
  roundedRect(context, 88, 88, 904, 364, 28);
  context.fillStyle = theme.tokens.inkSoft;
  context.font = '700 25px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  context.fillText("满懂 · 组合段位", 124, 142);

  context.fillStyle = theme.tokens.accent;
  context.font = '900 150px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  context.fillText(score.tier, 118, 337);
  context.fillStyle = theme.tokens.inkSoft;
  context.font = '600 29px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  context.fillText("今日持仓段位", 124, 389);

  context.textAlign = "right";
  context.fillStyle = theme.tokens.ink;
  context.font = '900 112px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  context.fillText(score.score.toFixed(1), 936, 294);
  context.fillStyle = theme.tokens.inkSoft;
  context.font = '700 27px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  context.fillText("综合分 · /10.0", 936, 344);
  context.textAlign = "left";

  context.fillStyle = theme.tokens.surface;
  roundedRect(context, 88, 492, 904, 124, 20);
  context.fillStyle = theme.tokens.inkSoft;
  context.font = '700 24px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  context.fillText("本局角色", 124, 541);
  context.fillStyle = theme.tokens.ink;
  context.font = '800 38px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  context.fillText(role, 124, 589);

  context.fillStyle = theme.tokens.ink;
  context.font = '700 36px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  drawWrappedText(context, score.roast, 112, 700, 856, 56, 3);

  score.dimensions.forEach((dimension, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 88 + column * 456;
    const y = 902 + row * 158;
    context.fillStyle = theme.tokens.surfaceRaised;
    roundedRect(context, x, y, 432, 132, 18);
    context.fillStyle = theme.tokens.inkSoft;
    context.font = '700 23px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    context.fillText(dimension.label, x + 28, y + 47);
    context.fillStyle = theme.tokens.accent;
    context.font = '900 42px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    context.fillText(dimension.score.toFixed(1), x + 28, y + 102);
    context.fillStyle = theme.tokens.inkSoft;
    context.font = '700 22px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    context.fillText(` / ${dimension.maxScore.toFixed(1)}`, x + 96, y + 100);
  });

  context.fillStyle = theme.tokens.inkSoft;
  context.font = '600 22px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  context.fillText("满懂 · 组合评分", 88, 1245);

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
  if (!longCardRuntimeIsDisplayable(input) || !portfolioScoreIsAvailable(input)) return null;

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
      <header className="score-share-card__hero">
        <div className="score-share-card__tier">
          <p className="score-share-card__eyebrow">今日持仓段位</p>
          <h2 id="portfolio-score-heading">{score.tier}</h2>
        </div>
        <p className="score-share-card__score" aria-label={`评分 ${score.score.toFixed(1)} 分，满分 10 分`}>
          <strong>{score.score.toFixed(1)}</strong>
          <span>综合分 · /10.0</span>
        </p>
      </header>
      <div className="score-share-card__body">
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
          <button className="score-share-card__share" onClick={() => void shareCard()} type="button">
            <Share2 aria-hidden="true" size={18} />
            分享评分卡
          </button>
        </div>
      </div>
      <p aria-live="polite" className="score-share-card__status">{status}</p>
    </section>
  );
}
