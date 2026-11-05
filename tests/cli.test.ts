import {it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {stringify} from 'yaml';
import demo from '../examples/demo.json';
it('真实 CLI：YAML 创建、JSON 修改、结构错误、审核拒绝及无批准导出',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'worksheet-cli-')),root=path.join(dir,'projects');
  const run=(args:string[])=>{
    const result=spawnSync(process.execPath,['--import','tsx','src/cli/index.ts',...args],{env:{...process.env,WORKSHEET_PROJECTS:root},encoding:'utf8'});
    if(result.error)throw result.error;
    return {code:result.status,...JSON.parse(result.stdout)};
  };
  try {
    const input=path.join(dir,'input.yaml');await writeFile(input,stringify(demo));
    expect(run(['project','create','--from',input])).toMatchObject({code:0,ok:true});
    expect(run(['project','create','--from',input])).toMatchObject({code:1,ok:false});
    expect(run(['project','list']).data).toHaveLength(1);
    expect(run(['render',demo.id]).data.pageCount).toBe(20);
    expect(run(['validate',demo.id]).data.valid).toBe(true);
    expect(run(['review','set',demo.id,'--page','1','--status','approved'])).toMatchObject({code:1,ok:false});
    expect(run(['review','set',demo.id,'--page','1','--status','needs_revision','--comment','CLI 测试'])).toMatchObject({code:0,ok:true});
    expect(run(['review','list',demo.id]).data[0].comment).toBe('CLI 测试');
    expect(run(['export','pdf',demo.id,'--approved-only'])).toMatchObject({code:1,ok:false});
    const config=path.join(root,demo.id,'project.json'),p=JSON.parse(await readFile(config,'utf8'));
    p.title='CLI 修改后的标题';const json=path.join(dir,'update.json');await writeFile(json,JSON.stringify(p));
    expect(run(['project','update',demo.id,'--from',json])).toMatchObject({code:0,ok:true});
    expect(run(['project','show',demo.id]).data.project.title).toBe(p.title);
    p.layout.gridSizeMm='wrong';await writeFile(config,JSON.stringify(p));
    const invalid=run(['validate',demo.id]);expect(invalid).toMatchObject({code:1,ok:true,data:{valid:false}});expect(invalid.data.issues[0].code).toBe('SCHEMA');
    expect(run(['project','show','../escape'])).toMatchObject({code:1,ok:false});
  }finally{await rm(dir,{recursive:true,force:true});}
},15000);
