import { describe,it,expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolveFont } from '../src/core/fonts';
import { projectSchema,paginate } from '../src/core/model';
import { renderDocument } from '../src/core/render';
const project=()=>projectSchema.parse({id:'font-regression',title:'字体检查',items:[{character:'春',pinyin:'chūn'}]});
describe('预览及 PDF 字体名称回归',()=>{
  it('将实际 PostScript/完整字体名称用于两种页面相同的 @font-face',()=>{
    const p=project(),font=resolveFont(p);
    expect(font.localNames).toContain(font.font.postscriptName);
    expect(font.localNames).toContain(font.font.fullName);
    const html=renderDocument(p,paginate(p),font.dataUrl,font.localNames);
    expect(html).toContain(`local(${JSON.stringify(font.font.postscriptName)})`);
    expect(html).toContain(`local(${JSON.stringify(font.font.fullName)})`);
    expect(html.indexOf(`local(${JSON.stringify(font.font.postscriptName)})`)).toBeLessThan(html.indexOf(`local(${JSON.stringify(p.layout.fontFamily)})`));
  });
  it('同一字体文件使用不同别名时，缓存不会沿用之前的别名',()=>{
    const fontPath='/System/Library/Fonts/Supplemental/Arial.ttf';
    expect(existsSync(fontPath)).toBe(true);
    const a=project(),b=project();a.layout.fontPath=fontPath;b.layout.fontPath=fontPath;a.layout.fontFamily='Local label A';b.layout.fontFamily='Local label B';
    expect(resolveFont(a).localNames).toContain('Local label A');
    const second=resolveFont(b);expect(second.localNames).toContain('Local label B');expect(second.localNames).not.toContain('Local label A');
    expect(second.dataUrl).toMatch(/^data:font\/ttf;base64,/);
  });
  it('仍优先使用显式字体文件，字体名称不能突破 style 标签',()=>{
    const p=project(),pages=paginate(p);
    expect(renderDocument(p,pages,'data:font/otf;base64,TEST',['Name'])).toContain('src:url("data:font/otf;base64,TEST")');
    const html=renderDocument(p,pages,undefined,['Bad"</style><script>alert(1)</script>']);
    expect(html).not.toContain('<script>');expect(html).toContain('\\3c /style\\3e ');
  });
});
