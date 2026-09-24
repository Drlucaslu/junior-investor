import { memo, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const CITE = /\[(S\d{1,3})\](?!\()/g;

/** Turn [S3] citations into links that the renderer shows as badges. */
export function linkCitations(md: string): string {
  return md.replace(CITE, (_m, ref: string) => `[${ref}](#cite-${ref})`);
}

export const Markdown = memo(function Markdown({ children, className, onCite, citations = false }: {
  children: string; className?: string; onCite?: (ref: string) => void; citations?: boolean;
}) {
  const { t } = useTranslation();
  const components: Components = {
    a: ({ href, children: kids }) => {
      if (href?.startsWith("#cite-")) {
        const ref = href.slice(6);
        return (
          <button
            type="button"
            onClick={() => onCite?.(ref)}
            className="mx-0.5 inline-flex -translate-y-px items-center rounded-md bg-primary-soft px-1.5 py-0 align-baseline text-[0.7rem] font-semibold leading-5 text-primary no-underline hover:bg-primary hover:text-primary-foreground"
            aria-label={t("report.citation", { ref })}
          >
            {ref}
          </button>
        );
      }
      const external = !!href && /^https?:/i.test(href);
      return (
        <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
          {kids as ReactNode}
        </a>
      );
    },
    table: ({ children: kids }) => (
      <div className="my-4 overflow-x-auto">
        <table>{kids as ReactNode}</table>
      </div>
    ),
  };
  return (
    <div className={cn("prose-report", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {citations ? linkCitations(children) : children}
      </ReactMarkdown>
    </div>
  );
});
