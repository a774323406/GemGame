> 2026-10-04 用户最新修正优先：玩法参数直接沿用原 drift 项目，撤销自创镜头旋转、缩放、震动及每十弯四倍冲刺。实际实现与验证以 drift-feed-verification.md 后续修正为准。

# 拉索漂移无尽推荐流 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 drift 的拉索驾驶移入 GemGame，交付可试玩的无尽推荐流，包含阶段加速、换景、音效、撞车爆炸及全屏结算。

**Architecture:** 复用源项目的纯 TypeScript 运动与赛道模块，通过独立无尽会话管理计分、速度和复活；Cocos 场景控制器连接输入、平台与表现。表现层只消费事件，不修改碰撞或驾驶坐标。所有场景和资源都有可重复生成的工具。

**Tech Stack:** Cocos Creator 3.8.5、TypeScript、Node.js 离线测试和 authoring 脚本、现有 Web 预览工具。

**Spec:** `docs/superpowers/specs/2026-10-04-drift-feed-design.md`（用户已确认）。

## Global Constraints

- 源项目 `../cocosProject/drift` 只读；目标在 GemGame。保留工作区其他未提交更改，尤其已删除玩法，不恢复它们。
- 前 6 弯基础速度不变，第 6～65 弯线性增至 1.4 倍；每 10 弯后寻找安全长直道安排一次加速，爆冲目标 4 倍，不将该速度带入弯道。
- 每 10 弯进入草绿、沙漠暖色、冰蓝、夜间紫蓝下一主题，在安全直道约 1 秒渐变。
- 首次按下开局；撞车停止输入和计分，约 0.8 秒后结算；每局最多两次激励视频复活。
- 全屏结算黑遮罩 145/255、大标题和胶囊按钮，复用 `tools/feed_result_layout.mjs`；750×1334、750×1624 下按钮底部至少留 80 设计单位。
- 不修改拼豆结算，不迁入关卡解锁、竞速对手、商城或货币系统。
- 用户补充：道路等可用素材优先复用，车辆必须重新制作；原车仅供视角和尺度参考，不将旧车或旧车简单换色作为交付。
- 不编造正式 Content_ID；缺失时交付大厅与本地调试入口，明确正式投放映射尚未启用。
- 不安装新的产品依赖；复用 Creator 的 TypeScript 和已有预览运行环境。每次提交只暂存本任务文件或相关修改片段。

## Review Focus

1. 切后台和长帧不能积累巨量物理步数、跳过撞车或恢复为持续按住；任务 1、3 验证。
2. 重复广告回调、广告期间重玩或销毁场景不能重复复活、扣次数或污染下一局；任务 3 验证。
3. 赛道回收后复活不得丢失计分、回到不存在的路段或处于加速入口；任务 1 验证。
4. 音频晚到、加载失败或静音状态变化不得复播旧循环或阻塞开局；任务 4 验证。
5. 缺失/未知推荐流 ID 和当前其他玩法删除不能误路由或被重新引入；任务 5 验证。

## 文件与职责

- `assets/scripts/drift/{SlingDriftMotion,TrackRuntime,EndlessTrackGenerator,DriftFeelConfig}.ts`：从源项目迁入的运动和道路能力，保留原导出接口及相对依赖。
- `assets/scripts/drift/driftFeedRules.ts`：无尽会话、阶段、状态、计分、复活和事件。
- `assets/scripts/drift/driftFeedView.ts`：道路节点池、车辆、拉索、相机和主题表现。
- `assets/scripts/drift/driftFeedEffects.ts`：烟尘、胎痕、加速粒子和一次性爆炸。
- `assets/scripts/drift/driftFeedAudio.ts`：独立循环声道、短音、音量和生命周期。
- `assets/scripts/driftFeedGameScene.ts`：场景控制器，连接上述模块、HUD 和目标项目 SDK。
- `assets/res/driftFeed/`：隔离的车辆、道路、音乐和新音效；新增资源与脚本均维护 `.meta`。
- `tools/{drift_feed_authoring,build_drift_feed_scene,build_drift_feed_assets,build_drift_feed_audio}.mjs`：可重建场景、素材复制清单和确定性音效生成。
- `tools/test_drift_feed_{rules,scene,controller,effects,audio,integration}.cjs` 与 `tools/drift_feed_test_helpers.cjs`：沿用现有离线测试模式，模拟平台调用。
- `tools/preview_drift_feed.cjs`：实际 Creator Web 构建的触摸试玩与截图，不发送真实广告或分析请求。

### Task 1：无尽驾驶会话与安全阶段

