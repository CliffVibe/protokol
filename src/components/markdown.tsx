// Текст объявления с разметкой (T09, S5): дерево из src/lib/markdown.ts → обычные React-элементы.
// Сырого HTML здесь нет и быть не должно — тег из текста объявления React покажет как текст.
import { ExternalLink } from "lucide-react";
import { Fragment } from "react";
import { parseMarkdown, type Inline } from "@/lib/markdown";
import { cn } from "@/lib/utils";

const LINK =
  "text-brand underline underline-offset-2 hover:no-underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-brand";

function Inlines({ nodes }: { nodes: Inline[] }) {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return <Fragment key={i}>{n.v}</Fragment>;
      case "br":
        return <br key={i} />;
      case "strong":
        return (
          <strong key={i} className="font-bold">
            <Inlines nodes={n.c} />
          </strong>
        );
      case "em":
        return (
          <em key={i}>
            <Inlines nodes={n.c} />
          </em>
        );
      case "link":
        return n.external ? (
          <a key={i} href={n.href} rel="noopener noreferrer" className={LINK}>
            <Inlines nodes={n.c} />
            <ExternalLink aria-hidden className="ml-0.5 inline size-3.5 align-baseline" />
            <span className="sr-only"> (внешняя ссылка)</span>
          </a>
        ) : (
          <a key={i} href={n.href} className={LINK}>
            <Inlines nodes={n.c} />
          </a>
        );
    }
  });
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className={cn("flex flex-col gap-2 text-base break-words text-ink", className)}>
      {blocks.map((b, i) =>
        b.t === "p" ? (
          <p key={i}>
            <Inlines nodes={b.c} />
          </p>
        ) : b.t === "ul" ? (
          <ul key={i} className="list-disc pl-5">
            {b.items.map((item, j) => (
              <li key={j}>
                <Inlines nodes={item} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i} className="list-decimal pl-5">
            {b.items.map((item, j) => (
              <li key={j}>
                <Inlines nodes={item} />
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
