# Third-party notices

## Hanzi Writer Data

- Package: `hanzi-writer-data`（确切版本见 package-lock.json）
- Source: https://github.com/chanind/hanzi-writer-data
- Original graphics: https://github.com/skishore/makemeahanzi
- Copyright (C) 1999 Arphic Technology Co., Ltd.
- License: Arphic Public License，完整原文见 [licenses/ARPHICPL.TXT](licenses/ARPHICPL.TXT)，依赖包内同时保留该文件。

本项目直接读取依赖包原始 `strokes` 数据，不修改或提交数据集文件。统一 HTML/SVG 模板按笔画顺序展示数据，增加网格、步骤编号和颜色；运行时不从网络加载。笔顺页面页脚保留来源标注。分享包含这些图形的 HTML/PDF 时，请附上完整许可证及本声明。

此声明只针对笔顺数据；正文所用系统或外部字体不随仓库分发，其使用和嵌入许可由所选字体决定。其他 npm 依赖的许可证保留在各依赖包内。项目自身尚未选择发布许可证。