**Files:** 创建四个迁入模块、`driftFeedRules.ts`、`tools/drift_feed_test_helpers.cjs`、`tools/test_drift_feed_rules.cjs`。

**Interfaces:**
- 保留源项目 `SlingDriftMotion.configure/reset/release/update`、`TrackRuntime.resetEndless/ensureTrack/setProgress/getTrackPoint/findClosestTrackPoint/getReviveTrackPoint/getEndlessRoadVisuals` 接口。
- `DriftFeedRun(seed: number)`，方法 `start(): void`、`setPressed(pressed: boolean): void`、`update(dt: number): void`、`crash(): void`、`revive(): boolean`、`restart(seed: number): void`、`drainEvents(): DriftFeedEvent[]`。
- 只读 `snapshot: DriftFeedSnapshot`：`phase`（ready/driving/crashing/result/reviving）、`car: SlingDriftState`、`progress: number`、`curves: number`、`revivesRemaining: number`、`themeIndex: number`、`bursting: boolean`、`targetSpeed: number`；只读 `track: TrackRuntime`。
- `DriftFeedEvent` 为 `{ type: 'attach'|'detach'|'curve'|'boost-start'|'boost-end'|'crash'|'revive'|'result'|'theme'; x: number; y: number; value: number }`，value 承载过弯数或主题索引，其余为 0。
- 导出 `baseSpeedMultiplier(curves: number): number`，供测试准确校验速度曲线。

- [ ] 写测试：`assert.equal(baseSpeedMultiplier(6), 1)`、`assert.equal(baseSpeedMultiplier(65), 1.4)`、`assert.equal(baseSpeedMultiplier(1000), 1.4)`；相同种子道路相同、开始前不计分、一次过弯只加一次。
- [ ] 运行 `node tools/test_drift_feed_rules.cjs`，确认缺少实现而失败。
- [ ] 迁入纯模块与源配置；从源控制器提取必要的有效锚点选择、松手恢复及车辆边界碰撞逻辑，采用固定步长并限制长帧子步数。不得直接搬入整个 7000 行控制器。
- [ ] 实现会话状态和事件；加速配置初始采用 1200 长直道、前 420 单位爆冲、接下来 180 单位回正、最后至少 600 单位按正常速度驾驶。连续直道组合须按轨迹跨度判定，短直道不强行加速；跨边界步进必须先处理速度结束再进入弯道。
- [ ] 补充测试：连续 180°禁止、同向最多两弯、长期生成无不安全拼接且回收有界；速度在下一弯前恢复；复活保留总分且不重复计算回退路段；失效复活不减次数；两次后拒绝；长帧无巨大位移；重复 crash 只发一次事件。
- [ ] 运行 rules 测试全部通过；仅提交该任务文件，提交说明 `feat: add endless drift simulation and stages`。

### Task 2：可生成的游戏场景与视觉赛道

**Files:** 创建 `driftFeedView.ts`、`drift_feed_authoring.mjs`、`build_drift_feed_scene.mjs`、`build_drift_feed_assets.mjs`、`assets/gamescene/DriftFeedGameScene.scene` 及 meta、独立素材目录、`test_drift_feed_scene.cjs`。

**Interfaces:** `DriftFeedView(root: Node)`，`render(snapshot: DriftFeedSnapshot, track: TrackRuntime, dt: number): void`、`reset(): void`、`dispose(): void`。authoring 导出 `buildDriftFeedScene(): object[]` 及固定 `SCENE_UUID`；build 脚本使用 `--output-dir`，与外卖场景工具一致。

- [ ] 写场景测试，断言引用无悬空、UUID 唯一、资源存在，Canvas 包含 World、HUD、Guide、ResultOverlay 和暂停控件；结果按钮复用共有布局，遮罩拦截输入。
- [ ] 运行 `node tools/test_drift_feed_scene.cjs` 确认缺少场景而失败。
- [ ] 编写明确资源复制清单，复用源项目 `res/texture/road/road_straight_600.png`、`road_left_90_r300.png`、`road_180_r300.png` 及相应道路预制体，并核对 `res/prefab/common/speedArrow.prefab` 的纹理与组件依赖；拉索和锚点沿用已有表现。重映射 UUID 到独立目录并保存来源清单，禁止复制整个资源包及 SDK，禁止将旧车列入交付素材。
- [ ] 读取并使用适用的 imagegen/2D 素材技能，先观察原道路和原车参考，再用内置图像生成制作一辆无品牌亮橙俯视运动小车：车头朝上、深色车窗、简洁浅色装饰、完整车身及透明背景。输出 `assets/res/driftFeed/car/player-car.png` 和 meta；原图、提示词与来源记录保存在 `docs/reference/drift-feed/`。不新增车库或多皮肤功能。
- [ ] 在实际道路背景上检查新车四方向旋转、透明边缘、中心锚点、四主题对比度和最终显示尺寸；碰撞尺寸不包含图片透明边距，视觉车身与碰撞轮廓一致。将新车 alpha 非空/非全不透明、车头方向人工核验、来源不同于旧车写入素材检查记录。
- [ ] 实现视图：图像道路与 R300/600 几何对齐，回收屏幕后方节点，车辆固定在可预判前路的位置；拉索连实际锚点，主题渐变仅改变视觉属性。加速时镜头拉远，退出后平滑恢复。
- [ ] 用 `node tools/build_drift_feed_assets.mjs` 生成素材，再用 `node tools/build_drift_feed_scene.mjs --output-dir assets/gamescene` 生成场景；`feed_result_layout.mjs` 负责结果布局，`FeedResultPresentation` 管理 HUD 显隐。
- [ ] 运行 scene 测试和 `node tools/test_feed_result_layout.cjs`；确认重复生成产物一致，提交 `feat: author drift feed scene and track visuals`。

