# Task 卡片局部交接

“全部”现为铺满舞台宽度的横向日期轴，不再保留两侧 10vw 空白：日期右侧箭头可点击，多日可同时展开，名称逐行向下浮现。刻度基线位于舞台 15.5vh，名称区截至 85vh，不覆盖品牌和底部导航。短刻度常态 4px、日期处长刻度 22px，均为上版的一半；日期附近渐长、指针经过平滑起伏的轮廓保留。日期字号减半为 1.2rem，名称仍为 2.5rem，名称间距增至 3rem，日期行下方间距增至 4rem。

按住刻度区可左右拖动，只有鼠标位于刻度区时滚轮才横移时间轴。鼠标在展开列内时只纵向滚动当前列；到达边界、内容较短、列收起或鼠标位于日期行时，均不自动转为横移。滚轮位移系数 .55，横纵向共用 190ms 指数缓动；切换滚动列会停止上一列的惯性，收起、进入详情及离开页面会取消残留动画。各列独立保留滚动位置，横纵均隐藏滚动条；刻度支持左右键、Home/End，减少动态效果偏好下即时滚动。

保留原舞台字体、模型、视频纹理、悬停跟随与进入详情动作。页面文字单独使用 DOM 裁切，点击标题时才交给原 WebGL 转场。悬停范围只返回当前名称按钮与本列、视口的交集；离开按钮立即停止激活，原视频收回动效不变。不再使用整片名称区域或额外触发边距。键盘焦点仍可预览。离开页面解除回调、观察器、指针事件及平滑滚动帧。

旧作品集演示卡片按稳定原始顺序分成 Sep.7th / Sep.8th / Sep.9th 三批，仅作为展示日期，不写入任务数据。日期标签按实际月份与日数生成，包含 Oct.5th、Jan.1st、Mar.22nd 等正确缩写与序数规则，11/12/13 使用 th。用户创建的任务始终使用真实创建时间（本地日历日期）；缺失日期归入 Earlier，跨年份显示年份。展开和滚动位置只保留在当前页面会话内；工作区筛选、分组视图及时间戳迁移不在本次范围。实现在 task-timeline.js、task-timeline-data.js、task-timeline.css；回归包含分批稳定性、真实日期优先、月份/序数/跨年、主题、刻度渐变、独立滚动、拖动与严格预览范围。

本次扩展既有 Task 卡片：创建时可选封面；所有卡片详情共用名称、摘要、关联任务与聊天布局。创建窗顶部 Close 和内部 X 已移除，外部点击及 Escape 保留；保存过程中暂不关闭。地图、AI 请求、后端及其他页面未调整。

实现位于 `public/gallery-v3/portfolio/`：`task-create-dialog.js` 管表单与焦点，`task-covers.js` 管图片，`task-create-rail.js` 管轨道插入，`task-metadata.js` 管元数据与关系，`task-conversation.js` 管消息；`_nuxt/Dr-ZLxUY.js` 挂载共同详情组件。既有卡片以 slug、新卡以 `task-UUID` 区分；消息键为 `preacherman.task.<id>.messages`，共用界面不合并记录。

封面接受 JPG／PNG／WebP，单张最多 12 MiB，最长边缩至不超过 1600px，转为 WebP。草稿预览留在内存；创建后 Blob 存入 IndexedDB `preacherman.task.covers`，元数据仅存 coverId，同源重新打开可读取。替换、移除或销毁预览会释放 URL；图片加载或元数据保存失败会回收未提交封面。隐藏删除任务仍保留本地记录和封面；清除应用数据会移除这些记录。无封面或读取失败使用 `task-empty-card.svg`／`task-empty-preview.svg`，不阻止详情打开。

样式来自 `task-metadata.css`、`task-conversation.css`，继承 `src/styles.css` 的语义 `--demo-theme-*`，由 `src/preferences.ts` 管理明暗偏好。既有字体、胶囊轮廓、Profile 透镜及轨道动效延续；Add task 沿用 Clash Display Light 与原按钮动效，聊天沿用现有字体，并保留减少动态效果分支。1800px 场景与灰色详情纸面均属既有实现，非新增全局设计规则。

已接受截图位于 `output/playwright/`：`task-cover-preview-form-{light,dark,compact,narrow}.png`、`task-cover-preview-created.png`、`task-cover-preview-new-detail.png`、`task-cover-preview-authored-{nathan-riley,casa-di-solare}-{light,dark}.png`、`task-cover-preview-index-preview.png`、`task-cover-preview-profile-preserved.png`；对应 `task-cover-native-*` 为原生验证证据。

桌面部署及验证记录见 `desktop-build-manifest.json`；浏览器截图不替代原生交付验证。原作品集外部 GraphQL、图标及媒体的 CSP 拦截提示已在旧版桌面程序同路径复现，保留原安全策略，不在本轮扩展范围内。

详情尺寸修复：封面专属的 `[data-id]` 宽高比不得决定详情面板高度；公共详情规则以 `aspect-ratio: auto` 恢复既有视口上下 inset。在 1800×1000 场景中，每张详情面板均为 x60/y24、1680×952；输入框底边固定在 y928。名称与摘要在左栏内滚动，消息在右栏内滚动，不移动外框或输入框。不同封面仍保留各自轨道比例和开合动效。

聊天不再常驻显示“文本对话与规划”等说明；错误、等待和上下文截断提示仅在必要时显示于输入框上方。文本输入聚焦不添加白色外框，保留文本光标；工具按钮仍保留键盘焦点标识。对应回归证据为 `task-panel-preview-*` 和 `task-panel-native-*`，覆盖全部既有卡片、新卡、长摘要、长消息、长草稿及关闭清理。
