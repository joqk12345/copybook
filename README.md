# Worksheet Studio

本地、Agent-first 的汉字描红工作台。Vue 3 + Vite + TypeScript，Node/Express 服务，JSON 文件持久化；无需账号、数据库或模型 API Key。支持汉字描红与笔顺练习两种模板，统一使用 A4 纵向田字格、范字、浅灰描红、空白格和显式拼音。更新记录见 [CHANGELOG.md](CHANGELOG.md)。

## 快速启动

需要 Node.js 22.12+、npm、中文字体和 Chromium/Chrome。首次安装依赖需要网络；运行、预览、审核和导出不需要联网。

```bash
npm ci
npm run dev
```

仓库已提供两个待人工审核的示例项目：

- 汉字描红：http://localhost:5173/?project=demo-chinese
- 笔顺练习：http://localhost:5173/?project=demo-stroke-order

已有示例无需再次 create；空项目目录可通过 `npm run --silent worksheet -- project create --from examples/demo.json` 创建。一个命令启动前端与 API，服务只监听 `127.0.0.1`。退出使用 Ctrl+C。

生产模式：

```bash
npm run build
npm start
```

默认使用本机 Google Chrome（macOS 已安装时），否则使用 Playwright Chromium。没有浏览器时执行 `npx playwright install chromium`；该操作只在安装时需要网络。可用环境变量 `WORKSHEET_CHROME=/absolute/path/to/chrome` 指定浏览器。

## Agent / CLI

使用 `--silent` 去掉 npm 自身提示，命令 stdout 为单个 JSON：`{"ok":true,"data":...}` 或 `{"ok":false,"error":"..."}`；失败返回非零退出码。validate 的校验错误返回 `ok:true,data.valid:false,data.issues` 并以退出码 1 结束。CLI 不依赖服务已经启动；render 返回预览 URL，打开预览需要启动服务。

```bash
npm run --silent worksheet -- project list
npm run --silent worksheet -- project show demo-chinese
npm run --silent worksheet -- render demo-chinese
npm run --silent worksheet -- validate demo-chinese
npm run --silent worksheet -- review list demo-chinese
npm run --silent worksheet -- review set demo-chinese --page 2 --status needs_revision --comment "请核对拼音"
# 编辑或复制 examples/demo.json 后更新整个配置；也支持 YAML
npm run --silent worksheet -- project update demo-chinese --from examples/demo.json
# 草稿导出，显式允许所有页
npm run --silent worksheet -- export pdf demo-chinese --all --out projects/demo-chinese/exports/all.pdf
# 默认仅导出人工批准页；无批准页会报错且不产生空 PDF
npm run --silent worksheet -- export pdf demo-chinese --approved-only --out projects/demo-chinese/exports/approved.pdf
```

`project create --from FILE` 只创建新项目，`project update ID --from FILE` 要求 ID 与文件一致。可以先复制示例、修改 id 和内容，再 create。导出路径限定为该项目的 `exports/` 目录下 `.pdf` 文件，默认文件名分别为 `all.pdf`、`approved.pdf`。成功结果包含绝对路径、实际页码、页数和字节数。`--all` 与 `--approved-only` 互斥，默认仅批准页。草稿导出是质量检查用途。

**人工批准边界：** 常规 CLI 只接受 `draft` / `needs_revision`，明确拒绝 `approved`，不存在管理员批准开关。用户在本地 UI 点击“批准本页”并确认后才写入批准。Agent 不应调用审核 HTTP 接口或模拟生产 UI 来代替人工批准。接口要求同源 Origin 与专用请求头，防止其他网站直接提交；这不是身份认证机制，也不能防止有本地文件/HTTP 权限的程序伪造请求。项目保存在本机用户可写目录，不具有防篡改审计保证。E2E 模拟批准只针对 `.tmp/e2e-projects` 隔离项目，生产示例保持 draft。

## 笔顺练习

