import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { idSchema, paginate, projectSchema, type Item } from '../core/model.js';
import { Store } from '../core/store.js';
const exec = promisify(execFile);
export type Word = { text:string; xMin:number; xMax:number; yMin:number; yMax:number };
export type PDFPage = { number:number; words:Word[] };
export type ExtractedItem = Item & { sourcePage:number; x:number; y:number };
export type ImportOptions = { id:string; title?:string; mode?:'annotated'|'text'; pages?:string; dedupe?:boolean; filename?:string };
const han = /^\p{Script=Han}$/u;
function decodeXML(text:string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,entity:string)=>{
    const literals:Record<string,string>={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
    if(entity[0]!=='#')return literals[entity]??'';
    const n=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));
    return n>=0&&n<=0x10ffff?String.fromCodePoint(n):'\uFFFD';
  }).normalize('NFC');
}
/** Parse only Poppler's generated bbox XML; no general XML entities or external resources. */
export function parseBBox(xml:string):PDFPage[] {
  return [...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map((page,index)=>({number:index+1,words:[...page[1].matchAll(/<word\b([^>]*)>([\s\S]*?)<\/word>/g)].map(match=>{
    const attrs=Object.fromEntries([...match[1].matchAll(/(xMin|xMax|yMin|yMax)="([0-9.eE+-]+)"/g)].map(m=>[m[1],Number(m[2])]));
    if(!['xMin','xMax','yMin','yMax'].every(k=>Number.isFinite(attrs[k]))||attrs.xMax<attrs.xMin||attrs.yMax<attrs.yMin)throw new Error('PDF 坐标解析失败');
    return {text:decodeXML(match[2]),...attrs} as Word;
  })}));
}
export function selectPages(spec:string|undefined,total:number):Set<number> {
  if(!total||total>300)throw new Error('PDF 需有 1–300 页');
  if(!spec)return new Set(Array.from({length:total},(_,i)=>i+1));
  const selected=new Set<number>();
  for(const part of spec.split(',')) {
    const match=/^(\d+)(?:-(\d+))?$/.exec(part.trim());if(!match)throw new Error('页码格式应为 3,5-8');
    const start=Number(match[1]),end=Number(match[2]??start);
    if(start<1||end<start||end>total)throw new Error(`页码超出 PDF 范围（1–${total}）`);
    for(let n=start;n<=end;n++)selected.add(n);
  }
  return selected;
}
export function isSyllable(text:string) {
  const plain=text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  return /^(?:(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(?:a|o|e|ai|ei|ao|ou|an|en|ang|eng|ong|er|i|ia|ie|iao|iu|ian|in|iang|ing|iong|u|ua|uo|uai|ui|uan|un|uang|ueng|ue|v|ve|van|vn)|m|n|ng)$/.test(plain);
}
function pinyinTokens(words:Word[]):Word[] {
  // PDF often stores a syllable as several adjacent font runs, e.g. shē + n.
  const latin=words.filter(w=>/^[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹḿ\u0300-\u036f]+$/iu.test(w.text));
  const lines:Word[][]=[];
  for(const word of latin.sort((a,b)=>a.yMin-b.yMin||a.xMin-b.xMin)) {
    const line=lines.find(l=>Math.abs(l[0].yMin-word.yMin)<=2);
    if(line)line.push(word);else lines.push([word]);
  }
  return lines.flatMap(line=>{
    const merged:Word[]=[];
    for(const word of line.sort((a,b)=>a.xMin-b.xMin)) {
      const prev=merged.at(-1);
      if(prev&&word.xMin-prev.xMax<=2&&word.xMin>=prev.xMin&&Math.abs(word.yMin-prev.yMin)<=2) {prev.text=(prev.text+word.text).normalize('NFC');prev.xMax=Math.max(prev.xMax,word.xMax);}
      else merged.push({...word});
    }
    return merged.filter(w=>isSyllable(w.text));
  });
}
function hanCharacters(words:Word[]):Word[] {
  const chars=words.flatMap(word=>{
    const letters=[...word.text],width=(word.xMax-word.xMin)/letters.length;
    return letters.flatMap((text,i)=>han.test(text)?[{...word,text,xMin:word.xMin+i*width,xMax:word.xMin+(i+1)*width}]:[]);
  });
  const lines:Word[][]=[];
  for(const char of chars.sort((a,b)=>a.yMin-b.yMin||a.xMin-b.xMin)) {
    const line=lines.find(l=>Math.abs(l[0].yMin-char.yMin)<=2);
    if(line)line.push(char);else lines.push([char]);
  }
  return lines.flatMap(line=>line.sort((a,b)=>a.xMin-b.xMin)).filter((w,i,list)=>!list.slice(Math.max(0,i-3),i).some(prev=>prev.text===w.text&&Math.abs(prev.xMin-w.xMin)<.5&&Math.abs(prev.yMin-w.yMin)<.5));
}
function inferWords(chars:Word[]):Map<string,{text:string;id:string}> {
  const lines:Word[][]=[];
  for(const char of [...chars].sort((a,b)=>a.yMin-b.yMin||a.xMin-b.xMin)) {
    const line=lines.find(l=>Math.abs(l[0].yMin-char.yMin)<=2);
    if(line)line.push(char);else lines.push([char]);
  }
  const result=new Map<string,{text:string;id:string}>();let idCounter=0;
  for(const line of lines) {
    const ordered=line.sort((a,b)=>a.xMin-b.xMin);let group:Word[]=[];
    const flush=()=>{if(group.length>1){const text=group.map(c=>c.text).join(''),id=`w${idCounter++}`;for(const c of group)result.set(`${c.xMin}:${c.yMin}`,{text,id});}group=[];};
    for(const char of ordered) {
      const previous=group.at(-1),gap=previous?char.xMin-previous.xMax:0;
      if(previous&&gap>Math.max(14,(previous.xMax-previous.xMin)*.55))flush();
      group.push(char);
    }
    flush();
  }
  return result;
}
type Heading={y:number;unit?:string;chapter?:string;resetChapter?:boolean};
function pageHeadings(words:Word[]):Heading[] {
  const rows:Word[][]=[];
  for(const word of [...words].sort((a,b)=>a.yMin-b.yMin||a.xMin-b.xMin)) {
    const row=rows.find(r=>Math.abs(r[0].yMin-word.yMin)<=2);
    if(row)row.push(word);else rows.push([word]);
  }
  const headings:Heading[]=[];
  for(const row of rows) {
    const text=row.sort((a,b)=>a.xMin-b.xMin).map(w=>w.text).join(' ').trim();
    const compact=text.replace(/\s/g,'');
    const unit=/第([一二三四五六七八九十百零〇两0-9]+)单元/.exec(compact);
    if(unit){headings.push({y:row[0].yMin,unit:unit[0],resetChapter:true});continue;}
    const garden=/^语文园地([一二三四五六七八九十0-9]+)$/.exec(compact);
    if(garden){headings.push({y:row[0].yMin,unit:`第${garden[1]}单元`,chapter:compact});continue;}
    const lesson=/^(\d{1,2})[.、．]?\s*([\p{Script=Han}《》〈〉“”「」：:·—、！？?!（）()]+)$/u.exec(compact);
    if(lesson){headings.push({y:row[0].yMin,chapter:`${lesson[1]} ${lesson[2]}`});continue;}
    if(/^第[一二三四五六七八九十百零〇0-9]+[课章节]/.test(compact))headings.push({y:row[0].yMin,chapter:compact});
  }
  return headings;
}
export function extractItems(pages:PDFPage[],options:Pick<ImportOptions,'mode'|'pages'|'dedupe'>={}) {
  const selected=selectPages(options.pages,pages.length),mode=options.mode??'annotated';
  const items:ExtractedItem[]=[],stats:{page:number;hanCount:number;matched:number;unmatchedPinyin:number;imported:number}[]=[];
  const seen=new Set<string>();let unit:string|undefined,chapter:string|undefined;
  for(const page of pages) {
    const chars=hanCharacters(page.words),wordMap=inferWords(chars),tokens=pinyinTokens(page.words),used=new Set<Word>(),headings=pageHeadings(page.words);let matched=0,imported=0,headingIndex=0;
    for(const char of chars) {
      while(headingIndex<headings.length&&headings[headingIndex].y<=char.yMin+2){const heading=headings[headingIndex++];if(heading.unit)unit=heading.unit;if(heading.resetChapter)chapter=undefined;if(heading.chapter)chapter=heading.chapter;}
      const cx=(char.xMin+char.xMax)/2,width=char.xMax-char.xMin;
      const choices=tokens.filter(t=>!used.has(t)&&t.yMax<=char.yMin+2&&char.yMin-t.yMax<=Math.max(24,(char.yMax-char.yMin)*1.3)&&Math.abs((t.xMin+t.xMax)/2-cx)<=Math.max(5,width*.45))
        .sort((a,b)=>(char.yMin-a.yMax+Math.abs((a.xMin+a.xMax)/2-cx))-(char.yMin-b.yMax+Math.abs((b.xMin+b.xMax)/2-cx)));
      const token=choices[0];
      if(token){used.add(token);matched++;}
      if(!selected.has(page.number)||(mode==='annotated'&&!token))continue;
      const pinyin=token?.text??'',key=JSON.stringify([unit,chapter,char.text,pinyin]);
      if(options.dedupe&&seen.has(key))continue;
      seen.add(key);const word=wordMap.get(`${char.xMin}:${char.yMin}`);items.push({character:char.text,pinyin,...(word?{word:word.text,wordId:`${page.number}:${word.id}`}:{ } ),...(unit?{unit}:{}),...(chapter?{chapter}:{}),sourcePage:page.number,x:char.xMin,y:char.yMin});imported++;
    }
    while(headingIndex<headings.length){const heading=headings[headingIndex++];if(heading.unit)unit=heading.unit;if(heading.resetChapter)chapter=undefined;if(heading.chapter)chapter=heading.chapter;}
    if(selected.has(page.number))stats.push({page:page.number,hanCount:chars.length,matched,unmatchedPinyin:tokens.length-used.size,imported});
  }
  if(!items.length)throw new Error(mode==='annotated'?'未找到可配对的汉字和拼音。扫描件暂不支持 OCR；纯文字 PDF 可用 --mode text。':'未提取到汉字。扫描件暂不支持 OCR，需含可复制文字的 PDF。');
  if(items.length>10000)throw new Error('提取超过 10,000 字，请使用 --pages 缩小范围');
  return {items,stats};
}
export async function importPDF(store:Store,file:string,options:ImportOptions) {
  idSchema.parse(options.id);
  if(options.mode&&!['annotated','text'].includes(options.mode))throw new Error('--mode 只能是 annotated 或 text');
  const st=await fs.stat(file);if(!st.isFile()||st.size>50*1024*1024)throw new Error('PDF 必须是 50 MB 以内的本地文件');
  const bytes=await fs.readFile(file);if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('输入不是有效的 PDF 文件');
  let xml:string;
  try {({stdout:xml}=await exec('pdftotext',['-bbox-layout','-enc','UTF-8',path.resolve(file),'-'],{timeout:60000,maxBuffer:32*1024*1024}));}
  catch(e) {if((e as NodeJS.ErrnoException).code==='ENOENT')throw new Error('缺少 pdftotext：macOS 执行 brew install poppler；Linux 安装 poppler-utils。');throw new Error(`PDF 文字提取失败：${(e as Error).message.slice(0,500)}`);}
  const pages=parseBBox(xml),{items,stats}=extractItems(pages,options);
  const project=projectSchema.parse({id:options.id,title:options.title??'PDF 导入汉字描红',items:items.map(({character,pinyin,word,wordId,unit,chapter})=>({character,pinyin,...(word?{word}:{}),...(wordId?{wordId}:{}),...(unit?{unit}:{}),...(chapter?{chapter}:{})})),layout:{showPinyin:items.some(i=>i.pinyin),rowsPerPage:8}});
  const warnings=[
    '拼音按 PDF 坐标配对，未自动推测读音；请逐页核对，所有页面保持待审核。',
    ...(options.mode==='text'?['纯文字模式会包含标题及页眉中的汉字；未匹配的拼音留空。']:[]),
    ...(stats.some(s=>s.unmatchedPinyin)?['部分页面包含未配对拼音（也可能是原文件的空白练习页），详见 import.json。']:[])
  ];
  const sheets=paginate(project);
  const groups=[...new Map(items.map(item=>[JSON.stringify([item.unit,item.chapter]),{unit:item.unit??'',chapter:item.chapter??''}])).values()].map(group=>{
    const members=items.filter(i=>(i.unit??'')===group.unit&&(i.chapter??'')===group.chapter);
    return {...group,itemCount:members.length,sourcePages:[...new Set(members.map(i=>i.sourcePage))],pages:sheets.filter(s=>(s.items[0].unit??'')===group.unit&&(s.items[0].chapter??'')===group.chapter).map(s=>s.number)};
  });
  const report={version:2,groups,source:{filename:path.basename(options.filename??file),sha256:createHash('sha256').update(bytes).digest('hex'),pageCount:pages.length},mode:options.mode??'annotated',dedupe:options.dedupe??false,createdAt:new Date().toISOString(),itemCount:items.length,pageCount:paginate(project).length,warnings,sourcePages:stats,items};
  // Imported personal material must never enter a future git add/push by default.
  if(await fs.access(path.join(store.dir(project.id),'project.json')).then(()=>true,()=>false))throw new Error('项目已存在，请使用新的 --id；导入不会覆盖现有项目');
  const dir=await store.safeDir(project.id,true);
  await store.locked(project.id,async()=>{await fs.writeFile(path.join(dir,'.gitignore'),'*\n',{flag:'wx'});});
  await store.write(project);
  await store.locked(project.id,()=>store.atomic(path.join(dir,'import.json'),report));
  return {id:project.id,groups,itemCount:items.length,pageCount:report.pageCount,sourcePageCount:pages.length,sourcePages:stats,reportPath:path.join(dir,'import.json'),previewUrl:`http://localhost:${process.env.PORT??5173}/?project=${project.id}`,warnings};
}
