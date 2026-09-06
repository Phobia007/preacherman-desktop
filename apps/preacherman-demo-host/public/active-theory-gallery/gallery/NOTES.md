# Gallery 独立互动素材

- 范围：Work 场景中从 `Secret Sky` 到 `Frontier Within` 的真实项目序列。
- 交互：保留滚轮旋转、项目卡片、右上角导航、左下角分类切换和输入框。
- 资源：复用当前项目的本地 WebGL、模型、字体、图片和视频资源；无远程热链。
- 入口：项目根目录 `gallery.html`，桌面快捷方式名为 `gallery`。
- 对话：`Ask me anything...` 通过宿主共享桥接使用 Settings → Execution Mode 保存的 API / Local Agent；不再调用原站专有 AI。聊天记录独立保存在本机，模型请求只传递文本；本地任务仍须单独批准，分类切换保持原逻辑。
