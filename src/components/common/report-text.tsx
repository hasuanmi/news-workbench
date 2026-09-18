import type { ReactNode } from "react";

// Render common report formatting as React elements, without injecting HTML.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> :
    part.startsWith("`") && part.endsWith("`") ? <code key={index}>{part.slice(1, -1)}</code> : part);
}

export function ReportText({ text }: { text: string }) {
  return <div className="space-y-3 text-foreground/90 leading-relaxed">
    {text.split("\n").map((line, index) => {
      const value = line.trim();
      if (!value || /^```/.test(value)) return null;
      const heading = value.match(/^#{1,6}\s+(.+)$/);
      if (heading) return <h3 key={index} className="font-semibold text-foreground">{inline(heading[1])}</h3>;
      const bullet = value.match(/^[-*+]\s+(.+)$/);
      if (bullet) return <p key={index} className="pl-4">• {inline(bullet[1])}</p>;
      return <p key={index}>{inline(value)}</p>;
    })}
  </div>;
}
