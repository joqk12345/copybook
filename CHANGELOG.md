# Changelog

记录影响使用方式、配置格式及验收状态的变更。尚未发布的改动列在 Unreleased，不代表已打版本标签。

## [Unreleased]

### Added

- 新增 `chinese-stroke-order` 笔顺练习模板：逐笔 SVG 示范、步骤编号、当前笔红色高亮，以及范字、描红和空白书写格。
- 本地 `hanzi-writer-data` 笔顺数据依赖；运行时离线，未收录字明确返回 `STROKE_DATA_MISSING`。
- 四季笔顺配置 `examples/stroke-order.json` 与两页待审核示例项目 `demo-stroke-order`。
- 笔顺数据来源说明、完整 Arphic Public License 和第三方声明。
- 5 项笔顺单元测试，以及笔顺预览/换页/两页 A4 PDF 的 Playwright 测试场景。
- README 中的模板选择、笔顺分页、CLI 操作、审核及许可证说明。

### Changed

- 分页支持按实际高度放置完整练习块，笔画较多时步骤格自动换行，过高的单字练习块明确报错。
- 笔顺模板的 `rowsPerPage` 表示每页汉字练习块数量上限；描红模板保留固定行数规则。
- 笔顺模板和对应 SVG 路径纳入页面哈希；原描红模板保持哈希兼容。
- 工作台按项目显示“汉字描红”或“笔顺练习”，统一复用预览、审核与 PDF 渲染流程。
- JSON Schema 支持两种模板。

### Validation / limitations

- 构建及 13 项单元/CLI 测试通过；笔顺示例配置校验通过，自然生成两页模型。
- 笔顺为静态打印示范，无动画、手写识别或评分。教学使用前仍需人工核对字形和笔顺。
- 浏览器 E2E 与实际 PDF 验收受当前执行环境限制，不能视为已通过；详见 README 验收记录。

## [0.1.0] - 2026-11-05

初始 MVP（package.json 版本记录，未声明已经发布）。

### Added

- Vue 3 / Vite / TypeScript 本地审核工作台，Node/Express API。
- 汉字描红模板，A4 纵向田字格、显式拼音、范字、描红和空格。
- JSON/YAML CLI：项目创建、更新、查询、渲染、校验、审核反馈与 PDF 导出。
- project.json / review.json 本地持久化、原子替换和跨进程写锁。
- 逐页人工审核、稳定内容哈希、修改后撤销旧批准；CLI 拒绝人工批准状态。
- 共用 HTML/CSS/SVG 的浏览器预览与 Playwright PDF 流程，默认只导出已批准页。
- 自动同步、缩放、页码恢复、反馈草稿保留及冲突检查。
- 20 页循环描红配置，8 项初始单元/CLI 测试和隔离 E2E 场景。

### Known limitations

- 初始环境未完成 Chromium 启动及实际 PDF 页数/尺寸/视觉验收；未将其标记为通过。
