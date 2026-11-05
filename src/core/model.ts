import { z } from 'zod';
import { createHash } from 'node:crypto';
import { characterStrokes } from './strokes.js';
export const idSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
export const projectSchema = z.object({
  id: idSchema, title: z.string().trim().min(1).max(60),
  template: z.enum(['chinese-tracing', 'chinese-stroke-order']).default('chinese-tracing'),
  paper: z.object({ size: z.literal('A4').default('A4'), orientation: z.literal('portrait').default('portrait'), marginMm: z.number().min(8).max(35).default(12) }).default({ size: 'A4', orientation: 'portrait', marginMm: 12 }),
  layout: z.object({
    grid: z.literal('tianzige').default('tianzige'), gridSizeMm: z.number().min(8).max(30).default(15),
    sampleCells: z.number().int().min(1).max(20).default(1), traceCells: z.number().int().min(0).max(20).default(4), blankCells: z.number().int().min(0).max(20).default(4),
    showPinyin: z.boolean().default(true), fontFamily: z.string().max(100).default('Hiragino Sans GB'), fontPath: z.string().optional(), rowsPerPage: z.number().int().min(1).max(30).optional()
  }).default({grid:'tianzige',gridSizeMm:15,sampleCells:1,traceCells:4,blankCells:4,showPinyin:true,fontFamily:'Hiragino Sans GB'}),
  items: z.array(z.object({ character: z.string().regex(/^\p{Script=Han}$/u, '需要单个汉字'), pinyin: z.string().max(24).regex(/^[\p{L}\p{M}\süÜ:0-9'-]*$/u).default('') })).min(1).max(10000),
  pageCount: z.number().int().min(1).max(200).optional(), repeatToPageCount: z.boolean().default(false)
}).strict();
export type Project = z.infer<typeof projectSchema>;
export type Item = Project['items'][number];
export type Sheet = { number: number; items: Item[]; hash: string };
export type Issue = { severity: 'error' | 'warning'; code: string; message: string; page?: number };
export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function geometry(p: Project) {
  const rowHeight = p.layout.gridSizeMm + (p.layout.showPinyin ? 7 : 0) + 4;
  const usableHeight = 297 - 2*p.paper.marginMm - 36;
  const capacity = Math.floor(usableHeight / rowHeight);
  const strokeColumns = Math.floor((210 - 2*p.paper.marginMm) / p.layout.gridSizeMm);
  return { rowHeight, capacity, rows: p.layout.rowsPerPage ?? capacity, usableHeight, strokeColumns,
    width: (p.layout.sampleCells+p.layout.traceCells+p.layout.blankCells)*p.layout.gridSizeMm };
}
export function itemHeight(p:Project, item:Item) {
  if(p.template==='chinese-tracing') return geometry(p).rowHeight;
  const {strokeColumns}=geometry(p);
  const count=characterStrokes(item.character)?.length??1;
  // Per character: pinyin + instruction + numbered stroke rows + practice label/grid + gap.
  return (p.layout.showPinyin?7:0) + 5 + Math.ceil(count/Math.max(1,strokeColumns))*(p.layout.gridSizeMm+4) + 5 + p.layout.gridSizeMm + 5;
}
function groupedItems(p:Project,repeatPages?:number):Item[][] {
  const {usableHeight,rows}=geometry(p);
  const limit=p.template==='chinese-tracing'?rows:(p.layout.rowsPerPage??10000);
  const pages:Item[][]=[];
  let cursor=0;
  while(repeatPages===undefined?cursor<p.items.length:pages.length<repeatPages) {
    const items:Item[]=[];let used=0;
    while(items.length<limit&&(repeatPages!==undefined||cursor<p.items.length)) {
      const item=p.items[cursor%p.items.length],height=itemHeight(p,item);
      if(used+height>usableHeight+0.000001)break;
      items.push(item);used+=height;cursor++;
    }
    if(!items.length)throw new Error('单个练习块超过页面可用高度，请减小字格尺寸。');
    pages.push(items);if(pages.length>200)throw new Error('最多支持 200 页。');
  }
  return pages;
}
export function layoutIssues(p: Project): Issue[] {
  const g=geometry(p),issues:Issue[]=[];
  if(g.width>210-2*p.paper.marginMm)issues.push({severity:'error',code:'ROW_OVERFLOW',message:'字格总宽超过纸张内容区，请减少格数或尺寸。'});
  if(p.template==='chinese-tracing'&&(g.rows>g.capacity||g.capacity<1))issues.push({severity:'error',code:'PAGE_OVERFLOW',message:'每页行数超过可用高度。'});
  if(p.template==='chinese-stroke-order') {
    for(const character of new Set(p.items.map(i=>i.character))) {
      if(!characterStrokes(character))issues.push({severity:'error',code:'STROKE_DATA_MISSING',message:`本地笔顺库没有“${character}”，请替换该字；不会推测或联网补全笔顺。`});
    }
    if(p.items.some(item=>itemHeight(p,item)>g.usableHeight))issues.push({severity:'error',code:'PAGE_OVERFLOW',message:'单个笔顺练习块超过页面可用高度，请减小字格尺寸。'});
  }
  if(!issues.some(i=>i.severity==='error')) {
    try {
      const natural=groupedItems(p).length;
      if(p.pageCount&&p.pageCount<natural)issues.push({severity:'error',code:'PAGE_COUNT_TOO_SMALL',message:`内容需要 ${natural} 页，不能裁切。`});
      if(p.pageCount&&p.pageCount>natural&&!p.repeatToPageCount)issues.push({severity:'error',code:'REPEAT_REQUIRED',message:'扩展页数需要显式设置 repeatToPageCount: true。'});
    }catch(e){issues.push({severity:'error',code:'PAGE_LIMIT',message:(e as Error).message});}
  }
  if(p.layout.showPinyin&&p.items.some(i=>!i.pinyin))issues.push({severity:'warning',code:'PINYIN_MISSING',message:'部分汉字没有显式拼音；不会自动推测读音。'});
  if(p.repeatToPageCount)issues.push({severity:'warning',code:'REPEATED_CONTENT',message:'按输入顺序循环填充至目标页数，每页显示练习页码。'});
  return issues;
}
export function paginate(p: Project,fontFingerprint=''):Sheet[] {
  const errors=layoutIssues(p).filter(i=>i.severity==='error');
  if(errors.length)throw new Error(errors.map(i=>i.message).join(' '));
  const natural=groupedItems(p);
  const groups=p.repeatToPageCount?groupedItems(p,p.pageCount??natural.length):natural;
  return groups.map((items,idx)=>{
    const number=idx+1;
    // Preserve existing tracing hashes; new template/data must participate in stroke-page approvals.
    const strokeContent=p.template==='chinese-stroke-order'?{template:p.template,strokes:items.map(i=>characterStrokes(i.character))}:{};
    return {number,items,hash:hash({renderer:1,number,title:p.title,paper:p.paper,layout:p.layout,items,fontFingerprint,...strokeContent})};
  });
}
