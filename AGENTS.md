# AGENTS.md — Worksheet Studio (MVP)

> 本文件是 Codex 在此仓库中的工作指令。请先阅读本文件，再阅读项目现有代码和 README。目标是**实现并验证一个可以本地运行的、Agent-first 的字帖生成 MVP**，而不只是输出方案或伪代码。

## 0. 工作方式（必须遵守）

1. **自主完成闭环**：检查环境 → 制定简短实施计划 → 编码 → 运行 → 测试 → 自查 → 更新 README。除非遇到真正无法判断的产品决策或外部凭据，不要在每个步骤停下来询问。
2. **先验仓库**：识别现有框架、脚本、许可证和功能；能复用则复用，不要盲目重写。如果这是空仓库，按下述默认技术栈从零初始化。
3. **MVP 优先**：先确保「内容 → 排版 → 本地实时预览 → Review → 批量 PDF」端到端可用。不要引入登录、云服务、数据库集群、复杂工作流引擎、向量数据库、多 Agent 框架。
4. **优先离线、本地、可复现**：基本字帖生成和打印不依赖外部 API 或联网模型；Agent 可以由用户本机 Codex 提供。应用核心功能也必须可以通过 CLI / JSON 调用，不要求用户每次手工操作网页。
5. **真实测试**：必须实际启动应用，执行自动化测试，生成至少一份多页 PDF，检查页数、A4 尺寸及文件完整性。不要宣称未执行的测试通过。
6. **改动克制**：保持已有正常功能；避免与 MVP 无关的重构；不要擅自读取或提交本地密钥、用户个人文件和大型素材。
7. **提交汇报**：完成后列出实现内容、启动命令、测试结果、实际生成的样例位置、未完成事项和局限。

## 1. 产品目标与边界

建立一个名为 **Worksheet Studio** 的本地字帖生产工作台。用户主要通过 Codex 下达自然语言指令，例如：

> 给小学二年级生成《春、夏、秋、冬》的汉字描红字帖，A4 纵向，每字一行，田字格 15mm，显示拼音，每字 1 格范字 + 4 格浅灰描红 + 4 格空格。生成 10 页让我审核，审核通过后导出一份合并 PDF。

MVP 支持：

- **Agent-first**：Codex 能通过稳定的 CLI（JSON/YAML 输入）创建/修改项目、渲染、校验、查看状态和导出。**不必内嵌 LLM 聊天框**；自然语言理解由 Codex 完成。
- **汉字描红**：输入自定义汉字文本；田字格；汉字范字、浅灰描红、空白格；可选拼音（优先支持显式指定拼音，避免多音字错误）；纸张 A4 纵向。
- **本地预览**：浏览器访问 localhost 显示项目页面，支持页码切换、放大缩小、刷新后保持项目状态。CLI 修改配置后，应通过文件监听或自动轮询在合理时间内自动更新预览，无需重启服务。
- **人工 Review**：每页 `draft` / `needs_revision` / `approved` 状态；可以填写反馈、逐页批准或驳回；后续修改受影响页面后自动撤销旧批准（仅对发生变化的页面）。
- **批量 PDF**：从相同渲染模板导出单份多页 A4 PDF；默认只导出已批准页（CLI 显式参数可允许全部页面）；提供文件路径、页数与失败原因。
- **持久化**：项目、页面数据、审核记录保存在本地，重启后可恢复。

本阶段**不做**：英语/算术/控笔等额外模板、笔顺动画、教材抓取、OCR、用户登录、多用户权限、云端部署、在线模型管理、实时多人协作、可视化拖拽编辑器、复杂 Agent 编排。

## 2. 推荐技术方案

- **前端**：Vue 3 + Vite + TypeScript（如果现有仓库已采用成熟 React 架构，可以沿用）。
- **核心渲染**：统一使用 HTML/CSS（可内嵌 SVG 田字格），**预览与 PDF 必须复用同一套页面组件及 print CSS**，避免两套独立排版实现。
- **PDF**：Playwright Chromium 或 Puppeteer，优先复用仓库已有依赖。PDF 使用 `printBackground: true`、明确纸张 A4、边距与分页规则；务必加载中文字体。允许将自带/已授权字体作为可配置外部路径，不要提交未授权字体。
- **本地服务**：Node.js + TypeScript（前后端可以同进程或两个轻量进程）。不要为了技术栈一致性额外搭建非必要的 Python 后端。
- **数据**：每个项目保存 `project.json`（或 YAML）及 `review.json`，文件原子写入；MVP 无需数据库。
- **CLI**：`worksheet` 命令（可由 `npm run worksheet -- ...` 调用），输出机器可解析 JSON，失败返回非零退出码。
- **测试**：Vitest（配置/分页/状态逻辑），Playwright（预览和 PDF 冒烟）。

