import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash, idSchema, paginate, projectSchema, type Project, type Sheet } from './model.js';
import { resolveFont } from './fonts.js';
export type Status = 'draft'|'needs_revision'|'approved';
export type Review = { hash: string; status: Status; comment: string; updatedAt: string; version: string; history: {hash:string;status:Status;comment:string;at:string;actor:string}[] };
export class Store {
  constructor(public root = path.resolve(process.env.WORKSHEET_PROJECTS ?? 'projects')) {}
  dir(id: string) { idSchema.parse(id); return path.join(this.root,id); }
  async safeDir(id: string, create=false) {
    const dir = this.dir(id); await fs.mkdir(this.root,{recursive:true});
    if(create) await fs.mkdir(dir,{recursive:true});
    const st=await fs.lstat(dir); if(st.isSymbolicLink()||!st.isDirectory()) throw new Error('项目目录不能是符号链接');
    return dir;
  }
  async atomic(file: string, value: unknown) {
    const tmp = `${file}.${randomUUID()}.tmp`;
    try { await fs.writeFile(tmp,JSON.stringify(value,null,2)+'\n',{flag:'wx'}); await fs.rename(tmp,file); }
    finally { await fs.rm(tmp,{force:true}); }
  }
  async locked<T>(id:string, action:()=>Promise<T>,create=false):Promise<T> {
    const dir=await this.safeDir(id,create), lock=path.join(dir,'.lock');
    for(let i=0;;i++) {
      try {await fs.mkdir(lock);break;} catch(e) { if((e as NodeJS.ErrnoException).code!=='EEXIST'||i>=100) throw new Error('项目正在写入或存在残留 .lock，请稍后重试；进程崩溃后可手动移除锁目录。'); await new Promise(r=>setTimeout(r,50)); }
    }
    try{return await action();}finally{await fs.rmdir(lock);}
  }
  async list() {
    await fs.mkdir(this.root,{recursive:true}); const entries=await fs.readdir(this.root,{withFileTypes:true});
    const list=[]; for(const e of entries) if(e.isDirectory()&&idSchema.safeParse(e.name).success) {try {const p=await this.read(e.name);list.push({id:p.id,title:p.title});}catch{/* invalid projects are not opened */}}
    return list;
  }
  async readInput(id:string):Promise<unknown> {
    const dir=await this.safeDir(id); const file=path.join(dir,'project.json');
    if((await fs.lstat(file)).isSymbolicLink()) throw new Error('配置不能是符号链接');
    return JSON.parse(await fs.readFile(file,'utf8'));
  }
  async read(id:string):Promise<Project> {
    const p=projectSchema.parse(await this.readInput(id));if(p.id!==id)throw new Error('项目 ID 与目录不一致');return p;
  }
  async write(input:unknown,update=false) {
    const p=projectSchema.parse(input); paginate(p);
    return this.locked(p.id,async()=>{
      const file=path.join(this.dir(p.id),'project.json');
      const exists=await fs.access(file).then(()=>true,()=>false);
      if(exists&&!update) throw new Error('项目已存在，请使用 project update');
      if(!exists&&update) throw new Error('项目不存在');
      await this.atomic(file,p);
      if(!await fs.access(path.join(this.dir(p.id),'review.json')).then(()=>true,()=>false)) await this.atomic(path.join(this.dir(p.id),'review.json'),{});
      await this.snapshot(p.id,true);return p;
    },true);
  }
  async rawReviews(id:string):Promise<Record<string,Review>> {
    const file=path.join(await this.safeDir(id),'review.json');
    try { if((await fs.lstat(file)).isSymbolicLink()) throw new Error('审核文件不能是符号链接'); return JSON.parse(await fs.readFile(file,'utf8')); }
    catch(e) {if((e as NodeJS.ErrnoException).code==='ENOENT')return {};throw e;}
  }
  currentReview(sheet:Sheet, saved?:Review):Review {
    if(saved?.hash===sheet.hash) return saved;
    return {hash:sheet.hash,status:'draft',comment:saved?.comment??'',updatedAt:saved?.updatedAt??'',version:saved?.version??'',history:saved?.history??[]};
  }
  async snapshot(id:string,alreadyLocked=false):Promise<{project:Project;pages:Sheet[];reviews:Review[];revision:string}> {
    const project=await this.read(id); let fingerprint='';try{fingerprint=resolveFont(project).fingerprint;}catch{/* validation reports missing font */}
    const pages=paginate(project,fingerprint), saved=await this.rawReviews(id);
    const changed=pages.some(s=>saved[s.number]&&saved[s.number].hash!==s.hash)||Object.keys(saved).some(n=>Number(n)>pages.length);
    if(changed&&!alreadyLocked) return this.locked(id,()=>this.snapshot(id,true));
    if(changed) {
      for(const sheet of pages) {
        const previous=saved[sheet.number];
        if(previous&&previous.hash!==sheet.hash) {
          const at=new Date().toISOString();
          saved[sheet.number]={...previous,hash:sheet.hash,status:'draft',version:randomUUID(),updatedAt:at,history:[...previous.history,{hash:sheet.hash,status:'draft',comment:previous.comment,at,actor:'system:content-changed'}]};
        }
      }
      for(const n of Object.keys(saved)) if(Number(n)>pages.length) {saved[`archive-${n}-${randomUUID()}`]=saved[n];delete saved[n];}
      await this.atomic(path.join(this.dir(id),'review.json'),saved);
    }
    const reviews=pages.map(s=>this.currentReview(s,saved[s.number]));
    return { project, pages, reviews, revision:hash({project,reviews,pages:pages.map(s=>s.hash)}) };
  }
  async review(id:string,page:number,status:Status,comment:string,expectedHash:string,expectedVersion:string,actor:'ui'|'agent') {
    if(status==='approved'&&actor!=='ui') throw new Error('人工批准只能通过本地 Review UI 完成');
    if(!['draft','needs_revision','approved'].includes(status)||comment.length>2000) throw new Error('无效的审核状态或反馈过长');
    return this.locked(id,async()=>{
      const s=await this.snapshot(id,true),sheet=s.pages[page-1],current=s.reviews[page-1];
      if(!sheet||!Number.isInteger(page)) throw new Error('页码不存在');
      if(sheet.hash!==expectedHash||current.version!==expectedVersion) throw new Error('页面或审核已改变，请刷新后重新审核；反馈尚未提交');
      const saved=await this.rawReviews(id),at=new Date().toISOString();
      const entry:Review={hash:sheet.hash,status,comment,updatedAt:at,version:randomUUID(),history:[...(saved[page]?.history??[]),{hash:sheet.hash,status,comment,at,actor}]};
      saved[page]=entry; await this.atomic(path.join(this.dir(id),'review.json'),saved);return entry;
    });
  }
}
