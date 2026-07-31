import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "../../src/client/App.js";

describe("journey bootstrap screen", () => {
  it("renders a visible service connection state while bootstrap is pending", () => {
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain("正在连接服务");
    expect(html).toContain("role=\"status\"");
    expect(html).toContain("journey-boot__mark");
  });
});