如果复用现有开源项目：先确认 LICENSE 可用于修改/分发，实际阅读关键渲染代码及导出实现，再采用适配层，而不是直接假定某个仓库已具备以上全部功能。

## 3. 约定数据模型（必须落地）

建议目录：

```text
worksheet-studio/
├── AGENTS.md
├── README.md
├── package.json
├── src/
│   ├── core/           # schema, pagination, render model, validation
│   ├── cli/            # Codex/脚本调用入口
│   ├── server/         # 本地 REST API / 静态资源
│   ├── web/            # 项目/页面预览、Review
│   └── pdf/            # 复用预览布局进行打印
├── projects/
│   └── demo-chinese/
│       ├── project.json
│       ├── review.json
│       └── exports/
└── tests/
```

`project.json` 可采用如下结构；具体字段允许调整，但须提供 schema 校验和示例：

```json
{
  "id": "demo-chinese",
  "title": "四季汉字描红",
  "paper": { "size": "A4", "orientation": "portrait", "marginMm": 12 },
  "template": "chinese-tracing",
  "layout": {
    "grid": "tianzige",
    "gridSizeMm": 15,
    "sampleCells": 1,
    "traceCells": 4,
    "blankCells": 4,
    "showPinyin": true,
    "fontFamily": "Noto Sans CJK SC"
  },
  "items": [
    { "character": "春", "pinyin": "chūn" },
    { "character": "夏", "pinyin": "xià" },
    { "character": "秋", "pinyin": "qiū" },
    { "character": "冬", "pinyin": "dōng" }
  ],
  "pageCount": 10
}
```

- 同一份**规范化模型**必须驱动屏幕预览与 PDF 渲染；字体大小、纸张边距、格子尺寸以明确的毫米单位定义。
- 不能因 `pageCount: 10` 就重复生成 10 张完全相同的页面且不说明规则：必须实现清晰的分页/重复策略，README 写明（例如按数据分页、不足时可选 `repeatToPageCount`），并用测试验证。
- 保证项目 ID/路径经过校验，禁止目录穿越。保存修改与审核记录时采用安全写入策略。
- Review 状态以**页面内容/布局的稳定哈希**关联；页面变更后旧批准自动失效，未变更页保留批准。注意分页改变时对应页面也可能改变。

## 4. CLI / Agent Tools（MVP 接口）

至少实现以下命令；命令名/参数可以小幅修改，但 README 必须提供可直接复制的用法：

```bash
npm run worksheet -- project create --from examples/demo.json
npm run worksheet -- project list
npm run worksheet -- project show demo-chinese
npm run worksheet -- render demo-chinese
npm run worksheet -- validate demo-chinese
npm run worksheet -- review list demo-chinese
npm run worksheet -- review set demo-chinese --page 1 --status approved
npm run worksheet -- review set demo-chinese --page 2 --status needs_revision --comment "字太小"
npm run worksheet -- export pdf demo-chinese --approved-only --out projects/demo-chinese/exports/approved.pdf
npm run worksheet -- export pdf demo-chinese --all --out projects/demo-chinese/exports/all.pdf
```

必须明确：

1. 每个命令输出 JSON（例如 `{ "ok": true, "data": ... }` / `{ "ok": false, "error": ... }`）。
2. `render` 输出页数、预览 URL；`validate` 输出结构化问题列表（错误/警告与页码）。
3. `export pdf --approved-only` 如无已批准页面，返回可理解的错误，不生成误导性空 PDF。
4. CLI 无需依赖浏览器页面操作即可运行；可在终端由 Codex 调用。
5. **人工批准不能被 Agent 自动伪造**：CLI 可以读取状态、提交修改和请求 Review，但默认不允许 Agent 命令将页面直接标记为 `approved`。`approved` 只能通过本地 Review UI 的明确人工动作写入；如实现了管理员/测试专用 CLI 批准命令，必须与常规 Agent 调用隔离，且生产默认禁用。上方 `review set ... approved` 是期望功能示例，最终实现应按本条安全边界调整，并在 README 写清楚。

## 5. Web Review 工作台（最小但完整）

页面提供：

