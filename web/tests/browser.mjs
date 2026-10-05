/** Optional real-browser checks. Install Playwright separately; no server required. */
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { build, root } from '../scripts/build.mjs';
const modulePath=process.env.PLAYWRIGHT_MODULE;
let chromium;
try { ({chromium}=await import(modulePath ? pathToFileURL(modulePath).href : 'playwright')); }
catch { throw Error('Install Playwright first: npm install --no-save playwright && npx playwright install chromium'); }
await build();
await mkdir(path.join(root,'test-results'),{recursive:true});
const browser=await chromium.launch({headless:true,args:['--allow-file-access-from-files']});
const errors=[];
try {
  const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'dist/index.html')).href);
  await page.waitForSelector('[data-list-object]');
  assert.equal(await page.locator('[data-list-object]').count(),6);
  const a=page.locator('svg [data-name="A"]'),m=page.locator('svg [data-name="M"]');
  async function center(locator) {const point=locator.locator('circle').last();return {x:Number(await point.getAttribute('cx')),y:Number(await point.getAttribute('cy'))};}
  const a0=await center(a),m0=await center(m);
  await page.mouse.move(a0.x+(await page.locator('#canvas').boundingBox()).x,a0.y+(await page.locator('#canvas').boundingBox()).y);
  await page.mouse.down();await page.mouse.move(a0.x+(await page.locator('#canvas').boundingBox()).x+65,a0.y+(await page.locator('#canvas').boundingBox()).y-65,{steps:8});await page.mouse.up();
  const a1=await center(a),m1=await center(m);
  assert.ok(Math.abs(a1.x-a0.x-65)<.1);assert.ok(Math.abs(m1.x-m0.x-32.5)<.1);
  assert.equal(await page.locator('#prop-x').inputValue(),'-1');
  await page.locator('#undo').click();assert.ok(Math.abs((await center(a)).x-a0.x)<.1);
  await page.locator('#redo').click();assert.ok(Math.abs((await center(a)).x-a1.x)<.1);
  await page.locator('#prop-x').fill('0');await page.locator('#prop-y').fill('2');
  await page.getByRole('button',{name:'변경 적용',exact:true}).click();
  await page.locator('[data-list-object]').filter({hasText:'M'}).last().click();
  assert.equal(await page.locator('#prop-x').inputValue(),'1.5');assert.ok(await page.locator('#prop-x').isDisabled());
  const savePromise=page.waitForEvent('download');await page.locator('#save').click();const saved=await savePromise;
  const savedPath=path.join(root,'test-results','scene.euclidraw');await saved.saveAs(savedPath);
  const exportPromise=page.waitForEvent('download');await page.locator('#export').click();await (await exportPromise).saveAs(path.join(root,'test-results','scene.svg'));
  await page.locator('#new').click();await page.locator('#confirm-dialog button[value="ok"]').click();
  assert.equal(await page.locator('[data-list-object]').count(),0);
  await page.locator('#file-input').setInputFiles(savedPath);await page.locator('#confirm-dialog button[value="ok"]').click();
  await page.waitForSelector('[data-list-object]');assert.equal(await page.locator('[data-list-object]').count(),6);
  await page.reload();await page.waitForSelector('[data-list-object]');assert.equal(await page.locator('[data-list-object]').count(),6);
  // Invalid imports must leave the existing scene intact.
  const broken=path.join(root,'test-results','invalid.euclidraw');await writeFile(broken,JSON.stringify({schemaVersion:900}));
  await page.locator('#file-input').setInputFiles(broken);await page.waitForSelector('#error-dialog[open]');
  assert.equal(await page.locator('[data-list-object]').count(),6);await page.locator('#error-dialog button').click();
  await page.getByRole('button',{name:'A 선택',exact:true}).click();
  await page.getByRole('button',{name:'삭제',exact:true}).click();await page.waitForSelector('#confirm-dialog[open]');
  await page.locator('#confirm-dialog button[value="cancel"]').click();assert.equal(await page.locator('[data-list-object]').count(),6);
  await page.getByRole('button',{name:'삭제',exact:true}).click();await page.locator('#confirm-dialog button[value="ok"]').click();
  assert.equal(await page.locator('[data-list-object]').count(),2);await page.locator('#undo').click();assert.equal(await page.locator('[data-list-object]').count(),6);
  assert.deepEqual(errors,[],'Browser errors occurred');
  await page.screenshot({path:path.join(root,'test-results','desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'test-results','mobile.png')});
  console.log('PASS: drag, dependent midpoint, one-step undo, redo, coordinate input, save, SVG export, import, autosave reload, invalid import, cascading delete and restoration.');
} finally {await browser.close();}
