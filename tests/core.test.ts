import { describe,it,expect,beforeEach,afterEach } from 'vitest';
import { mkdtemp,rm,readFile,symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { projectSchema,paginate,layoutIssues } from '../src/core/model';
import { Store } from '../src/core/store';
import { validate } from '../src/core/validate';
import demo from '../examples/demo.json';
const make=()=>projectSchema.parse({...demo,id:'test-project',items:Array.from({length:16},(_,i)=>({character:i<8?'春':'夏',pinyin:i<8?'chūn':'xià'})),repeatToPageCount:false,pageCount:2});
describe('配置与分页',()=>{
  it('拒绝目录穿越、多字输入、宽度和高度溢出',()=>{
    expect(()=>projectSchema.parse({...demo,id:'../x'})).toThrow();
    expect(()=>projectSchema.parse({...demo,items:[{character:'春夏'}]})).toThrow();
    const p=make();p.layout.gridSizeMm=30;expect(layoutIssues(p).some(i=>i.code==='ROW_OVERFLOW')).toBe(true);
    p.layout.rowsPerPage=30;expect(layoutIssues(p).some(i=>i.code==='PAGE_OVERFLOW')).toBe(true);
  });
  it('自然分页不补齐、不裁切；循环必须显式启用',()=>{
    const p=make();delete p.pageCount;p.items=p.items.slice(0,9);expect(paginate(p).map(s=>s.items.length)).toEqual([8,1]);
    p.pageCount=1;expect(()=>paginate(p)).toThrow('不能裁切');
    p.pageCount=20;expect(()=>paginate(p)).toThrow('repeatToPageCount');
    p.repeatToPageCount=true;const pages=paginate(p);expect(pages).toHaveLength(20);expect(pages[1].items[0]).toEqual(p.items[8]);expect(pages[1].items[1]).toEqual(p.items[0]);
  });
  it('稳定哈希仅影响变更页，布局变更影响所有页',()=>{
    const p=make(),before=paginate(p);p.items[8]={character:'秋',pinyin:'qiū'};const after=paginate(p);
    expect(after[0].hash).toBe(before[0].hash);expect(after[1].hash).not.toBe(before[1].hash);
    p.layout.traceCells=3;expect(paginate(p)[0].hash).not.toBe(before[0].hash);
  });
  it('按单元/章节另起页面，重复模式不混组，标题参与审核哈希',()=>{
    const p=make();delete p.pageCount;p.items=[{character:'春',pinyin:'chūn',unit:'第一单元',chapter:'1 春天'},{character:'夏',pinyin:'xià',unit:'第一单元',chapter:'2 夏天'},{character:'秋',pinyin:'qiū',unit:'第二单元',chapter:'1 秋天'}];
    const before=paginate(p);expect(before.map(s=>s.items.length)).toEqual([1,1,1]);
    p.items[1].chapter='2 夏日';const after=paginate(p);expect(after[0].hash).toBe(before[0].hash);expect(after[1].hash).not.toBe(before[1].hash);
    p.repeatToPageCount=true;p.pageCount=5;const repeated=paginate(p);expect(repeated).toHaveLength(5);expect(repeated.map(s=>s.items[0].character)).toEqual(['春','夏','秋','春','夏']);
  });
  it('缺字体明确报错',()=>{const p=make();p.layout.fontPath='/nonexistent/font.ttf';expect(validate(p).some(i=>i.code==='FONT_UNAVAILABLE')).toBe(true);});
});
describe('持久化与审核关口',()=>{
  let root:string,store:Store;
  beforeEach(async()=>{root=await mkdtemp(path.join(tmpdir(),'worksheet-test-'));store=new Store(root);await store.write(make());});
  afterEach(async()=>{await rm(root,{recursive:true,force:true});});
  it('批准跨实例保留，修改第二页只撤销第二页；保留反馈与审核历史',async()=>{
    let s=await store.snapshot('test-project');
    for(const sheet of s.pages)await store.review('test-project',sheet.number,'approved','人工测试反馈',sheet.hash,'','ui');
    expect((await new Store(root).snapshot('test-project')).reviews.map(r=>r.status)).toEqual(['approved','approved']);
    const p=make();p.items[8]={character:'秋',pinyin:'qiū'};await store.write(p,true);
    s=await store.snapshot(p.id);expect(s.reviews.map(r=>r.status)).toEqual(['approved','draft']);expect(s.reviews[1].comment).toBe('人工测试反馈');expect(s.reviews[1].history).toHaveLength(2);
    expect(JSON.parse(await readFile(path.join(root,p.id,'review.json'),'utf8'))['2'].status).toBe('draft');
    await store.write(make(),true);expect((await store.snapshot(p.id)).reviews[1].status).toBe('draft'); // reverting content never resurrects approval
  });
  it('Agent 禁止批准，旧页面或旧审核版本不能覆盖新审核',async()=>{
    const s=await store.snapshot('test-project'),hash=s.pages[0].hash;
    await expect(store.review('test-project',1,'approved','',hash,'','agent')).rejects.toThrow('人工批准');
    await store.review('test-project',1,'needs_revision','太小',hash,'','agent');
    await expect(store.review('test-project',1,'draft','覆盖',hash,'','agent')).rejects.toThrow('已改变');
  });
  it('并发审核不丢更新、拒绝符号链接项目',async()=>{
    const s=await store.snapshot('test-project');
    await Promise.all(s.pages.map(sheet=>store.review('test-project',sheet.number,'draft','note',sheet.hash,'','agent')));
    expect((await store.snapshot('test-project')).reviews.every(r=>r.comment==='note')).toBe(true);
    await symlink(path.join(root,'test-project'),path.join(root,'linked-project'));
    await expect(store.read('linked-project')).rejects.toThrow('符号链接');
  });
});
