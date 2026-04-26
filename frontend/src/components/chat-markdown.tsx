import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

const components: Partial<Components> = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc pl-5 [word-break:break-word]">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal pl-5 [word-break:break-word]">{children}</ol>,
  li: ({ children }) => <li className="mb-1.5 [word-break:break-word] last:mb-0">{children}</li>,
  h1: ({ children }) => <h1 className="mb-2 text-base font-semibold [word-break:break-word]">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 text-sm font-semibold [word-break:break-word]">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 text-sm font-medium [word-break:break-word]">{children}</h3>,
  a: ({ children, href }) => (
    <a
      className="font-medium text-primary underline decoration-primary/50 underline-offset-2 hover:decoration-primary"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => (
    <pre className="my-2 max-w-full overflow-x-auto rounded-lg border border-border/60 bg-muted/50 p-3 [word-break:normal] [overflow-wrap:normal] text-xs text-foreground [contain:inline-size]">
      {children}
    </pre>
  ),
  code: ({ className, children, ...props }) => {
    const isFenced = /language-(\w+)/.test(className ?? "");
    if (isFenced) {
      return (
        <code className={cn("block font-mono", className)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-muted/90 px-1.5 py-0.5 font-mono text-[0.8125rem]" {...props}>
        {children}
      </code>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-primary/50 pl-3 text-muted-foreground [word-break:break-word]">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-3 border-border/50" />,
  table: ({ children }) => (
    <div className="my-2 max-w-full overflow-x-auto [contain:inline-size]">
      <table className="w-full min-w-full border-collapse border border-border/60 text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/40">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-border/50 px-2 py-1.5 text-left font-semibold [word-break:break-word]">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-border/50 px-2 py-1.5 [word-break:break-word]">{children}</td>,
  img: ({ src, alt, title }) => (
    <img
      className="my-2 max-h-80 max-w-full rounded-md object-contain"
      src={src}
      alt={alt ?? ""}
      title={title}
      loading="lazy"
    />
  ),
};

type ChatMarkdownProps = {
  children: string;
  className?: string;
};

export function ChatMarkdown({ children, className }: ChatMarkdownProps) {
  return (
    <div className={cn("break-words text-sm leading-relaxed", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
