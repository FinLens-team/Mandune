import { spawn } from "node:child_process";
import { INSTRUMENT_DICTIONARY } from "../instruments/index.js";
import type {
  ExtractedHoldingCandidate,
  MultimodalExtractionResult,
  MultimodalExtractor,
} from "./types.js";

const CODE_PATTERN = /(?<!\d)([01569]\d{5})(?!\d)/g;
const MAX_OCR_TEXT = 200_000;

function normalizedSymbol(code: string): string {
  const market = /^[569]/.test(code) ? "SH" : "SZ";
  return `${code}.${market}`;
}

function candidateFromLine(code: string, line: string): ExtractedHoldingCandidate {
  const symbol = normalizedSymbol(code);
  const known = INSTRUMENT_DICTIONARY.find((item) => item.symbol === symbol);
  const percent = line.match(/(?:约|占比|仓位)?\s*(\d{1,3}(?:\.\d+)?)\s*%/u)?.[1];
  const amount = line.match(/(\d+(?:\.\d+)?)\s*(万|元|股|份)/u);
  const sizeBasis = percent
    ? `截图识别仓位约 ${percent}%`
    : amount
      ? `截图识别规模 ${amount[1]}${amount[2]}`
      : undefined;
  return {
    asset_class: known?.asset_class ?? (/^[159]/.test(code) ? "etf" : "a_share"),
    name: known?.name ?? `待确认标的 ${code}`,
    symbol,
    ...(known?.market ? { market: known.market } : {}),
    ...(sizeBasis ? { size_basis: sizeBasis } : {}),
    confidence: known && sizeBasis ? "high" : "low",
    notes: "由本机简单 OCR 生成，代码、名称和持仓规模均需人工确认。",
  };
}

export function candidatesFromOcrText(text: string): ExtractedHoldingCandidate[] {
  const bySymbol = new Map<string, ExtractedHoldingCandidate>();
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.replaceAll(/\s+/gu, " ").trim();
    if (!line) continue;
    for (const match of line.matchAll(CODE_PATTERN)) {
      const code = match[1];
      if (!code) continue;
      const candidate = candidateFromLine(code, line);
      bySymbol.set(candidate.symbol ?? code, candidate);
    }
  }
  return [...bySymbol.values()].slice(0, 20);
}

export class TesseractOcrExtractor implements MultimodalExtractor {
  constructor(
    private readonly executable = "tesseract",
    private readonly timeoutMs = 20_000,
  ) {}

  async extract(input: {
    image_bytes: Uint8Array;
    media_type: string;
    signal?: AbortSignal;
  }): Promise<MultimodalExtractionResult> {
    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn(this.executable, ["stdin", "stdout", "-l", "chi_sim+eng", "--psm", "6"], {
        stdio: ["pipe", "pipe", "ignore"],
      });
      const chunks: Buffer[] = [];
      let size = 0;
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        input.signal?.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve(Buffer.concat(chunks).toString("utf8"));
      };
      const abort = (): void => {
        child.kill("SIGKILL");
        const error = new Error("aborted");
        error.name = "AbortError";
        finish(error);
      };
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error("ocr_timeout"));
      }, this.timeoutMs);
      input.signal?.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_OCR_TEXT) {
          child.kill("SIGKILL");
          finish(new Error("ocr_output_too_large"));
          return;
        }
        chunks.push(chunk);
      });
      child.on("error", (error) => finish(error));
      child.on("exit", (code) => finish(code === 0 ? undefined : new Error("ocr_failed")));
      child.stdin.end(input.image_bytes);
    });

    return {
      candidates: candidatesFromOcrText(text),
      model_notes: "local_tesseract_ocr",
    };
  }
}