### Task 3：输入、结算与复活生命周期

**Files:** 创建 `assets/scripts/driftFeedGameScene.ts`、`tools/test_drift_feed_controller.cjs`；更新 authoring 的序列化绑定。

**Interfaces:** 场景组件 `driftFeedGameScene` 持有 `DriftFeedRun` 和 `DriftFeedView`；对 UI 提供 `retry(): void`、`requestRevive(): Promise<void>`、`setPaused(paused: boolean): void`。使用现有 `SdkUtils.showRewardedVideo()`，不另建广告服务。

- [ ] 写控制器测试：准备时不移动；首按开始；松手和 TOUCH_CANCEL 都释放；撞车后 `update(0.79)` 不结算，累计跨过 0.8 秒才显示一次结算；重玩恢复 HUD。
- [ ] 运行 `node tools/test_drift_feed_controller.cjs` 确认失败。
- [ ] 实现输入及生命周期；后台/暂停/广告清空按住状态，暂停期间不推进会话和爆炸计时。最高纪录键使用 `gemgame.driftFeed.bestCurves`，读取损坏或非有限数据时回退 0。
- [ ] 实现复活等待锁与会话 token；成功回调仅在相同局、未销毁、处于结算时生效；默认 3 秒安全复活倒计时。原局次数随成功复活减少，取消保持不变，次数为 0 隐藏按钮并重排。
- [ ] 补测试：取消和异常不扣次数；重复成功不多扣；等待中重玩/离开后旧回调无效；后台恢复不自动拉索；结果遮罩不能触发驾驶。
- [ ] 运行 controller、rules、scene 测试通过，提交 `feat: connect drift input results and rewarded revival`。

### Task 4：音效与撞车爆炸

**Files:** 创建 `driftFeedAudio.ts`、`driftFeedEffects.ts`、`build_drift_feed_audio.mjs`、`test_drift_feed_audio.cjs`、`test_drift_feed_effects.cjs`，修改控制器事件分发和资源清单。

**Interfaces:** `DriftFeedAudio(root: Node)` 提供 `unlock(): void`、`consume(events: readonly DriftFeedEvent[]): void`、`sync(snapshot: DriftFeedSnapshot, dt: number): void`、`setSuspended(value: boolean): void`、`reset(): void`、`dispose(): void`。`DriftFeedEffects(root: Node)` 提供 `consume(events: readonly DriftFeedEvent[]): void`、`update(dt: number): void`、`reset(): void`、`dispose(): void`。两个模块独立接收同一批事件，事件队列每帧仅 drain 一次。

- [ ] 写测试：一次 crash 只有一次爆炸/音效；`reset()` 后粒子数为 0、相机偏移为 0；循环声道上限为引擎/漂移各一个；暂停、静音和销毁后不播放；迟到的加载完成不能重新启动。
- [ ] 运行 `node tools/test_drift_feed_audio.cjs` 和 `node tools/test_drift_feed_effects.cjs`，确认缺少模块而失败。
- [ ] 生成确定性 PCM WAV：引擎及漂移无点击循环、拉索短音、计分、加速呼啸和爆炸噪声包络；优先复用现有背景音乐和按钮声。音频峰值留余量，生成器检查 WAV 头、时长、非静音及循环端点，记录合成来源。
- [ ] 实现独立场景音源，复用目标项目静音配置和场景音乐占用机制；碰撞立即停止驾驶循环、压低 BGM，音频失败时静默降级，不延误操作。不得修改全局所有玩法音量来实现单场景压低。
- [ ] 实现世界坐标粒子池：火团约 0.2 秒，烟雾约 0.8 秒，撞车包含火花/碎片/冲击环；短轻震只作用视觉根节点。加入原有风格胎痕和漂移烟尘，明确上限并回收。
- [ ] 运行 audio、effects 和 controller 测试；预览中实际听检爆炸、漂移循环接缝与加速同步，提交 `feat: add drift audio and crash explosion feedback`。

