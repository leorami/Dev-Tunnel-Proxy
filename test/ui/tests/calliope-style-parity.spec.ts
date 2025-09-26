import { test, expect } from '@playwright/test';

const pages = ['/status', '/health', '/reports', '/dashboard/'];

async function openCalliope(page){
  const btn = page.locator('#calliopeOpen, #aiSelfCheckGlobal');
  await btn.first().click();
}

function pickStyles(el: any){
  return el.evaluate((node: HTMLElement) => {
    const s = getComputedStyle(node);
    return {
      bg: s.backgroundColor,
      br: s.borderRadius,
      bc: s.borderColor,
      bgt: s.backgroundImage,
    };
  });
}

async function resolveVar(page:any, cssVar:string){
  return await page.evaluate((v)=>{
    const tmp = document.createElement('div');
    tmp.style.background = `var(${v})`;
    document.body.appendChild(tmp);
    const color = getComputedStyle(tmp).backgroundColor;
    document.body.removeChild(tmp);
    return color;
  }, cssVar);
}

test.describe('Calliope style parity', () => {
  for (const theme of ['dark','light'] as const){
    for (const url of pages){
      test(`${url} matches chat/textarea/button styles in ${theme}`, async ({ page }) => {
        await page.goto('/status', { waitUntil: 'domcontentloaded' });
        await page.evaluate((t)=>{ document.documentElement.setAttribute('data-theme', t as any); localStorage.setItem('dtpTheme', t as any); }, theme);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await openCalliope(page);
        const refBtns = page.locator('.ai-actions .btn');
        const refOrder = (await refBtns.allTextContents()).map(t=>t.trim()).slice(0,4);
        const expectedChatBg = await resolveVar(page, '--codeBg');
        const expectedTextareaBorder = await resolveVar(page, '--codeBorder');

        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.evaluate((t)=>{ document.documentElement.setAttribute('data-theme', t as any); localStorage.setItem('dtpTheme', t as any); }, theme);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await openCalliope(page);
        const chat = page.locator('#aiChat');
        const textarea = page.locator('#aiQuery');
        const btns = page.locator('.ai-actions .btn');
        const order = (await btns.allTextContents()).map(t=>t.trim()).slice(0,4);
        await expect(order).toEqual(refOrder);
        const chatStyles = await pickStyles(chat);
        const taStyles = await pickStyles(textarea);
        await expect(chatStyles.bg).toBe(expectedChatBg);
        await expect(taStyles.bc).toBe(expectedTextareaBorder);
      });
    }
  }
});


