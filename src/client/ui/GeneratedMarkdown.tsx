import ReactMarkdown from "react-markdown";
import "./GeneratedMarkdown.css";

export interface GeneratedMarkdownProps {
  children: string;
  className?: string;
}

function safeMarkdownUrl(url: string): string {
  if (url.startsWith("#")) return url;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : "";
  } catch {
    return "";
  }
}

/** Renders model-authored Markdown without accepting model-authored HTML. */
export function GeneratedMarkdown({ children, className }: GeneratedMarkdownProps) {
  return (
    <div className={["generated-markdown", className].filter(Boolean).join(" ")}>
      <ReactMarkdown skipHtml urlTransform={safeMarkdownUrl}>{children}</ReactMarkdown>
    </div>
  );
}
