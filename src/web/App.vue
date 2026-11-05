<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { Project, Sheet, Issue } from '../core/model';
import type { Review, Status } from '../core/store';
type Snapshot={project:Project;pages:Sheet[];reviews:Review[];revision:string;issues:Issue[]};
const projects=ref<{id:string;title:string}[]>([]), data=ref<Snapshot>(), selected=ref(new URLSearchParams(location.search).get('project')??localStorage.getItem('worksheet-project')??''), page=ref(1), zoom=ref(Number(localStorage.getItem('worksheet-zoom')??.7));
const comment=ref(''),dirty=ref(false),notice=ref(''),error=ref(''),busy=ref(false),conflict=ref(false);
const current=computed(()=>data.value?.reviews[page.value-1]),sheet=computed(()=>data.value?.pages[page.value-1]);
const approved=computed(()=>data.value?.reviews.filter(r=>r.status==='approved').length??0);
const label=(s?:string)=>({draft:'待审核',needs_revision:'需修改',approved:'已批准'}[s??'draft']);
const preview=computed(()=>data.value&&sheet.value?`/api/projects/${selected.value}/preview?page=${page.value}&hash=${sheet.value.hash}`:'');
async function api(url:string,body?:unknown) {
  const res=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json','X-Worksheet-UI':'review'},body:JSON.stringify(body)}:undefined);
  const json=await res.json();if(!json.ok)throw new Error(json.error);return json.data;
}
let polling=false;
async function refresh() {
  if(polling)return;polling=true;
  try {
    projects.value=await api('/api/projects');
    if(!selected.value&&projects.value.length)selected.value=projects.value[0].id;
    if(!selected.value)return;
    const id=selected.value,next:Snapshot=await api(`/api/projects/${id}`);
    if(selected.value!==id)return;
    if(next.revision!==data.value?.revision) {
      const previous=data.value?.reviews[page.value-1],updated=next.reviews[page.value-1];
      if(dirty.value&&previous&&(previous.hash!==updated?.hash||previous.version!==updated?.version)) {conflict.value=true;notice.value='页面或审核已更新。未提交的反馈已保留，请核对新页面后点击“保留反馈并重新核对”。';}
      else if(!dirty.value)comment.value=updated?.comment??'';
      if(data.value&&next.project.id===data.value.project.id)notice.value=notice.value||'已同步本地文件的最新修改。';
      data.value=next;page.value=Math.min(page.value,next.pages.length);
    }
  } catch(e) {error.value=(e as Error).message;}finally{polling=false;}
}
function changeProject() {
  if(dirty.value){const old=data.value?.project.id; if(!confirm('反馈尚未提交，切换项目会放弃草稿。是否继续？')) {selected.value=old??'';return;}}
  data.value=undefined;page.value=1;dirty.value=false;conflict.value=false;notice.value='';comment.value='';error.value='';
  localStorage.setItem('worksheet-project',selected.value);history.replaceState(null,'',`?project=${selected.value}`);void refresh();
}
function changePage(n:number) {
  if(dirty.value&&!confirm('反馈尚未提交，切换页面会放弃草稿。是否继续？'))return;
  page.value=n;localStorage.setItem(`worksheet-page-${selected.value}`,String(n));dirty.value=false;conflict.value=false;notice.value='';comment.value=current.value?.comment??'';
}
function setZoom() {localStorage.setItem('worksheet-zoom',String(zoom.value));}
async function review(status:Status) {
  if(!current.value||conflict.value)return;
  if(status==='approved'&&!confirm(`确认已人工检查第 ${page.value} 页，并批准用于打印？`))return;
  busy.value=true;error.value='';
  try {
    await api(`/api/projects/${selected.value}/review`,{page:page.value,status,comment:comment.value,hash:current.value.hash,version:current.value.version});
    dirty.value=false;notice.value=`第 ${page.value} 页${label(status)}，审核已保存。`;await refresh();
  }catch(e){error.value=(e as Error).message;}finally{busy.value=false;}
}
async function exportPDF() {
  busy.value=true;error.value='';
  try {const result=await api(`/api/projects/${selected.value}/export`,{});notice.value=`已导出 ${result.pageCount} 页：${result.path}`;const a=document.createElement('a');a.href=`/api/projects/${selected.value}/download`;a.click();}
  catch(e){error.value=(e as Error).message;}finally{busy.value=false;}
}
function beforeUnload(e:BeforeUnloadEvent){if(dirty.value){e.preventDefault();e.returnValue='';}}
let timer:ReturnType<typeof setInterval>;
onMounted(async()=>{await refresh();const saved=Number(localStorage.getItem(`worksheet-page-${selected.value}`)??1);if(data.value&&saved>0&&saved<=data.value.pages.length){page.value=saved;comment.value=current.value?.comment??'';}timer=setInterval(refresh,1500);window.addEventListener('beforeunload',beforeUnload);});
onUnmounted(()=>{clearInterval(timer);window.removeEventListener('beforeunload',beforeUnload);});
</script>

