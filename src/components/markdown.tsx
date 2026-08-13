import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/** Renders AI output as rich markdown (tables, lists, code, LaTeX math). */
export function Markdown({ content, className = "" }: { content: string; className?: string }) {
  return (
    <div className={`text-sm leading-relaxed space-y-2 break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false, errorColor: "inherit", trust: true }]]}
        components={{
          h1: (p) => <h1 className="text-base font-semibold mt-3 first:mt-0" {...p} />,
          h2: (p) => <h2 className="text-base font-semibold mt-3 first:mt-0" {...p} />,
          h3: (p) => <h3 className="text-sm font-semibold mt-3 first:mt-0" {...p} />,
          p: (p) => <p className="whitespace-pre-wrap" {...p} />,
          ul: (p) => <ul className="list-disc pl-5 space-y-1" {...p} />,
          ol: (p) => <ol className="list-decimal pl-5 space-y-1" {...p} />,
          li: (p) => <li className="marker:text-muted-foreground" {...p} />,
          strong: (p) => <strong className="font-semibold" {...p} />,
          a: (p) => <a className="underline text-primary" target="_blank" rel="noreferrer" {...p} />,
          blockquote: (p) => <blockquote className="border-l-2 pl-3 italic text-muted-foreground" {...p} />,
          hr: () => <hr className="my-3 border-border" />,
          code: ({ className: c, children, ...rest }) => {
            const block = /language-/.test(c ?? "");
            return block ? (
              <code className="block w-full overflow-x-auto rounded-lg bg-muted p-3 text-xs font-mono" {...rest}>
                {children}
              </code>
            ) : (
              <code className="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono" {...rest}>
                {children}
              </code>
            );
          },
          pre: (p) => <pre className="my-2" {...p} />,
          table: (p) => (
            <div className="overflow-x-auto my-2">
              <table className="w-full text-xs border-collapse" {...p} />
            </div>
          ),
          th: (p) => <th className="border px-2 py-1 text-left font-medium bg-muted/50" {...p} />,
          td: (p) => <td className="border px-2 py-1 align-top" {...p} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
