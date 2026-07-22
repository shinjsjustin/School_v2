import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Renders assistant/user chat text as Markdown (Claude.ai-style):
// bold, italics, headings, lists, tables, code blocks, links, etc.
//
// Notes:
// - `react-markdown` escapes raw HTML by default, so this is safe against XSS
//   from streamed model output.
// - We open links in a new tab and add rel="noopener noreferrer".
// - Wrap in a div with class `md` so ChatRoom.css can target the rendered
//   elements without leaking styles elsewhere.
const linkRenderer = ({ node, ...props }) => (
    // eslint-disable-next-line jsx-a11y/anchor-has-content
    <a {...props} target="_blank" rel="noopener noreferrer" />
);

const MarkdownMessage = ({ content = '', className = '' }) => (
    <div className={`md ${className}`.trim()}>
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{ a: linkRenderer }}
        >
            {content}
        </ReactMarkdown>
    </div>
);

export default MarkdownMessage;