<template>
  <div class="studio">
    <header class="topbar"><div class="brand"><span class="brand-icon">田</span><div>Worksheet Studio<small>本地字帖工作台</small></div></div><div class="connection"><i></i> 本地运行 · 自动同步</div><a v-if="data" :href="`/api/projects/${selected}/print`" target="_blank">打印预览 · 已批准页 ↗</a><button class="primary" :disabled="busy||!approved" @click="exportPDF">{{busy?'处理中…':`导出 PDF · ${approved} 页`}}</button></header>
    <aside class="sidebar"><div class="eyebrow">WORKSPACE / 工作区</div><label class="field-label" for="project">当前项目</label><select id="project" v-model="selected" @change="changeProject"><option v-for="p in projects" :key="p.id" :value="p.id">{{p.title}}</option></select>
      <div class="section-title">练习页面 <span>{{data?.pages.length??0}}</span></div>
      <nav class="page-list" aria-label="练习页面"><button v-for="p in data?.pages" :key="p.number" class="page-card" :class="{active:page===p.number}" @click="changePage(p.number)"><span class="mini-sheet">{{p.items.slice(0,4).map(i=>i.character).join(' ')}}</span><span><b>第 {{String(p.number).padStart(2,'0')}} 页</b><small>{{label(data?.reviews[p.number-1].status)}}</small></span><i class="status-dot" :class="data?.reviews[p.number-1].status"></i></button></nav>
      <div class="sidebar-note">本地文件持久化<br>无需账号 · 无需模型 API</div>
    </aside>
    <main class="workspace"><div v-if="!data" class="empty">{{error||'暂无项目。使用 CLI 从 examples/demo.json 创建字帖。'}}</div><template v-else><div class="document-heading"><div><div class="eyebrow">{{data.project.template==='chinese-stroke-order'?'STROKE ORDER / 笔顺练习':'CHINESE TRACING / 汉字描红'}}</div><h1>{{data.project.title}}</h1><p>A4 纵向 <span>·</span> {{data.project.layout.gridSizeMm}} mm 田字格 <span>·</span> {{data.pages.length}} 页</p></div><div class="progress"><strong>{{approved}}<small> / {{data.pages.length}}</small></strong><span>页面已批准</span><div class="progress-track"><i :style="{width:approved/data.pages.length*100+'%'}"></i></div></div></div>
      <div class="preview-toolbar"><span>第 {{page}} / {{data.pages.length}} 页</span><div><label for="zoom">缩放</label><select id="zoom" v-model.number="zoom" @change="setZoom"><option :value=".5">50%</option><option :value=".7">70%</option><option :value=".85">85%</option><option :value="1">100%</option></select></div><span class="paper-tag">210 × 297 mm</span></div>
      <div class="preview-scroll"><div class="paper-wrap" :style="{width:`${210*3.779527559*zoom}px`,height:`${297*3.779527559*zoom}px`}"><iframe :src="preview" title="A4 字帖实时预览" :style="{transform:`scale(${zoom})`}" sandbox="allow-same-origin"></iframe></div></div>
      <div class="workspace-footer">预览与 PDF 共用排版模板 <span>以 100% 比例打印，关闭浏览器页眉页脚</span></div>
    </template></main>
    <aside class="review-panel" v-if="data&&current"><div class="eyebrow">PAGE REVIEW / 逐页审核</div><h2>第 {{String(page).padStart(2,'0')}} 页 <span class="badge" :class="current.status">{{label(current.status)}}</span></h2><p class="muted">检查字形、拼音和排版后批准。内容变化时，该页需要重新审核。</p>
      <div class="review-details"><div>练习内容<b>{{sheet?.items.map(i=>i.character).join('、')}}</b></div><div v-if="data.project.template==='chinese-stroke-order'">练习方式<b>逐笔示范 → 描红 → 独立书写</b></div><div>格子配置<b>{{data.project.layout.sampleCells}} 范字 / {{data.project.layout.traceCells}} 描红 / {{data.project.layout.blankCells}} 空白</b></div></div>
      <label for="comment" class="field-label">审核反馈 <span>可选</span></label><textarea id="comment" v-model="comment" maxlength="2000" placeholder="例如：请核对“春”的拼音…" @input="dirty=true"></textarea><small class="muted">{{dirty?'有未提交的反馈':'反馈随审核状态保存在本地'}} · {{comment.length}}/2000</small>
      <div v-if="notice" class="notice" role="status">{{notice}}</div><button v-if="conflict" @click="conflict=false;notice='已保留反馈，请重新检查当前页面。'">保留反馈并重新核对</button>
      <div v-if="error" class="error" role="alert">{{error}}</div><div class="review-actions"><button class="primary" :disabled="busy||conflict||data.issues.some(i=>i.severity==='error')" @click="review('approved')">✓ 批准本页</button><button :disabled="busy||conflict" @click="review('needs_revision')">退回修改</button><button class="text-button" :disabled="busy||conflict" @click="review('draft')">保存反馈 / 设为待审核</button></div>
      <div class="checks"><h3>排版校验</h3><p v-if="!data.issues.length" class="success">✓ 配置与字体检查通过</p><p v-for="(issue,i) in data.issues" :key="i" :class="issue.severity==='error'?'error':'muted'">{{issue.severity==='error'?'!':'○'}} {{issue.message}}</p></div><div class="audit" v-if="current.updatedAt">上次审核 {{new Date(current.updatedAt).toLocaleString()}}<br>已记录 {{current.history.length}} 次审核动作</div>
    </aside>
  </div>
</template>
