// Markdown for READMEs, issues and comments: GitHub-flavoured, then
// sanitised, because users write it and everyone sees it.

import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/**
 * Where relative links in a repository's Markdown point: links open in the
 * file browser, images load raw bytes. Both end with '/'.
 */
export interface Links {
  blob: string;
  raw: string;
}

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'input', 'del', 'ins', 'details', 'summary', 'sup', 'sub'],
  allowedAttributes: {
    a: ['href', 'title', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    // Task-list checkboxes, and nothing else that looks like a form.
    input: ['type', 'checked', 'disabled'],
    th: ['align'],
    td: ['align'],
    ol: ['start'],
    code: ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
  exclusiveFilter: (frame) => frame.tag === 'input' && frame.attribs.type !== 'checkbox',
  transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) },
};

function isRelative(url: string): boolean {
  return !!url && !/^[#/?]/.test(url) && !url.split('/')[0].includes(':');
}

export function render(text: string, links?: Links): string {
  const marked = new Marked({
    gfm: true,
    async: false,
    walkTokens: (token) => {
      if (!links) return;
      if (token.type === 'link' && isRelative(token.href)) token.href = links.blob + token.href;
      if (token.type === 'image' && isRelative(token.href)) token.href = links.raw + token.href;
    },
  });
  return sanitizeHtml(marked.parse(text) as string, SANITIZE);
}
