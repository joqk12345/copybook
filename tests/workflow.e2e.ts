import { test,expect } from '@playwright/test';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import demo from '../examples/demo.json';
const root=path.resolve('.tmp/e2e-projects');
function cli(args:string[]) {return JSON.parse(execFileSync(process.execPath,['--import','tsx','src/cli/index.ts',...args],{env:{...process.env,WORKSHEET_PROJECTS:root},encoding:'utf8'}));}
test('隔离项目：CLI → 自动预览 → 人工动作模拟 → 失效 → PDF',async({page})=>{
  await fs.mkdir('.tmp',{recursive:true});await fs.rm(root,{recursive:true,force:true});
  const input={...demo,id:'e2e-workflow',repeatToPageCount:false,pageCount:2,items:Array.from({length:16},(_,i)=>({character:i<8?'春':'夏',pinyin:i<8?'chūn':'xià'}))};
  const file=path.resolve('.tmp/e2e-input.json');await fs.writeFile(file,JSON.stringify(input));
  expect(cli(['project','create','--from',file]).ok).toBe(true);
  expect(cli(['render',input.id]).data.pageCount).toBe(2);
  expect(cli(['validate',input.id]).data.valid).toBe(true);
  expect(()=>cli(['review','set',input.id,'--page','1','--status','approved'])).toThrow();
  expect(()=>cli(['export','pdf',input.id,'--approved-only'])).toThrow();
  await page.goto(`/?project=${input.id}`);
  await expect(page.getByRole('heading',{name:input.title})).toBeVisible();
  const frame=page.frameLocator('iframe');await expect(frame.locator('.cell')).toHaveCount(72);
  const dims=await frame.locator('.cell').first().boundingBox();expect(dims!.width/.7).toBeCloseTo(15*96/25.4,0);
  const sheetBox=await frame.locator('.sheet').boundingBox();expect(sheetBox!.width/sheetBox!.height).toBeCloseTo(210/297,3);
  await page.getByLabel('审核反馈').fill('隔离 E2E 审核反馈');
  page.on('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'✓ 批准本页'}).click();await expect(page.locator('.badge')).toHaveText('已批准');
  await page.getByRole('button',{name:/第 02 页/}).click();
  await page.getByRole('button',{name:'✓ 批准本页'}).click();await expect(page.locator('.badge')).toHaveText('已批准');
  await page.reload();await expect(page.locator('.badge')).toHaveText('已批准');await expect(page.locator('.preview-toolbar')).toContainText('第 2 / 2 页');
  const firstHash=cli(['project','show',input.id]).data.pages[0].hash;
  await page.getByLabel('审核反馈').fill('未提交草稿不会丢失');
  input.items[8]={character:'秋',pinyin:'qiū'};await fs.writeFile(file,JSON.stringify(input));cli(['project','update',input.id,'--from',file]);
  await expect(page.locator('.badge')).toHaveText('待审核');await expect(page.getByLabel('审核反馈')).toHaveValue('未提交草稿不会丢失');
  await expect(page.getByRole('button',{name:'保留反馈并重新核对'})).toBeVisible();
  await expect(frame.locator('.glyph').first()).toHaveText('秋');
  const s=cli(['project','show',input.id]).data;expect(s.reviews.map((r:{status:string})=>r.status)).toEqual(['approved','draft']);expect(s.pages[0].hash).toBe(firstHash);
  const exported=cli(['export','pdf',input.id,'--approved-only']).data;
  const pdf=await PDFDocument.load(await fs.readFile(exported.path));expect(pdf.getPageCount()).toBe(1);expect(exported.pages).toEqual([1]);
  const twenty={...demo,id:'e2e-twenty'};await fs.writeFile(file,JSON.stringify(twenty));cli(['project','create','--from',file]);
  const result=cli(['export','pdf',twenty.id,'--all']).data;
  const bytes=await fs.readFile(result.path);expect(bytes.subarray(0,5).toString()).toBe('%PDF-');expect(bytes.subarray(-50).toString()).toContain('%%EOF');
  const doc=await PDFDocument.load(bytes);expect(doc.getPageCount()).toBe(20);
  for(const p of doc.getPages()){expect(p.getWidth()).toBeCloseTo(210/25.4*72,0);expect(p.getHeight()).toBeCloseTo(297/25.4*72,0);}
  await page.goto(`/?project=${twenty.id}`);await expect(page.locator('.preview-toolbar')).toContainText('第 1 / 20 页');
  await page.screenshot({path:'test-results/workspace.png',fullPage:true});
  const previewHTML=await (await page.request.get(`/api/projects/${twenty.id}/preview?page=1`)).text();
  expect(previewHTML).toContain('chūn');expect(previewHTML).toContain('class="glyph trace"');
  const forbidden=await page.request.post(`/api/projects/${twenty.id}/review`,{data:{}});expect(forbidden.status()).toBe(403);
});

test('笔顺练习：真实 SVG 步骤、预览和两页 A4 PDF',async({page})=>{
  const {default:example}=await import('../examples/stroke-order.json');
  const input={...example,id:'e2e-stroke-order'};
  await fs.mkdir('.tmp',{recursive:true});
  const file=path.resolve('.tmp/e2e-strokes.json');await fs.writeFile(file,JSON.stringify(input));
  cli(['project','create','--from',file]);
  await page.goto(`/?project=${input.id}`);
  await expect(page.getByText('STROKE ORDER / 笔顺练习')).toBeVisible();
  const frame=page.frameLocator('iframe');
  await expect(frame.locator('.stroke-block')).toHaveCount(2);
  await expect(frame.locator('.stroke-step')).toHaveCount(19); // 春 9 笔 + 夏 10 笔
  await expect(frame.locator('[data-state="current"]')).toHaveCount(19);
  const blocks=await frame.locator('.stroke-block').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));
  expect(blocks[0].bottom).toBeLessThanOrEqual(blocks[1].top+.1);
  await page.getByRole('button',{name:/第 02 页/}).click();
  await expect(frame.locator('.stroke-block').first()).toHaveAttribute('data-character','秋');
  const result=cli(['export','pdf',input.id,'--all']).data;
  const pdf=await PDFDocument.load(await fs.readFile(result.path));
  expect(pdf.getPageCount()).toBe(2);
  for(const sheet of pdf.getPages()){expect(sheet.getWidth()).toBeCloseTo(210/25.4*72,0);expect(sheet.getHeight()).toBeCloseTo(297/25.4*72,0);}
  await page.screenshot({path:'test-results/stroke-order.png',fullPage:true});
});
