const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 2 });
  await p.goto('file://' + path.join(__dirname, 'feature-graphic.html'));
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(__dirname, 'feature@2x.png') });
  await b.close();
})();