### Task 5：大厅和推荐流路由

**Files:** 修改 `assets/scripts/framework/GameSceneBundle.ts`、`assets/scripts/newMainScene.ts`、`tools/build_new_main_scene.mjs`、`assets/gamescene/NewMainScene.scene`、`assets/scripts/loadScene.ts`、`assets/scripts/framework/Platform/FeedRevisitConfig.ts`、`assets/scripts/framework/Platform/sdk/SdkUtils.ts`；新增 `tools/test_drift_feed_integration.cjs`；必要时更新已有入口断言。

**Interfaces:** 新枚举 `GameSceneName.DriftFeedGame = 'DriftFeedGameScene'`；`FEED_DRIFT_CONTENT_ID: string = ''` 初始为空；仅在非空且传入 ID 精确匹配时进入新场景。本地预览通过场景 UUID 加载，无需伪造 ID。

- [ ] 写路由测试：大厅入口可进入；真实配置值精确匹配；空值、缺失值和未知 ID 不误入；已有其他玩法路由保持当前工作区行为。
- [ ] 运行 `node tools/test_drift_feed_integration.cjs` 确认失败。
- [ ] 按现有模式登记场景 UUID、SDK 中文名“拉索漂移”和大厅卡片；用 authoring 更新大厅，先检查工具是否会覆盖用户最新改动；必要时仅更新新卡片相关部分。
- [ ] 加入禁用空 ID 的路由守卫和获客生命周期，保持复访功能当前禁用状态；不向平台发送测试上报。
- [ ] 运行 integration 及 `tools/test_feed_integration.cjs`、`tools/test_new_main_scene.cjs`、`tools/test_retired_games_removed.cjs`；提交 `feat: integrate drift feed entry and routing`。

### Task 6：实际试玩与交付

**Files:** 创建 `tools/preview_drift_feed.cjs`、`docs/superpowers/reports/2026-10-04-drift-feed-verification.md`；必要的修复跟随所属模块。

**Interfaces:** `node tools/preview_drift_feed.cjs <build-url> <output-directory>` 输出两个尺寸的驾驶、冲刺、换景、爆炸、失败结算、复活截图和 JSON 检查报告。沿用已有真实 Cocos Web 构建预览模式，不以模拟页面冒充游戏。

- [ ] 完成 Creator 导入和 TypeScript 检查：使用 Creator 3.8.5 自带 `typescript/bin/tsc --noEmit -p tsconfig.json`；将已有错误与本次引入错误区分记录，不能把失败检查写成通过。
- [ ] 从新鲜 Web 构建启动预览，实际触摸完成至少连续 10 弯并看到加速和换景；验证长帧、暂停/后台、撞车、重玩及模拟广告取消/成功。使用调试入口补测极端状态时明确记录，并保留正常输入流程证据。
- [ ] 在 750×1334、750×1624 验证背景满屏、HUD 不遮路、按钮底部 80 单位、复活按钮隐藏后重排和遮罩阻断输入。长跑至少覆盖 80 弯，记录节点/粒子/音源数量及主题循环。
- [ ] 实际听检全部新增声音、静音、广告暂停和场景退出；检查烟雾清理、镜头归位、复活安全位置。无法听检时写“未验证”，不能以文件存在代替。
- [ ] 重生成场景并运行全部 drift 测试、共有结算测试、相关推荐流回归；检查差异无非本任务文件覆盖。
- [ ] 记录检查命令、结果、截图路径与剩余平台限制；仅提交相关修复和报告。交付可试玩入口，明确真实 Content_ID 尚缺时正式推荐流未启用，广告真机结果不得由离线模拟代替。

## 自检与执行建议

六个任务覆盖方案全部章节：任务 1 负责核心玩法与阶段规则，任务 2 负责视觉和生成，任务 3 负责状态与广告，任务 4 负责用户追加的音效/爆炸，任务 5 负责接入，任务 6 负责真实验证。Review Focus 的五类边界均已分配到测试任务。

建议在当前聊天由同一执行者逐项实施，完成后做独立审查：运动、赛道和表现接口关联紧密，连续处理有利于保持手感一致，且减少重复读取大型源控制器。执行前检查隔离需求和当前未提交更改；不得用重置工作区的方式获得干净状态。
