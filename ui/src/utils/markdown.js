const SAFE_URL_PATTERN = /^(https?:\/\/|mailto:|\/|#)/i;

const escapeHtml = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeAttribute = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sanitizeUrl = (url) => {
  if (!url) {
    return null;
  }
  const trimmed = url.trim();
  if (!SAFE_URL_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
};

const renderInline = (text) => {
  if (!text) {
    return '';
  }

  let result = escapeHtml(text);

  // Inline code spans
  result = result.replace(/`([^`]+?)`/g, (_, code) => `<code>${code}</code>`);

  // Bold and italic (strong first to avoid double-processing markers)
  result = result.replace(/(\*\*|__)([\s\S]+?)\1/g, '<strong>$2</strong>');
  result = result.replace(/(\*|_)([^*_]+?)\1/g, '<em>$2</em>');
  result = result.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>');

  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const sanitisedUrl = sanitizeUrl(url);
    if (!sanitisedUrl) {
      return label;
    }
    const safeHref = escapeAttribute(sanitisedUrl);
    return `<a href="${safeHref}" target="_blank" rel="noreferrer noopener">${label}</a>`;
  });

  return result.replace(/\n/g, '<br />');
};

export const renderMarkdown = (markdown) => {
  if (!markdown) {
    return '';
  }

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];

  let paragraphBuffer = [];
  let listType = null;
  let listBuffer = [];
  let inCodeBlock = false;
  let codeLanguage = '';
  let codeBuffer = [];

  const flushParagraph = () => {
    if (!paragraphBuffer.length) {
      return;
    }
    const content = paragraphBuffer.join('\n');
    html.push(`<p>${renderInline(content)}</p>`);
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listType || !listBuffer.length) {
      listType = null;
      listBuffer = [];
      return;
    }
    const items = listBuffer.map((item) => `<li>${renderInline(item)}</li>`).join('');
    html.push(`<${listType}>${items}</${listType}>`);
    listType = null;
    listBuffer = [];
  };

  const flushCodeBlock = () => {
    if (!codeBuffer.length) {
      codeLanguage = '';
      return;
    }
    const langClass = codeLanguage ? ` class="language-${escapeAttribute(codeLanguage)}"` : '';
    html.push(`<pre><code${langClass}>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
    codeLanguage = '';
    codeBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (inCodeBlock) {
      if (/^```/.test(trimmed)) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        codeBuffer.push(line);
      }
      continue;
    }

    if (/^```/.test(trimmed)) {
      flushParagraph();
      flushList();
      inCodeBlock = true;
      codeLanguage = trimmed.slice(3).trim();
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const horizontalRuleMatch = /^(\*{3,}|-{3,}|_{3,})$/.test(trimmed);
    if (horizontalRuleMatch) {
      flushParagraph();
      flushList();
      html.push('<hr />');
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = Math.min(headingMatch[1].length, 6);
      html.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    const blockquoteMatch = /^>\s?(.*)$/.exec(line);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      html.push(`<blockquote>${renderInline(blockquoteMatch[1])}</blockquote>`);
      continue;
    }

    const orderedListMatch = /^(\d+)\.\s+(.*)$/.exec(trimmed);
    if (orderedListMatch) {
      flushParagraph();
      if (listType && listType !== 'ol') {
        flushList();
      }
      listType = 'ol';
      listBuffer.push(orderedListMatch[2]);
      continue;
    }

    const unorderedListMatch = /^[*-+]\s+(.*)$/.exec(trimmed);
    if (unorderedListMatch) {
      flushParagraph();
      if (listType && listType !== 'ul') {
        flushList();
      }
      listType = 'ul';
      listBuffer.push(unorderedListMatch[1]);
      continue;
    }

    paragraphBuffer.push(line);
  }

  if (inCodeBlock) {
    flushCodeBlock();
    inCodeBlock = false;
  }

  flushParagraph();
  flushList();

  return html.join('\n');
};