配置 `template: "chinese-stroke-order"` 即可使用新模板，其他纸张、拼音、范字、描红、空白格配置沿用。完整示例见 [examples/stroke-order.json](examples/stroke-order.json)。

```bash
# 在尚未创建该项目时执行
npm run --silent worksheet -- project create --from examples/stroke-order.json
# 已有项目要更新配置时使用 update
npm run --silent worksheet -- project update demo-stroke-order --from examples/stroke-order.json
npm run --silent worksheet -- validate demo-stroke-order
npm run --silent worksheet -- render demo-stroke-order
npm run --silent worksheet -- export pdf demo-stroke-order --all
```

每字先显示带编号的逐笔示范：当前笔为红色、已写笔画为深灰色、未写笔画为浅灰轮廓；下方保留范字、描红和空白练习格。属于可打印的静态笔顺练习，不含动画、手写识别或书写评分。使用已有 Review 流程逐页人工批准，然后默认仅导出批准页。

笔顺从安装在本地的 `hanzi-writer-data` 读取，应用运行时不访问 CDN。未收录汉字会返回 `STROKE_DATA_MISSING`，不会推测笔顺或自动联网补全。数据可能存在字形和笔顺地区差异，正式用于教学前应逐页核对。

笔顺图形与系统字体是不同来源：笔顺格使用数据集 SVG 轮廓，描红格使用用户配置的字体，外观可能略有差异。实际笔顺路径参与该页内容哈希；升级数据集可能要求受影响页面重新审核。原描红模板的页面哈希保持兼容。

### 笔顺分页

每行可放 `floor((210 - 2 × marginMm) / gridSizeMm)` 个步骤格。笔画多时自动换行，每个步骤包含一个字格和 4 mm 编号区。

每字练习块高度为：

```text
(showPinyin ? 7 : 0) + 5
+ ceil(笔画数 / 每行步骤格数) × (gridSizeMm + 4)
+ 5 + gridSizeMm + 5     // 单位 mm
```

按输入顺序将完整练习块装入可用高度，不将同一个汉字拆到两页。`rowsPerPage` 在笔顺模板中表示每页最多多少个汉字练习块；若可用高度不足会提前分页。单个练习块放不下时返回 `PAGE_OVERFLOW`，应减小字格尺寸。循环模式仍需显式启用，按顺序循环填充至目标页数。

示例“春、夏、秋、冬”每页最多两个汉字，自然生成 **2 页**，不重复内容。运行生成的 HTML 样例位于 `projects/demo-stroke-order/exports/stroke-order.html`；PDF 验收状态见后文。

笔顺数据许可证和来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 及 [licenses/ARPHICPL.TXT](licenses/ARPHICPL.TXT)。分享包含笔顺图形的导出文件时，请同时保留许可证和来源声明。

## 配置与分页规则

示例：[`examples/demo.json`](examples/demo.json)，可供编辑器使用的 JSON Schema：[`examples/project.schema.json`](examples/project.schema.json)。运行时以 `src/core/model.ts` 中 Zod schema 为准。每个 item 必须是单个汉字，拼音由用户显式提供；缺少拼音发出警告，不自动推测多音字。所有尺寸均以毫米定义，纸张固定为 **210 × 297 mm**。

- 下列固定行数规则适用于 `chinese-tracing`；笔顺模板使用上文的完整练习块分页。
- 每页预留上下 margin、30 mm 标题区及 6 mm 页脚保护区；每行高度为 `gridSizeMm + (showPinyin ? 7 : 0) + 4`。
- 自动容量为 `floor((297 - 2 × marginMm - 36) / 行高)`，可用 `rowsPerPage` 指定更少行数。
- 默认按 items 顺序自然分页，最后一页不补齐，不丢弃内容。
- 可选 pageCount 不能小于自然页数。大于自然页数时，必须显式设置 `repeatToPageCount: true`。
- 循环模式按 items 序列连续循环，每页填满指定行数，直到 pageCount（未设置则自然页数）。练习页码区别各页。示例四个季节、每页八行、循环到 20 页，练习内容会重复；不是 20 页不同汉字。
- 宽度/高度溢出、字体缺失、缺字和标题过长会阻止导出；最多 200 页、10,000 个 item。PDF 导出还检查浏览器实际字体加载、标题/拼音宽度与内容边界，出现溢出即停止。

