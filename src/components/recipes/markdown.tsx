import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders a recipe method written in markdown.
 *
 * Raw HTML is deliberately not enabled: react-markdown ignores it unless
 * `rehype-raw` is added, and leaving it out is the entire XSS story here. That
 * matters now because members author this text, and more in Phase 10 when an AI
 * importer starts writing it from arbitrary web pages.
 *
 * GFM is on for tables and task lists, which recipe methods do use.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Demoted one level: the page already owns the h1, so a method's
          // "# " must not compete with the recipe title for outline order.
          // Sizes are set explicitly because the surrounding body text is
          // text-sm, and the browser defaults would leave h3 no larger than it.
          h1: ({ children }) => (
            <h2 className="mt-4 text-xl font-semibold first:mt-0">{children}</h2>
          ),
          h2: ({ children }) => (
            <h3 className="mt-4 text-lg font-semibold first:mt-0">{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-3 text-base font-semibold first:mt-0">
              {children}
            </h4>
          ),
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5">{children}</ol>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-4"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-muted text-muted-foreground border-l-2 pl-3">
              {children}
            </blockquote>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
