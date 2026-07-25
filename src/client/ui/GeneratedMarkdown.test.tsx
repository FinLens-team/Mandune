import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GeneratedMarkdown } from "./GeneratedMarkdown.js";

describe("GeneratedMarkdown", () => {
  it("renders common Markdown structures from model output", () => {
    const markup = renderToStaticMarkup(createElement(
      GeneratedMarkdown,
      null,
      "# 复盘标题\n\n- **重点**：观察波动\n- `ETF`\n\n[来源](https://example.com/report)",
    ));

    expect(markup).toContain("<h1>复盘标题</h1>");
    expect(markup).toContain("<ul>");
    expect(markup).toContain("<strong>重点</strong>");
    expect(markup).toContain("<code>ETF</code>");
    expect(markup).toContain('href="https://example.com/report"');
  });

  it("does not render model-authored HTML or unsafe URLs", () => {
    const markup = renderToStaticMarkup(createElement(
      GeneratedMarkdown,
      null,
      "<img src=x onerror=alert(1)>\n\n[bad](javascript:alert(1))",
    ));

    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("onerror");
    expect(markup).not.toContain("javascript:");
  });
});
