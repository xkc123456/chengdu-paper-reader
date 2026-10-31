import { homeCopy } from "./homeCopy";

/**
 * 只给首页「/」的第一份 HTML 准备一段可读正文。
 * 这不是全站 SSR：导入面板、示例论文和工作台仍要等 React 挂载。
 * 脚本不执行时，这段留在 #root 里；脚本执行后 createRoot 会整段换掉。
 */

const EMPTY_ROOT = /<div id="root">\s*<\/div>/;

const BRAND_MARK = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 7.5c4.5-.6 8.1.3 11 2.8v15c-2.9-2.5-6.5-3.4-11-2.8zM27 7.5c-4.5-.6-8.1.3-11 2.8v15c2.9-2.5 6.5-3.4 11-2.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M16 10.3v15" stroke="currentColor" stroke-width="1.8"/></svg>`;

const CHECK = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function homeStaticBodyHtml(): string {
  const copy = homeCopy;
  const proof = copy.proof
    .map(
      item =>
        `<div><b>${escapeHtml(item.n)}</b><span>${escapeHtml(item.title)}<small>${escapeHtml(item.detail)}</small></span></div>`
    )
    .join("");
  const capabilities = copy.capabilities
    .map(item => `<span>${CHECK}${escapeHtml(item)}</span>`)
    .join("");
  const methodHead = copy.methodHead
    .map(cell => `<span>${escapeHtml(cell)}</span>`)
    .join("");
  const methodRows = copy.methodRows
    .map(
      row =>
        `<div class="method-row"><b>${escapeHtml(row.kind)}</b><span>${escapeHtml(row.ask)}</span><span>${escapeHtml(row.focus)}</span></div>`
    )
    .join("");
  const faq = copy.faq
    .map(
      item =>
        `<details open><summary>${escapeHtml(item.question)}</summary><p>${escapeHtml(item.answer)}</p></details>`
    )
    .join("");

  return `<div class="site-shell home-static">
<header class="site-header">
<a class="brand" href="#top" aria-label="澄读首页">${BRAND_MARK}<span>${escapeHtml(copy.brand)}</span><small>${escapeHtml(copy.brandTag)}</small></a>
<nav aria-label="主导航"><a href="#method">如何读</a><a href="#faq">使用边界</a></nav>
<div class="header-actions"><a class="header-cta" href="#faq">常见疑问</a></div>
</header>
<main>
<section class="hero" id="top">
<div class="hero-copy">
<div class="hero-kicker"><span>${escapeHtml(copy.kicker)}</span><i></i>${escapeHtml(copy.kickerAside)}</div>
<h1>${escapeHtml(copy.headlineBefore)}<br>${escapeHtml(copy.headlineMiddle)}<em>${escapeHtml(copy.headlineEm)}</em>${escapeHtml(copy.headlineAfter)}</h1>
<p class="hero-lead">${escapeHtml(copy.claim)}</p>
<div class="hero-proof">${proof}</div>
</div>
<aside class="import-panel home-static-note"><strong>精读工作台需要脚本</strong><p>${escapeHtml(copy.noScriptNote)}</p></aside>
</section>
<section class="capability-strip" aria-label="支持能力">${capabilities}</section>
<section class="method-section" id="method">
<div class="method-intro"><h2>${escapeHtml(copy.methodTitleBefore)}<br>${escapeHtml(copy.methodTitleAfter)}</h2><p>${escapeHtml(copy.methodLead)}</p></div>
<div class="method-table"><div class="method-row head">${methodHead}</div>${methodRows}</div>
</section>
<section class="faq-section" id="faq" aria-labelledby="faq-heading">
<div><span class="eyebrow">${escapeHtml(copy.faqEyebrow)}</span><h2 id="faq-heading">${escapeHtml(copy.faqHeading)}</h2></div>
<div class="faq-static"><p class="faq-preview">${escapeHtml(copy.faqPreview)}</p>${faq}</div>
</section>
</main>
<footer><a class="brand footer-brand" href="#top">${BRAND_MARK}<span>${escapeHtml(copy.brand)}</span></a><p>${escapeHtml(copy.footer)}</p><div><a href="#method">阅读方法</a><a href="#faq">使用边界</a></div></footer>
</div>`;
}

/** 只替换空的挂载点。已经注入过就原样返回，避免构建管线跑两遍时套娃。 */
export function injectHomeStaticHtml(html: string): string {
  if (!EMPTY_ROOT.test(html)) return html;
  const titled = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(homeCopy.documentTitle)}</title>`
  );
  return titled.replace(
    EMPTY_ROOT,
    `<div id="root">${homeStaticBodyHtml()}</div>`
  );
}
