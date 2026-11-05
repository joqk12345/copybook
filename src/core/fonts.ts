import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as fontkit from 'fontkit';
import type { Project, Issue } from './model.js';
const candidates = [
  ['/System/Library/Fonts/Hiragino Sans GB.ttc','Hiragino Sans GB'],
  ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc','Noto Sans CJK SC']
];
type ResolvedFont={font:fontkit.Font;fingerprint:string;dataUrl:string|undefined;path:string};
const cache=new Map<string,{stamp:string;value:ResolvedFont}>();
export function resolveFont(p: Project):ResolvedFont {
  const candidate = candidates.find(([path,family])=>family===p.layout.fontFamily && existsSync(path));
  const path = p.layout.fontPath ?? candidate?.[0];
  if (!path || !existsSync(path)) throw new Error(`找不到字体 ${p.layout.fontFamily}。请配置 layout.fontPath 指向本地已授权的 .ttf/.otf 文件。`);
  if (p.layout.fontPath && !/\.(ttf|otf)$/i.test(path)) throw new Error('外部字体仅支持 .ttf/.otf；系统 TTC 使用已知字体名。');
  const stat=statSync(path),stamp=`${stat.mtimeMs}:${stat.size}:${Boolean(p.layout.fontPath)}`;
  const cached=cache.get(path);if(cached?.stamp===stamp)return cached.value;
  const bytes = readFileSync(path);
  const parsed = fontkit.create(bytes);
  const font = 'fonts' in parsed ? parsed.fonts[0] : parsed;
  const fingerprint = createHash('sha256').update(bytes).digest('hex');
  const dataUrl = p.layout.fontPath ? `data:font/${path.endsWith('.otf')?'otf':'ttf'};base64,${bytes.toString('base64')}` : undefined;
  const value={font,fingerprint,dataUrl,path};cache.set(path,{stamp,value});return value;
}
export function fontIssues(p: Project): Issue[] {
  try {
    const {font} = resolveFont(p);
    const missing = [...new Set([...p.title,...('汉字练习姓名日期静心观察认真书写'+(p.template==='chinese-stroke-order'?'笔顺示范红色为当前笔描与空白练习图形':'')),...p.items.map(i=>i.character).join('')])].filter(c=>!/^\s$/.test(c)&&!font.hasGlyphForCodePoint(c.codePointAt(0)!));
    const issues:Issue[]=missing.length ? [{severity:'error',code:'MISSING_GLYPH',message:`字体缺少字符：${missing.join('')}`}]:[];
    const titleWidth=font.layout(p.title).positions.reduce((sum,pos)=>sum+pos.xAdvance,0)/font.unitsPerEm*5.5;
    if(titleWidth>210-2*p.paper.marginMm)issues.push({severity:'error',code:'TITLE_OVERFLOW',message:'标题超过页面可用宽度，请缩短标题。'});
    return issues;
  } catch(e) { return [{severity:'error',code:'FONT_UNAVAILABLE',message:(e as Error).message}]; }
}