字体不随仓库分发，也不会暗中下载。默认在 macOS 使用系统 `Hiragino Sans GB`；Linux 可将 fontFamily 改为 `Noto Sans CJK SC`，要求 `/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc` 已存在。其他字体通过以下配置加载：

```json
{"fontFamily":"My licensed Chinese Font","fontPath":"/absolute/path/to/licensed-font.otf"}
```

放入 `layout` 中，外部字体仅支持 `.ttf` / `.otf`，按需内嵌到同一份页面 HTML，供浏览器和 PDF 共用。请自行确认字体使用及嵌入许可，不要提交未授权字体。系统 TTC 仅支持代码中列出的已知路径/字体名。拼音使用本机 Arial/sans-serif，导出会检查是否发生文本溢出。fontkit 检查中文字符覆盖，字体文件内容摘要参与页面哈希。

## Review 与持久化

左侧项目和页码，中间 iframe 实时 A4 页面，右侧反馈和逐页批准/退回。顶部显示批准统计、已批准页打印预览和 PDF 导出。缩放支持 50/70/85/100%，项目、页码与缩放保存在浏览器 localStorage。

每 1.5 秒轮询本地文件，CLI 修改后无需重启服务。未提交的反馈不会被轮询覆盖；当前页内容或审核发生变化时，保留草稿并提示用户重新核对，核对前禁止提交。切换页/项目或关闭页面时提醒未保存反馈。保存审核会检查页面哈希及审核版本，拒绝旧状态覆盖。

`project.json` 与 `review.json` 使用同目录临时文件 + rename 原子替换。每项目 `.lock` 目录串行化跨进程写入。崩溃后若遗留锁，在确认没有写入进程后手动删除对应 `.lock` 目录。两份文件没有数据库事务；中断后下一次读取会按当前项目内容重新校验审核状态。

页面哈希含实际页面 items、标题、布局、页码、渲染版本及字体摘要。更改第 2 页内容只撤销真正变化页面的批准；全局布局/字体变化会撤销所有受影响页。失效状态持久化为 draft，反馈和历史保留，恢复旧内容也不会恢复批准。删除页面的审核记录归档在 review.json 的 `archive-*` 键下。审核历史记录动作来源和时间，不包含外部身份认证。

项目 ID 限小写字母、数字和连字符，禁止目录穿越；项目目录及配置/审核/导出文件拒绝符号链接。`WORKSHEET_PROJECTS` 可指定另一个项目根目录，`PORT` 可修改服务端口。

## 同一渲染实现

`src/core/render.ts` 是预览和 PDF 唯一的 HTML/CSS/SVG 模板；服务预览没有独立重画。`@page { size: A4 portrait; margin: 0; }`，页内自行管理边距、固定 mm 格子、外框和辅助虚线。PDF 使用 printBackground、preferCSSPageSize、零边距、关闭页眉页脚；渲染过程中阻止外部网络请求。导出完成前再次检查项目及审核版本，有变化则放弃本次结果，不覆盖旧 PDF。

