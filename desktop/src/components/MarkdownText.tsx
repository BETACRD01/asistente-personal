import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const components: Components = {
  pre: ({ children }) => <pre className="md-pre">{children}</pre>,
  code: ({ className, children }) =>
    className ? (
      <code className={`md-code-block ${className}`}>{children}</code>
    ) : (
      <code className="md-code-inline">{children}</code>
    ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="md-table-wrap">
      <table>{children}</table>
    </div>
  ),
};

export default function MarkdownText({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}