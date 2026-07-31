import { useState } from "react";
import type { DraftLine } from "../../contracts/index.js";
import type { ScreenshotImportResult } from "../../extraction/index.js";
import { Button } from "../../client/ui/index.js";
import { ImageUp, X } from "lucide-react";

export function ScreenshotImportPanel(props: {
  onDraftLines: (lines: DraftLine[], meta: ScreenshotImportResult) => void;
  onCancel: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [controller, setController] = useState<AbortController | null>(null);

  async function onFile(file: File | null): Promise<void> {
    if (!file) return;
    if (!consent) {
      setMessage("请先勾选知情同意，再上传截图。");
      return;
    }
    if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(file.type)) {
      setMessage("仅支持 PNG、JPEG 或 WebP 图片。");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setMessage("图片不能超过 8 MB。");
      return;
    }

    setBusy(true);
    setMessage("正在本机识别截图...");
    const abort = new AbortController();
    setController(abort);
    try {
      const response = await fetch("/api/screenshot-ocr", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": file.type,
          "x-ocr-consent": "true",
        },
        body: file,
        signal: abort.signal,
      });
      const result = await response.json() as ScreenshotImportResult | { error: string };
      if (!("draft_lines" in result)) {
        setMessage(response.status === 413 ? "图片不能超过 8 MB。" : "OCR 识别失败，可改用手动填写。");
        return;
      }
      setMessage(result.message);
      if (result.draft_lines.length > 0) props.onDraftLines(result.draft_lines, result);
    } catch (error) {
      setMessage(error instanceof Error && error.name === "AbortError"
        ? "已中止识别。"
        : "OCR 服务暂不可用，可改用手动填写。");
    } finally {
      setBusy(false);
      setController(null);
    }
  }

  return (
    <section className="onboarding-screen onboarding-import" aria-labelledby="screenshot-heading">
      <header className="onboarding-heading">
        <p className="onboarding-step">首次引导 · 图片识别</p>
        <h1 id="screenshot-heading">识别持仓截图</h1>
        <p>本机 OCR 会尝试识别 A 股和 ETF 代码。识别结果只是草稿，保存前可逐项修改。</p>
      </header>

      <label className="onboarding-consent-row">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        <span>我已知晓：截图仅在本机内存中用于 OCR，处理完成后删除，识别结果需要人工确认。</span>
      </label>

      <div className="onboarding-import__actions">
        <label className={`btn primary file-btn${!consent || busy ? " is-disabled" : ""}`}>
          <ImageUp aria-hidden="true" size={19} />
          选择截图
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={!consent || busy}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void onFile(file);
              event.target.value = "";
            }}
          />
        </label>
        {busy ? (
          <Button onClick={() => controller?.abort()} variant="secondary">
            <X aria-hidden="true" size={18} />中止识别
          </Button>
        ) : null}
        <Button onClick={props.onCancel} variant="secondary">返回</Button>
      </div>

      {message ? <p className="onboarding-source__feedback" role="status">{message}</p> : null}
    </section>
  );
}
