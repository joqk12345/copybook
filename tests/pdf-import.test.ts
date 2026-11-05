import { describe,it,expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../src/core/store';
import { parseBBox,extractItems,selectPages,importPDF,type Word } from '../src/import/pdf';
import { annotatedPDF } from './pdf-fixture';
const word=(text:string,x:number,y:number,width=20,height=20):Word=>({text,xMin:x,xMax:x+width,yMin:y,yMax:y+height});
describe('PDF 提取与导入',()=>{
  it('解析 Poppler 坐标及 XML 转义，不展开外部实体',()=>{
    const pages=parseBBox('<doc><page><word xMin="1" xMax="2" yMin="3" yMax="4">&#x5988;&amp;&lt;</word></page></doc>');
    expect(pages[0].words[0].text).toBe('妈&<');
    expect(()=>parseBBox('<page><word xMin="x">妈</word></page>')).toThrow('坐标解析失败');
  });
  it('按行及横坐标排序，合并破碎拼音，忽略标题和字格伪字符',()=>{
    const words=[word('第一单元',100,0,100),word('ࢠ',20,100),word('们',60,100),word('妈',20,100),word('n',74,82,3,10),word('me',63,82,11,10),word('ā',29,82,6,10),word('m',22,82,7,10)];
    const result=extractItems([{number:1,words}]);
    expect(result.items.map(i=>[i.character,i.pinyin])).toEqual([['妈','mā'],['们','men']]);
    expect(result.stats[0].matched).toBe(2);
  });
  it('保留同字不同读音，按配对去重，不从空白练习页猜字',()=>{
    const pages=[{number:1,words:[word('长',20,100),word('zhǎng',14,82,31,10)]},{number:2,words:[word('长',20,100),word('cháng',14,82,31,10)]},{number:3,words:[word('长',20,100),word('zhǎng',14,82,31,10)]},{number:4,words:[word('zhǎng',14,82,31,10)]}];
    const result=extractItems(pages,{dedupe:true});expect(result.items.map(i=>i.pinyin)).toEqual(['zhǎng','cháng']);expect(result.stats[3].imported).toBe(0);
    expect(()=>extractItems([pages[3]])).toThrow('未找到');
    expect(extractItems([{number:1,words:[word('课文',20,100,40)]}],{mode:'text'}).items.map(i=>i.character)).toEqual(['课','文']);
  });
  it('识别单元与课文标题，跨页续接，限制页码也保留上文分组',()=>{
    const pages=[
      {number:1,words:[word('第一单元',80,0,100),word('1',80,30,8),word('小蝌蚪找妈妈',96,30,120),word('妈',20,100),word('mā',22,82,16,10)]},
      {number:2,words:[word('们',20,100),word('men',22,82,16,10)]},
      {number:3,words:[word('第二单元',80,0,100),word('1 场景歌',80,30,100),word('妈',20,100),word('mā',22,82,16,10)]}
    ];
    const all=extractItems(pages,{dedupe:true});expect(all.items).toHaveLength(3);
    expect(all.items.map(i=>[i.unit,i.chapter])).toEqual([['第一单元','1 小蝌蚪找妈妈'],['第一单元','1 小蝌蚪找妈妈'],['第二单元','1 场景歌']]);
    expect(extractItems(pages,{pages:'2'}).items[0]).toMatchObject({unit:'第一单元',chapter:'1 小蝌蚪找妈妈'});
  });
  it('语文园地保持其对应单元，不使用教材外推章节',()=>{
    const p=[{number:1,words:[word('第二单元',100,0,100),word('语文园地一',100,30,100),word('妈',20,100),word('mā',22,82,16,10)]}];
    expect(extractItems(p).items[0]).toMatchObject({unit:'第一单元',chapter:'语文园地一'});
  });
  it('严格校验页码范围',()=>{
    expect([...selectPages('3,1-2',3)]).toEqual([3,1,2]);
    for(const spec of ['0','4','3-1','1;x','1-99'])expect(()=>selectPages(spec,3)).toThrow();
  });
  it('真实 PDF → Poppler → 项目/报告，全页为 draft 且导入数据忽略提交',async()=>{
    const root=await fs.mkdtemp(path.join(tmpdir(),'worksheet-import-'));
    try {
      const file=path.join(root,'fixture.pdf');await fs.writeFile(file,await annotatedPDF());
      const store=new Store(path.join(root,'projects'));
      const cli=spawnSync(process.execPath,['--import','tsx','src/cli/index.ts','import','pdf','--from',file,'--id','imported-cli-fixture'],{encoding:'utf8',env:{...process.env,WORKSHEET_PROJECTS:store.root}});
      expect(cli.status).toBe(0);expect(JSON.parse(cli.stdout)).toMatchObject({ok:true,data:{itemCount:2,pageCount:1}});
      const result=await importPDF(store,file,{id:'imported-fixture'});
      expect(result).toMatchObject({itemCount:2,pageCount:1,sourcePageCount:2});
      const s=await store.snapshot(result.id);expect(s.project.items).toEqual([{character:'妈',pinyin:'ma'},{character:'们',pinyin:'men'}]);expect(s.reviews.every(r=>r.status==='draft')).toBe(true);
      const report=JSON.parse(await fs.readFile(result.reportPath,'utf8'));expect(report.items.map((i:{sourcePage:number})=>i.sourcePage)).toEqual([1,1]);expect(report.source.filename).toBe('fixture.pdf');expect(report.source.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(await fs.readFile(path.join(store.dir(result.id),'.gitignore'),'utf8')).toBe('*\n');
      await expect(importPDF(store,file,{id:result.id})).rejects.toThrow('项目已存在');
      const invalid=path.join(root,'not.pdf');await fs.writeFile(invalid,'not a pdf');await expect(importPDF(store,invalid,{id:'invalid'})).rejects.toThrow('不是有效');
    }finally{await fs.rm(root,{recursive:true,force:true});}
  });
});
