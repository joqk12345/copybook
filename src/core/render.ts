import { geometry, itemHeight, type Item, type Project, type Sheet } from './model.js';
import { characterStrokes } from './strokes.js';
const esc = (s: string) => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const sheetCSS = `
@page { size: A4 portrait; margin: 0; }
* { box-sizing: border-box; }
html,body { margin: 0; padding: 0; background: #fff; }
.sheet { width: 210mm; height: 297mm; background: white; color:#24343a; position:relative; break-after:page; font-family:WorksheetFont,Arial,sans-serif; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.sheet:last-child { break-after:auto; }
.sheet-header {height:24mm; border-bottom:.3mm solid #aab5b5; margin-bottom:6mm;}
.sheet-header .kicker { font-size:2.5mm; letter-spacing:.65mm; color:#637b7b; margin-bottom:2mm; }
.sheet-header h1 {font-family:WorksheetFont,sans-serif; font-size:5.5mm; font-weight:400; line-height:7mm; margin:0; white-space:nowrap;}
.group-heading {font-size:3mm;line-height:4mm;margin-top:1mm;white-space:nowrap;}
.sheet-header .meta {font-size:2.6mm; margin-top:2mm; color:#708080;}
.practice-row { display:flex; flex-direction:column; align-items:flex-start; }
.pinyin {height:7mm; line-height:7mm; text-align:center; font: 4mm/7mm Arial,sans-serif; color:#3e5559;}
.cells {display:flex;}
.cell {position:relative; flex-shrink:0;}
.cell svg {position:absolute;inset:0;width:100%;height:100%;}
.glyph {position:relative; display:flex; align-items:center; justify-content:center; width:100%;height:100%;font-family:WorksheetFont,sans-serif;line-height:1;font-weight:400;color:#26353a;}
.glyph.trace {color:#bcc2c4;}
.stroke-block {break-inside:avoid;}
.stroke-instruction,.practice-label {height:5mm;font-size:2.6mm;line-height:5mm;color:#657979;}
.stroke-steps {display:flex;flex-wrap:wrap;}
.stroke-step {flex-shrink:0;}
.stroke-number {height:4mm;text-align:center;font:2.5mm/4mm Arial,sans-serif;color:#738888;}
.sheet-footer {position:absolute; bottom:6mm;left:12mm;right:12mm;display:flex;justify-content:space-between;font-size:2.5mm;color:#7b898c;}
@media screen { body {width:210mm;} }
`;
function grid() {
  return '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><rect x=".5" y=".5" width="99" height="99" fill="none" stroke="#a3afb2" stroke-width=".7"/><path d="M50 0V100M0 50H100" stroke="#bac4c6" stroke-width=".5" stroke-dasharray="3 3"/></svg>';
}
function practiceCells(p:Project,item:Item) {
  const l=p.layout,total=l.sampleCells+l.traceCells+l.blankCells;
  return `<div class="cells">${Array.from({length:total},(_,c)=>`<div class="cell" style="width:${l.gridSizeMm}mm;height:${l.gridSizeMm}mm">${grid()}<span class="glyph ${c>=l.sampleCells?'trace':''}" style="font-size:${l.gridSizeMm*.76}mm">${c<l.sampleCells+l.traceCells?esc(item.character):''}</span></div>`).join('')}</div>`;
}
function renderItem(p:Project,item:Item) {
  const l=p.layout,pinyin=l.showPinyin?`<div class="pinyin" style="width:${l.gridSizeMm}mm">${esc(item.pinyin)}</div>`:'';
  if(p.template==='chinese-tracing')return `<div class="practice-row" style="height:${itemHeight(p,item)}mm">${pinyin}${practiceCells(p,item)}</div>`;
  const strokes=characterStrokes(item.character);
  if(!strokes)throw new Error(`缺少“${item.character}”的本地笔顺数据`);
  const columns=geometry(p).strokeColumns;
  return `<section class="stroke-block" data-character="${esc(item.character)}" style="height:${itemHeight(p,item)}mm">${pinyin}
    <div class="stroke-instruction">${esc(item.character)} · ${strokes.length} 笔　笔顺示范（红色为当前笔）</div>
    <div class="stroke-steps" style="width:${columns*l.gridSizeMm}mm">${strokes.map((_,step)=>`<div class="stroke-step" data-step="${step+1}" style="width:${l.gridSizeMm}mm"><div class="cell" style="width:${l.gridSizeMm}mm;height:${l.gridSizeMm}mm">${grid()}<svg class="stroke-glyph" viewBox="0 0 100 100" role="img" aria-label="${esc(item.character)} 第 ${step+1} 笔，共 ${strokes.length} 笔"><g transform="translate(10 10) scale(.078125) translate(0 900) scale(1 -1)">${strokes.map((path,index)=>`<path d="${esc(path)}" fill="${index===step?'#b84335':index<step?'#617272':'#e9edec'}" data-stroke="${index+1}" data-state="${index===step?'current':index<step?'completed':'upcoming'}"/>`).join('')}</g></svg></div><div class="stroke-number">${step+1}</div></div>`).join('')}</div>
    <div class="practice-label">描红与空白练习</div>${practiceCells(p,item)}</section>`;
}
export function renderSheet(p:Project,s:Sheet) {
  return `<article class="sheet" data-page="${s.number}" data-hash="${s.hash}" style="padding:${p.paper.marginMm}mm">
    <header class="sheet-header"><div class="kicker">WORKSHEET STUDIO / ${p.template==='chinese-stroke-order'?'笔顺练习':'汉字练习'}</div><h1>${esc(p.title)}</h1>${s.items[0].unit||s.items[0].chapter?`<div class="group-heading">${esc([s.items[0].unit,s.items[0].chapter].filter(Boolean).join(' · '))}</div>`:''}<div class="meta">姓名：________________　日期：________________</div></header>
    <main>${s.items.map(item=>renderItem(p,item)).join('')}</main>
    <footer class="sheet-footer"><span>${p.template==='chinese-stroke-order'?'笔顺图形：Hanzi Writer Data · Arphic Public License':'静心观察 · 认真书写'}</span><span>练习 ${String(s.number).padStart(2,'0')}</span></footer></article>`;
}
export function renderDocument(p:Project,pages:Sheet[],fontDataUrl?:string) {
  const family=p.layout.fontFamily.replace(/["\\<>\n\r]/g,'');
  const source=fontDataUrl?`url("${fontDataUrl}")`:`local("${family}")`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(p.title)}</title><style>@font-face{font-family:WorksheetFont;src:${source};font-weight:400;font-display:block;}${sheetCSS}</style></head><body>${pages.map(s=>renderSheet(p,s)).join('')}</body></html>`;
}
