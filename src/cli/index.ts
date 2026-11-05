import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { parse } from 'yaml';
import { Store, type Status } from '../core/store.js';
import { validate } from '../core/validate.js';
import { importPDF } from '../import/pdf.js';
import { exportPDF } from '../pdf/export.js';
const store=new Store();
async function main() {
  const {positionals:a,values:v}=parseArgs({allowPositionals:true,options:{from:{type:'string'},id:{type:'string'},title:{type:'string'},mode:{type:'string'},pages:{type:'string'},dedupe:{type:'boolean'},page:{type:'string'},status:{type:'string'},comment:{type:'string'},out:{type:'string'},all:{type:'boolean'},'approved-only':{type:'boolean'}}});
  if(a[0]==='import'&&a[1]==='pdf') {if(!v.from||!v.id)throw new Error('需要 --from PDF路径 --id 项目ID');return importPDF(store,v.from,{id:v.id,title:v.title,mode:v.mode as 'annotated'|'text'|undefined,pages:v.pages,dedupe:v.dedupe});}
  if(a[0]==='project') {
    if(a[1]==='list')return store.list();
    if(a[1]==='show')return store.snapshot(a[2]);
    if(['create','update'].includes(a[1])) {
      if(!v.from)throw new Error('需要 --from JSON/YAML 文件');
      const input=parse(await readFile(v.from,'utf8'));
      if(a[1]==='update'&&a[2]!==input.id)throw new Error('更新 ID 必须与文件一致');
      return store.write(input,a[1]==='update');
    }
  }
  if(a[0]==='render') {const s=await store.snapshot(a[1]);return {pageCount:s.pages.length,pages:s.pages.map(p=>({page:p.number,hash:p.hash})),previewUrl:`http://localhost:${process.env.PORT??5173}/?project=${a[1]}`};}
  if(a[0]==='validate') {const input=await store.readInput(a[1]);const issues=validate(input);if((input as {id?:string})?.id!==a[1])issues.push({severity:'error',code:'PROJECT_ID_MISMATCH',message:'项目 ID 与目录不一致'});if(issues.some(i=>i.severity==='error'))process.exitCode=1;return {valid:!issues.some(i=>i.severity==='error'),issues};}
  if(a[0]==='review') {
    const s=await store.snapshot(a[2]);
    if(a[1]==='list')return s.reviews.map((r,i)=>({page:i+1,...r}));
    if(a[1]==='set') {
      if(v.status==='approved') throw new Error('Agent CLI 不允许 approved；请通过本地 Review UI 人工批准。');
      const n=Number(v.page),sheet=s.pages[n-1];if(!sheet)throw new Error('无效页码');
      return store.review(a[2],n,v.status as Status,v.comment??'',sheet.hash,s.reviews[n-1].version,'agent');
    }
  }
  if(a[0]==='export'&&a[1]==='pdf') {if(v.all&&v['approved-only'])throw new Error('--all 与 --approved-only 不能同时使用');return exportPDF(store,a[2],v.all,v.out);}
  throw new Error('用法：import pdf --from FILE --id ID | project create/update/list/show | render ID | validate ID | review list/set ID | export pdf ID');
}
try { console.log(JSON.stringify({ok:true,data:await main()})); } catch(e) { console.log(JSON.stringify({ok:false,error:e instanceof Error?e.message:String(e)}));process.exitCode=1; }
