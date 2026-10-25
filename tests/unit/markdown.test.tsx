import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdown } from "@/lib/markdown";

const html = (md: string) => renderToStaticMarkup(<>{renderMarkdown(md)}</>);

describe("renderMarkdown", () => {
  it("renders headings, paragraphs, lists and emphasis", () => {
    const out = html("# Title\n\nHello **bold** and *it*.\n\n- a\n- b\n\n1. one\n2. two");
    expect(out).toContain("<h2");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>it</em>");
    expect(out).toContain("<ul");
    expect(out).toContain("<ol");
  });

  it("never emits raw HTML or script", () => {
    const out = html("<script>alert(1)</script> and <img src=x onerror=alert(1)>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;script&gt;");
  });

  it("drops dangerous link schemes but keeps the text", () => {
    const out = html("[click](javascript:alert(1)) and [ok](https://example.com) and [rel](/shop) and [d](data:text/html;base64,AAA)");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("data:text");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('href="/shop"');
    expect(out).toContain("click");
  });

  it("rejects protocol-relative links", () => {
    expect(html("[x](//evil.example/a)")).not.toContain("href");
  });
});