- 左侧：项目列表和页面缩略图 / 页码。
- 中间：A4 页面实时预览，具有与 PDF 一致的尺寸比例和分页。
- 右侧：当前页面状态、反馈文本框、`批准`、`退回修改` 按钮。
- 顶部：状态统计、打印预览及 PDF 导出入口。
- 如果项目文件由 CLI 修改，界面自动检测并更新；不能无提示覆盖审核意见。
- 预览支持不出网的本地服务，不需要账号。

不要用静态图片假冒实时预览，也不要只做没有数据持久化的按钮。

## 6. 渲染与打印要求

- A4 纵向严格为 **210 × 297 mm**；CSS `@page { size: A4 portrait; margin: 0; }`，页面内容自管边距。
- SVG 田字格具有外框、水平/竖直辅助虚线；用户设定的格子实际尺寸需要可验证。
- 汉字范字深色、描红浅灰、空格留空；拼音与字格布局不重叠。
- 内容溢出应**确定性分页**或明确报错，不能静默裁切。
- PDF 支持中文文本、拼音声调；打印时无页眉页脚浏览器默认文本、无意外缩放。
- 默认离线：缺字体要报告并提供配置指导，不要暗中下载字体。
- 生成 PDF 之前应校验全部选中页面；如有严重排版错误则停止导出。

## 7. 开发步骤（按顺序执行，不要只停在计划）

### 里程碑 A — 可运行骨架
- 初始化项目与依赖；实现 schema、项目读写、CLI `create/list/show`。
- 提供 `examples/demo.json` 与生成后的 `projects/demo-chinese/`。
- 添加快速启动 README。

### 里程碑 B — 统一预览与 PDF
- 实现田字格、拼音、描红与确定性分页。
- CLI `render/validate/export pdf --all` 实际工作。
- 本地 Web 实时预览与 PDF 对照，确保 A4 版式一致。

### 里程碑 C — Review 闭环
- 页面审核状态、修改意见、持久化与页面哈希失效机制。
- UI 批准/驳回、CLI 查询状态、仅导出已批准页。
- CLI 修改配置触发预览更新，保证被修改页需要重新审核。

### 里程碑 D — 验收和交付
- 单元 + E2E 冒烟测试、20 页生成与 PDF 验收。
- 运行指令、目录结构、已知限制、后续可扩展工具写入 README。
- 输出最终简要执行报告，不必另写冗长设计文档。

## 8. MVP 验收标准（必须逐项核对）

- [ ] 本地一条命令启动工作台，访问 `http://localhost:5173` 或 README 指定的地址。
- [ ] 不配置任何大模型 API Key，也能由 CLI 生成示例字帖。
- [ ] Codex 能通过 CLI 从 JSON 配置创建项目、修改内容、渲染并导出。
- [ ] UI 能持续展示页面，编辑项目后自动刷新而不用重启。
- [ ] 支持逐页审核、填写反馈，审核数据重启后保留。
- [ ] 修改第 2 页后仅受影响的已批准页面失效（如果分页重排扩大影响，需正确标记）。
- [ ] 能生成至少 20 页 A4 纵向 PDF，中文、拼音和描红正常，页数/物理尺寸经程序化检查。
- [ ] 可以选择仅导出已批准页面；没有批准页时正确报错。
- [ ] PDF 打印与 Web 页面视觉排版一致，无严重裁切、重叠或缺字。
- [ ] 测试与启动指令均在 README 中实际验证可运行。

## 9. MVP 设计取舍

- 优先**可靠、可测、易控制**，不是追求 UI 华丽。
- 不要为了“Agent-first”引入庞大的编排框架；**结构化配置 + CLI 工具 + Codex** 已构成第一版 Agent 工作流。
- 预览和导出共享单一渲染实现是硬要求，不允许绕过。
- 人工审核是发布/打印关口；Agent 可以生成修改建议和检查质量，但不可以替代人工批准。
- 时间预算有限时，减少模板类型与 UI 装饰，不得牺牲可运行闭环和 PDF 质量。

## 10. 给 Codex 的最后指令

现在请执行而不是仅讨论：

1. 查看仓库结构、依赖、LICENSE 与已有测试。
2. 用不超过 10 行列出实现计划及任何必要假设。
3. 从里程碑 A 开始落实，持续推进到 D；实际执行命令和测试。
4. 如遇阻塞，优先采用最小可行替代，并明确记录原因，不虚构完成结果。
5. 最终给出启动命令、CLI 示例、预览 URL、样例 PDF 的实际路径，以及逐项验收结果。
