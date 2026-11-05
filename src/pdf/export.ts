import { chromium } from 'playwright';
import { browserOptions } from './browser.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../core/store.js';
import { validate } from '../core/validate.js';
import { resolveFont } from '../core/fonts.js';
import { renderDocument } from '../core/render.js';
export async function exportPDF(store:Store,id:string,all=false,out?:string) {
  const snapshot=await store.snapshot(id), {project,pages,reviews}=snapshot;
  const selected=pages.filter((_,i)=>all||reviews[i].status==='approved');
  if(!selected.length) throw new Error('没有已批准页面，请在本地 Review UI 人工审核，或显式使用 --all 导出草稿。');
  const issues=validate(project); if(issues.some(i=>i.severity==='error')) throw new Error(JSON.stringify(issues));
  const exportDir=path.join(await store.safeDir(id),'exports');
  await fs.mkdir(exportDir,{recursive:true});
  if((await fs.lstat(exportDir)).isSymbolicLink()) throw new Error('导出目录不能是符号链接');
  const file=path.resolve(out??path.join(exportDir,all?'all.pdf':'approved.pdf'));
  if(path.dirname(file)!==exportDir||!file.endsWith('.pdf')) throw new Error(`输出必须是项目 exports 目录内的 .pdf 文件：${exportDir}`);
  if(await fs.lstat(file).then(s=>s.isSymbolicLink(),()=>false)) throw new Error('输出不能是符号链接');
  const font=resolveFont(project),browser=await chromium.launch(browserOptions());
  const tmp=path.join(exportDir,`.${randomUUID()}.tmp`);
  try {
    const page=await browser.newPage();
    await page.route('**/*',route=>route.abort());
    await page.setContent(renderDocument(project,selected,font.dataUrl));
    await page.evaluate(async()=>{await document.fonts.ready;if(!document.fonts.check('16px WorksheetFont'))throw new Error('中文字体加载失败');});
    const problems=await page.evaluate(()=>Array.from(document.querySelectorAll<HTMLElement>('.sheet')).flatMap(sheet=>{
      const b=sheet.getBoundingClientRect();
      const main=sheet.querySelector('main')!.getBoundingClientRect();
      const title=sheet.querySelector('h1')!;
      const pinyinOverflow=Array.from(sheet.querySelectorAll('.pinyin')).some(el=>el.scrollWidth>el.clientWidth+1);
      return main.bottom>b.bottom-20||main.right>b.right||title.scrollWidth>title.clientWidth||pinyinOverflow ? [Number(sheet.dataset.page)]:[];
    }));
    if(problems.length) throw new Error(`页面溢出：${problems.join(',')}`);
    await page.pdf({path:tmp,format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false,margin:{top:0,right:0,bottom:0,left:0}});
    // Reject a stale export if project content or reviews changed during rendering.
    if((await store.snapshot(id)).revision!==snapshot.revision) throw new Error('项目或审核在导出期间变化，请重新导出');
    await fs.rename(tmp,file);
    return {path:file,pageCount:selected.length,pages:selected.map(s=>s.number),bytes:(await fs.stat(file)).size,draft:all};
  } finally {await browser.close();await fs.rm(tmp,{force:true});}
}
