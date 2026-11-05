import { describe, expect, it } from 'vitest';
import { characterStrokes } from '../src/core/strokes';
import { geometry, itemHeight, layoutIssues, paginate, projectSchema } from '../src/core/model';
import { renderDocument } from '../src/core/render';
import example from '../examples/stroke-order.json';
const make = () => projectSchema.parse(example);
describe('离线笔顺练习', () => {
  it('使用本地真实笔画数据，明确拒绝缺失字和非法路径', () => {
    expect(characterStrokes('十')).toHaveLength(2);
    expect(characterStrokes('木')).toHaveLength(4);
    expect(characterStrokes('𠀀')).toBeNull();
    expect(characterStrokes('../x')).toBeNull();
    const p=make();p.items=[{character:'𠀀',pinyin:''}];
    expect(layoutIssues(p).some(i=>i.code==='STROKE_DATA_MISSING')).toBe(true);
    expect(()=>paginate(p)).toThrow('本地笔顺库没有');
  });
  it('每步编号、突出当前笔，保留先前笔画及未写轮廓', () => {
    const p=make();p.items=[{character:'十',pinyin:'shí'}];
    const html=renderDocument(p,paginate(p));
    expect((html.match(/class="stroke-step"/g)||[])).toHaveLength(2);
    expect((html.match(/data-state="current"/g)||[])).toHaveLength(2);
    expect((html.match(/data-state="completed"/g)||[])).toHaveLength(1);
    expect((html.match(/data-state="upcoming"/g)||[])).toHaveLength(1);
    expect(html).toContain('十 第 2 笔，共 2 笔');
    expect(html).toContain('scale(1 -1)');
    expect(html).toContain('描红与空白练习');
    expect(html).toContain('Arphic Public License');
  });
  it('按笔顺换行高度分页，完整练习块不截断，循环模式可复现', () => {
    const p=make();p.layout.gridSizeMm=20;delete p.layout.rowsPerPage;
    expect(geometry(p).strokeColumns).toBe(9);
    expect(itemHeight(p,{character:'夏',pinyin:'xià'})).toBe(90);
    const pages=paginate(p);
    expect(pages).toHaveLength(2);
    expect(pages.flatMap(s=>s.items)).toEqual(p.items);
    for(const sheet of pages)expect(sheet.items.reduce((sum,i)=>sum+itemHeight(p,i),0)).toBeLessThanOrEqual(geometry(p).usableHeight);
    p.pageCount=3;p.repeatToPageCount=true;
    expect(paginate(p)).toHaveLength(3);expect(paginate(p)).toEqual(paginate(p));
  });
  it('过高的单字练习块明确报错', () => {
    const p=make();p.layout.gridSizeMm=30;p.paper.marginMm=35;p.layout.sampleCells=1;p.layout.traceCells=1;p.layout.blankCells=1;p.items=[{character:'鬱',pinyin:'dá'}];
    expect(characterStrokes('鬱')!.length).toBe(29);
    expect(layoutIssues(p).some(i=>i.code==='PAGE_OVERFLOW')).toBe(true);
  });
  it('模板及笔顺内容参与哈希，修改第二页不影响第一页', () => {
    const p=make(),before=paginate(p);
    p.items[3]={character:'人',pinyin:'rén'};
    const after=paginate(p);expect(after[0].hash).toBe(before[0].hash);expect(after[1].hash).not.toBe(before[1].hash);
    p.template='chinese-tracing';expect(paginate(p)[0].hash).not.toBe(after[0].hash);
  });
});
