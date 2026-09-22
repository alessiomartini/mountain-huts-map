import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
});

const page = await context.newPage();
await page.goto('https://mountain-huts-map.alemarti-2001.workers.dev/en/', {
  waitUntil: 'networkidle',
});

// Take screenshot
await page.screenshot({
  path: 'mobile-screenshot.png',
  fullPage: true,
});

// Check for console errors
page.on('console', msg => console.log('CONSOLE:', msg.text()));

// Get computed layout info
const layoutInfo = await page.evaluate(() => {
  const siteHeader = document.querySelector('.site-header');
  const mapPage = document.querySelector('.map-page');
  const brand = document.querySelector('.site-header__brand');
  const nav = document.querySelector('.site-header__nav');

  const result = {
    siteHeaderRect: siteHeader?.getBoundingClientRect(),
    brandRect: brand?.getBoundingClientRect(),
    navRect: nav?.getBoundingClientRect(),
    mapPageRect: mapPage?.getBoundingClientRect(),
    brandText: brand?.textContent,
    brandWidth: brand?.scrollWidth,
    headerHeight: siteHeader?.offsetHeight,
  };
  return result;
});

console.log('Layout info:', JSON.stringify(layoutInfo, null, 2));

await browser.close();
console.log('Done!');
