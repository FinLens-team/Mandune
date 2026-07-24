import { useState } from "react";
import type { DraftLine } from "../../contracts/index.js";
import {
  ScreenshotExtractionService,
  type ScreenshotImportResult,
} from "../../extraction/index.js";

const extractor = new ScreenshotExtractionService();

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
    setBusy(true);
    setMessage("正在提取草稿…");
    const abort = new AbortController();
    setController(abort);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await extractor.importScreenshot({
        consent_given: true,
        media_type: file.type || "image/png",
        image_bytes: bytes,
        signal: abort.signal,
      });
      setMessage(result.message);
      props.onDraftLines(result.draft_lines, result);
    } finally {
      setBusy(false);
      setController(null);
    }
  }

  return (
    <section className="panel" aria-labelledby="screenshot-heading">
      <div className="panel-head">
        <h2 id="screenshot-heading">截图导入</h2>
        <p className="panel-note">
          截图将临时交给多模态模型生成待复核草稿，可能包含敏感金融信息。原图在成功、失败或中止后删除，不会进入分析模型或历史。
        </p>
      </div>

      <label className="consent-row">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
        />
        <span>
          我已知晓并同意：截图仅用于生成草稿，提取结束后删除原图，结果需我人工确认。
        </span>
      </label>

      <div className="action-row">
        <label className="btn primary file-btn">
          选择截图
          <input
            type="file"
            accept="image/*"
            disabled={!consent || busy}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void onFile(file);
              event.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={!busy || !controller}
          onClick={() => controller?.abort()}
        >
          中止提取
        </button>
        <button type="button" className="btn" onClick={props.onCancel}>
          返回
        </button>
      </div>

      {message ? (
        <p className="status-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
