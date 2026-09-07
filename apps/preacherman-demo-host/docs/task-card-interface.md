# Task 卡片局部交接

本次扩展既有 Task 卡片：创建时可选封面；所有卡片详情共用名称、摘要、关联任务与聊天布局。创建窗顶部 Close 和内部 X 已移除，外部点击及 Escape 保留；保存过程中暂不关闭。地图、AI 请求、后端及其他页面未调整。

实现位于 `public/gallery-v3/portfolio/`：`task-create-dialog.js` 管表单与焦点，`task-covers.js` 管图片，`task-create-rail.js` 管轨道插入，`task-metadata.js` 管元数据与关系，`task-conversation.js` 管消息；`_nuxt/Dr-ZLxUY.js` 挂载共同详情组件。既有卡片以 slug、新卡以 `task-UUID` 区分；消息键为 `preacherman.task.<id>.messages`，共用界面不合并记录。

封面接受 JPG／PNG／WebP，单张最多 12 MiB，最长边缩至不超过 1600px，转为 WebP。草稿预览留在内存；创建后 Blob 存入 IndexedDB `preacherman.task.covers`，元数据仅存 coverId，同源重新打开可读取。替换、移除或销毁预览会释放 URL；图片加载或元数据保存失败会回收未提交封面。隐藏删除任务仍保留本地记录和封面；清除应用数据会移除这些记录。无封面或读取失败使用 `task-empty-card.svg`／`task-empty-preview.svg`，不阻止详情打开。

样式来自 `task-metadata.css`、`task-conversation.css`，继承 `src/styles.css` 的语义 `--demo-theme-*`，由 `src/preferences.ts` 管理明暗偏好。既有字体、胶囊轮廓、Profile 透镜及轨道动效延续；Add task 沿用 Clash Display Light 与原按钮动效，聊天沿用现有字体，并保留减少动态效果分支。1800px 场景与灰色详情纸面均属既有实现，非新增全局设计规则。

已接受截图位于 `output/playwright/`：`task-cover-preview-form-{light,dark,compact,narrow}.png`、`task-cover-preview-created.png`、`task-cover-preview-new-detail.png`、`task-cover-preview-authored-{nathan-riley,casa-di-solare}-{light,dark}.png`、`task-cover-preview-index-preview.png`、`task-cover-preview-profile-preserved.png`；对应 `task-cover-native-*` 为原生验证证据。

桌面部署及验证记录见 `desktop-build-manifest.json`；浏览器截图不替代原生交付验证。原作品集外部 GraphQL、图标及媒体的 CSP 拦截提示已在旧版桌面程序同路径复现，保留原安全策略，不在本轮扩展范围内。

详情尺寸修复：封面专属的 `[data-id]` 宽高比不得决定详情面板高度；公共详情规则以 `aspect-ratio: auto` 恢复既有视口上下 inset。在 1800×1000 场景中，每张详情面板均为 x60/y24、1680×952；输入框底边固定在 y928。名称与摘要在左栏内滚动，消息在右栏内滚动，不移动外框或输入框。不同封面仍保留各自轨道比例和开合动效。

聊天不再常驻显示“文本对话与规划”等说明；错误、等待和上下文截断提示仅在必要时显示于输入框上方。文本输入聚焦不添加白色外框，保留文本光标；工具按钮仍保留键盘焦点标识。对应回归证据为 `task-panel-preview-*` 和 `task-panel-native-*`，覆盖全部既有卡片、新卡、长摘要、长消息、长草稿及关闭清理。
