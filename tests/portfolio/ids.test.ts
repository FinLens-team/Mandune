import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "../../src/portfolio/ids.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("portfolio ids", () => {
  it("uses getRandomValues when randomUUID is unavailable in an HTTP context", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab);
        return bytes;
      },
    });

    expect(createId("line")).toBe("line-abababab-abab-4bab-abab-abababababab");
  });

  it("still creates an id when Web Crypto is unavailable", () => {
    vi.stubGlobal("crypto", undefined);
    expect(createId("draft")).toMatch(/^draft-[a-f0-9]+-[a-f0-9]+$/);
  });
});