import { expect, signIn, test, type Page } from './fixtures';

/**
 * WCAG 2.4.7 (focus visible) and 2.4.11 (focus not obscured): Tab through each main page and check every stop shows a
 * focus indicator (an outline or a ring) on the element or the control it belongs to, and isn't hidden under the
 * sticky header.
 */
async function focusReport(page: Page) {
  return page.evaluate(() => {
    let el: Element | null = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    if (!el || el === document.body) return null;
    const shows = (e: Element) => {
      const s = getComputedStyle(e);
      return (
        (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow !== 'none' && s.boxShadow !== '')
      );
    };
    // The indicator may be drawn on the control's host or a wrapper (e.g. tc-button rings its chip).
    let shown = false;
    for (
      let e: Element | null = el, i = 0;
      e && i < 4 && !shown;
      e = e.parentElement ?? (e.getRootNode() as ShadowRoot).host ?? null, i++
    )
      shown =
        shows(e) ||
        [...e.children].some(
          (c) => getComputedStyle(c).outlineStyle !== 'none' && c.matches(':is(.tc-focus-ring, [class*="ring"])'),
        );
    // Hidden if something else is on top at its centre (e.g. the sticky header or composer over a scrolled control).
    const r = el.getBoundingClientRect();
    let hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    while (hit?.shadowRoot) {
      const inner = hit.shadowRoot.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!inner || inner === hit) break;
      hit = inner;
    }
    const host = (el.getRootNode() as ShadowRoot).host;
    const obscured = r.width > 0 && !!hit && !el.contains(hit) && !hit.contains(el) && !(host && host.contains(hit));
    const label = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.tagName).trim().slice(0, 50);
    const by = hit ? `${hit.tagName.toLowerCase()}.${String((hit as HTMLElement).className).slice(0, 40)}` : '';
    return { label, shown, obscured, by, tag: el.tagName.toLowerCase() };
  });
}

for (const path of [
  '/brief',
  '/chats',
  '/chats/fraud',
  '/artifacts',
  '/artifacts/approval-tiers-rfc-md',
  '/projects',
  '/projects/fraud-rollout',
]) {
  test(`every Tab stop on ${path} shows where focus is`, async ({ page }) => {
    test.skip(test.info().project.name !== 'light', 'one theme is enough for focus order');
    await signIn(page, 'alex', path);
    await page.waitForLoadState('networkidle');
    const problems: string[] = [];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const f = await focusReport(page);
      if (!f) continue;
      if (!f.shown) problems.push(`no visible focus on ${f.tag} "${f.label}"`);
      if (f.obscured) problems.push(`focus on ${f.tag} "${f.label}" is under ${f.by}`);
    }
    expect([...new Set(problems)], [...new Set(problems)].join('\n')).toEqual([]);
  });
}
