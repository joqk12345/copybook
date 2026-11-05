import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { Store } from '../core/store.js';
import { validate } from '../core/validate.js';
import { resolveFont } from '../core/fonts.js';
import { renderDocument } from '../core/render.js';
import { importPDF } from '../import/pdf.js';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { exportPDF } from '../pdf/export.js';
const app=express(),store=new Store(),port=Number(process.env.PORT??5173);
const hosts=new Set([`localhost:${port}`,`127.0.0.1:${port}`]);
app.use((req,res,next)=>{
  if(!hosts.has(req.headers.host??'')) {res.status(403).json({ok:false,error:'仅允许本机访问'});return;}
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='GET'&&(!hosts.has((()=>{try{return new URL(req.headers.origin??'').host;}catch{return '';}})())||req.headers['x-worksheet-ui']!=='review')) {res.status(403).json({ok:false,error:'写入需要同源本地 UI'});return;}
  next();
});
app.post('/api/import/pdf',express.raw({type:'application/pdf',limit:'50mb'}),async(req,res)=>{
  if(!Buffer.isBuffer(req.body)||!req.body.length)throw new Error('请选择 PDF 文件');
  const dir=await fs.mkdtemp(path.join(tmpdir(),'worksheet-pdf-'));
  try {
    const file=path.join(dir,'upload.pdf');await fs.writeFile(file,req.body);
    const result=await importPDF(store,file,{id:String(req.query.id??''),title:req.query.title?String(req.query.title):undefined,mode:(req.query.mode??'annotated') as 'annotated'|'text',pages:req.query.pages?String(req.query.pages):undefined,dedupe:req.query.dedupe==='true',filename:decodeURIComponent(String(req.headers['x-worksheet-filename']??'upload.pdf'))});
    res.json({ok:true,data:result});
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
app.use(express.json({limit:'1mb'}));
app.get('/api/projects',async(_req,res)=>{res.json({ok:true,data:await store.list()});});
app.get('/api/projects/:id',async(req,res)=>{const s=await store.snapshot(req.params.id);res.json({ok:true,data:{...s,issues:validate(s.project)}});});
app.get('/api/projects/:id/preview',async(req,res)=>{
  const s=await store.snapshot(req.params.id),n=Number(req.query.page??1),sheet=s.pages[n-1];if(!sheet)throw new Error('页码不存在');
  const font=resolveFont(s.project);res.type('html').send(renderDocument(s.project,[sheet],font.dataUrl));
});
app.get('/api/projects/:id/print',async(req,res)=>{
  const s=await store.snapshot(req.params.id),all=req.query.all==='1';
  const pages=s.pages.filter((_,i)=>all||s.reviews[i].status==='approved');if(!pages.length)throw new Error('没有已批准页面');
  const issues=validate(s.project);if(issues.some(i=>i.severity==='error'))throw new Error(JSON.stringify(issues));
  res.type('html').send(renderDocument(s.project,pages,resolveFont(s.project).dataUrl));
});
app.post('/api/projects/:id/review',async(req,res)=>{
  const {page,status,comment,hash,version}=req.body;
  if(typeof comment!=='string'||typeof hash!=='string'||typeof version!=='string')throw new Error('审核参数不完整');
  // A production approval is only offered as an explicit action in the local UI.
  if(status==='approved') {const issues=validate(await store.read(req.params.id));if(issues.some(i=>i.severity==='error'))throw new Error('请先修复校验错误');}
  res.json({ok:true,data:await store.review(req.params.id,page,status,comment,hash,version,'ui')});
});
app.post('/api/projects/:id/export',async(req,res)=>{res.json({ok:true,data:await exportPDF(store,req.params.id,false)});});
app.get('/api/projects/:id/download',async(req,res)=>{const dir=await store.safeDir(req.params.id);const exportDir=path.join(dir,'exports');const {lstat}=await import('node:fs/promises');if((await lstat(exportDir)).isSymbolicLink()||(await lstat(path.join(exportDir,'approved.pdf'))).isSymbolicLink())throw new Error('下载路径不能是符号链接');res.download(path.join(exportDir,'approved.pdf'));});
app.use('/api',(_req,res)=>{res.status(404).json({ok:false,error:'接口不存在'});});
const server=createServer(app);
if(process.env.NODE_ENV==='production') {
  app.use(express.static(path.resolve('dist')));app.get('/',(_req,res)=>{res.sendFile(path.resolve('dist/index.html'));});
} else {
  const {createServer:createVite}=await import('vite');
  const vite=await createVite({server:{middlewareMode:{server},hmr:{server}},appType:'spa'});app.use(vite.middlewares);
}
app.use((err:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{res.status(400).json({ok:false,error:err.message});});
server.on('error',error=>{console.error(`启动失败：${error.message}`);process.exit(1);});
server.listen(port,'127.0.0.1',()=>console.log(`Worksheet Studio: http://localhost:${port}`));