浏览器打印时选择 100% 比例、关闭页眉页脚；正式导出优先使用 PDF 按钮/CLI。PDF 参数遵循 [Playwright 官方 Page.pdf 文档](https://playwright.dev/docs/api/class-page#page-pdf)。

## 测试与当前验收记录（2026-11-05）

```bash
npm run build
npm test
npm run test:e2e
# 全部检查
npm run check
```

已实际运行 `npm run build`、`npm test`（13 项通过，含真实 CLI 集成测试和 5 项笔顺测试）、CLI 创建/更新/列出/渲染/校验，以及启动开发服务。笔顺示例已实际执行 create、validate、render，自然生成 2 页模型。依赖升级至 Vitest 4.1.12+ 后，npm 安装审计报告 0 个已知漏洞。

**当前环境阻塞：** 已实际尝试 Playwright E2E 和草稿 PDF 导出。受执行沙箱限制，隔离测试服务监听 `127.0.0.1:5174` 返回 EPERM，Chrome 子进程启动后退出；审批策略拒绝权限提升。因此 E2E 未通过，尚未生成可交付 PDF，也未完成 PDF 页数、物理尺寸或视觉验收。不能把 20 页渲染模型视为已经验证的 20 页 PDF。

| 验收项 | 当前结果 |
| --- | --- |
| 单命令启动本地工作台 | 已启动，localhost:5173 |
| 无模型 API Key 的 CLI 生成 | 通过，示例配置已生成 |
| CLI 创建/修改/渲染/校验 | 通过；PDF 导出受浏览器启动限制 |
| CLI 修改后 UI 自动更新 | 已实现轮询，浏览器 E2E 待运行 |
| 审核/反馈重启保留 | 存储层跨实例测试通过；UI 待 E2E |
| 仅受影响页批准失效 | 单元测试通过，包含恢复旧内容不恢复批准 |
| 20 页 A4 PDF 页数/尺寸/完整性 | 未完成，Chrome 启动受限 |
| 仅导出批准页、无批准时报错 | 选择逻辑已实现；无批准 CLI 错误已验证；实际 PDF 待测 |
| 浏览器/PDF 排版与字形 | 共用模板，视觉验收未完成 |
| README 启动/测试命令 | 构建、单测、dev、CLI 已运行；E2E/PDF 阻塞如上 |

`tests/workflow.e2e.ts` 包含两套隔离流程：笔顺 SVG 步骤/换页/两页 A4 PDF，以及原描红流程：CLI → UI 预览与 15 mm 格尺寸 → 模拟人工审核 → 刷新保留 → CLI 修改第二页/草稿保留 → 只导出第一页 → 20 页 PDF。使用 pdf-lib 检查 PDF 页数、A4 MediaBox、文件头/EOF，并保存工作台截图。执行成功后的测试样例在 `.tmp/e2e-projects/e2e-twenty/exports/all.pdf`，截图在 `test-results/workspace.png`；**当前这些文件尚未成功生成**。

当前可检查的样例是 `projects/demo-chinese/project.json`、`review.json`、CLI render 返回的 20 页模型，以及实际通过本地打印接口生成的 `projects/demo-chinese/exports/draft-20-pages.html`（可直接用浏览器打开的 20 页 HTML，尚未完成浏览器视觉验收）。常规导出目标为 `projects/demo-chinese/exports/all.pdf`（当前不存在）。请在允许本地监听和浏览器启动的终端执行上述 E2E 与 export 命令完成验收。

## 目录与边界

```text
src/core/    schema、分页、统一模板、校验、字体、文件存储
src/cli/     JSON/YAML CLI
src/server/  本地 REST、Vite/静态文件
src/web/     Vue 审核工作台
src/pdf/     Playwright 打印
examples/    配置与 JSON Schema
projects/    本地项目、审核、exports（PDF 已忽略提交）
tests/       Vitest + 隔离 Playwright E2E
```

本阶段没有登录、云端、内嵌 LLM、自动拼音、笔顺动画或其他学科模板，没有可视化内容编辑器，修改内容使用 CLI/配置文件。UI 优先桌面三栏，最小布局宽度 1000 px。文件存储适合单机轻量工作，不提供跨机器并发及不可篡改保证。未来可在稳定 CLI 和 schema 之上增加模板与工具；不需要引入 Agent 编排框架。

仓库最初没有 LICENSE，尚未选择项目自身的发布许可证；对外分发前应由项目所有者确定。依赖使用各自许可证，正文中文字体保持系统/外部引用；笔顺 SVG 数据使用独立的 Arphic Public License，详见第三方声明。
