# 空投救援推荐流玩法 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 Cocos Creator 3.8.5 项目中新增一个接近参考视频的“空投救援”推荐流玩法，并接入主界面、推荐流路由、广告、音乐和统一结算。

**Architecture:** 采用混合方案。固定 UI 序列化在独立场景中，直升机、蔬菜和下落对象由纯 TypeScript 规则层加运行时对象池驱动。推荐流和广告沿用现有 `FeedAcquisitionService`、`ADController`、`SdkUtils` 与 `feed_result_layout.mjs`。

**Tech Stack:** Cocos Creator 3.8.5、TypeScript、Node.js 场景 authoring 脚本、Node `assert` 测试。

**Spec:** `docs/superpowers/specs/2026-11-24-airdrop-rescue-feed-design.md`

## Global Constraints

- 规则为本关不限时、食物 `0/5`、机会 `25/25`，实际游玩时长只用于难度提升。
- 接满 5 份食物成功，机会归零失败。
- 未点击直升机飞出屏幕直接回收，已释放蔬菜落空才扣机会。
- 失败后可无限次看激励视频复活，保留食物并恢复 5 次机会。
- 底部仅保留“减速”广告按钮，默认 20 秒内所有直升机速度降低 50%，场景组件可调整时长。
- 推荐流 ID 只保留 `xx` 源码占位，未知或占位值不正式路由。
- 结算使用全屏黑色 145/255 遮罩和共享结果布局，不使用弹窗卡片。
- 不修改拼豆 `GameScene`，不执行 Cocos 构建。

## Review Focus

- 多架直升机和多颗蔬菜同帧运行，验证对象池不会复用仍在下落的对象。测试归属 Task 1。
- 瓶口边界和跨屏下落判定，验证同一帧只结算一次。测试归属 Task 1。
- 首次触摸激活、暂停/广告回调和无限复活，验证不重复扣机会或重复发奖。测试归属 Task 3。
- `xx` 或未知 Content_ID，验证不会误路由到新场景。测试归属 Task 4。
- 750×1334 与 750×1624 的结果遮罩、按钮底边距和主界面卡片布局。测试归属 Task 5。

## 2026-11-25 本轮：不限时、减速与随机加速

本轮沿用用户已授权的玩法修改，在当前工作区就地更新，不执行以下历史任务中的构建、测试或提交步骤；用户自行构建试玩。20 秒减速、速度降低 50% 已由用户确认；加速概率、倍率与难度曲线为实现默认值。

- [x] 在 `airdropRescueRules.ts` 删除倒计时和加时/加机会接口，新增 `elapsedSeconds`、`slowRemaining` 和 `slowDown(seconds = 20)`；失败仅由机会耗尽触发。
- [x] 飞机分别保存巡航速度、随机加速位置/倍率和提速进度，统一计算当前速度；预览不提升难度，剪下蔬菜后不再施加飞行调速。
- [x] 控制器只绑定减速与复活奖励，新增可编辑 `slowdownSeconds`；效果期间禁用减速按钮，结束后恢复。
- [x] Authoring 删除 Timer 与旧按钮，复用已有减速贴图及广告标识，居中且底部留出 108 设计单位；只重新生成空投场景。
- [x] 同步旧检查脚本中已经改变的时间/按钮约定，不运行游戏测试；静态核对 TypeScript 语法、序列化引用和差异。

静态核对结果：两份 TypeScript 文件均无语法诊断；authoring 与现有检查脚本语法有效；场景无悬空引用或过期组件字段；只保留一个减速按钮，底边距 108；剪绳、接取、落空音效引用均保持一致。未执行游戏测试或 Cocos 构建。

---

### Task 1: 空投规则层

**Files:**
- Create: `assets/scripts/airdropRescueRules.ts`
- Test: `tools/test_airdrop_rescue_rules.cjs`

**Interfaces:**
- Produces `AirdropRescueRound`, `AirdropTarget`, `AirdropTargetState`, `AirdropEvent`。
- `start(): void`、`step(deltaSeconds: number): void`、`releaseTarget(id: number): boolean`、`revive(): boolean`、`slowDown(seconds?: number): boolean`、`completeLevel(): void`、`getSnapshot(): AirdropSnapshot`。

- [ ] **Step 1: Write the failing rule tests**
  - 断言初始 `elapsedSeconds=0`、`food=0`、`chances=25`。
  - 断言释放对象保留水平速度并进入下落状态。
  - 断言瓶口命中只加一份食物，越底只扣一次机会。
  - 断言未释放目标离屏不扣机会，多目标可并存。
  - 断言食物达到 5 为 success、机会归零为 failure，游玩时长本身不会结束本局。
  - 断言无限次 `revive()` 保留 food，并把 chances 恢复为 5。
- [ ] **Step 2: Run `node tools/test_airdrop_rescue_rules.cjs` and verify it fails**
- [ ] **Step 3: Implement fixed-step state transitions in `airdropRescueRules.ts`**
  - 使用固定步长累计时间，目标由 `spawnAt`, `x`, `y`, `vx`, `vy`, `state` 描述。
  - 生成点在左右屏外，按阶段随机生成 1～2 架，部分飞机途中突然加速，释放后蔬菜保留当时惯性。
  - 同帧事件顺序固定为释放、移动、瓶口命中、越底回收与终局。
- [ ] **Step 4: Run the rule tests and verify PASS**
- [ ] **Step 5: Commit `feat: add airdrop rescue rules`**

### Task 2: 资源与序列化场景

**Files:**
- Create: `assets/res/airdropRescueFeed/` 下的直升机、蔬菜、玻璃瓶、小猪、背景补充素材和音效及 `.meta`。
- Create: `assets/gamescene/AirdropRescueFeedGameScene.scene`、`.scene.meta`。
- Create: `assets/scripts/airdropRescueFeedGameScene.ts.meta`。
- Create: `tools/airdrop_rescue_authoring.mjs`、`tools/build_airdrop_rescue_scene.mjs`。
- Modify: `tools/feed_result_layout.mjs`、`tools/feed_screen_layout.mjs`。
- Test: `tools/test_airdrop_rescue_scene.cjs`。

**Interfaces:**
- Scene controller exposes serialized nodes for `backButton`, `titleLabel`, `foodLabel`, `chanceLabel`, `bottle`, `targetPool`, `slowdownButton`, `hud`, `resultOverlay`。
- Authoring exports `buildAirdropRescueScene()`, `appendAirdropRescueCard()`, `SCENE_UUID`, `uuid()`。

- [ ] **Step 1: Write scene contract tests**
  - 检查脚本绑定、无悬空引用、固定对象池大小至少支持 3 架直升机和 8 颗下落蔬菜。
  - 检查结果遮罩含 `BlockInputEvents`、透明度 145、HUD 映射和底部按钮至少保留 80 设计单位。
  - 检查 authoring 生成结果与磁盘 scene 一致且幂等。
- [ ] **Step 2: Run `node tools/test_airdrop_rescue_scene.cjs` and verify it fails**
- [ ] **Step 3: Add lightweight transparent art and author the scene**
  - 固定 UI 只放在 scene 和 authoring 中，运行时不创建固定文案节点。
  - 使用共享标题、返回按钮、广告标识、背景音乐入口和结果布局。
  - 将 `fitFeedResultOverlay` 与 `feed_screen_layout` 的新场景名称纳入维护列表。
- [ ] **Step 4: Run scene tests and verify PASS**
- [ ] **Step 5: Commit `feat: author airdrop rescue scene`**

### Task 3: 玩法控制器与广告音频生命周期

**Files:**
- Create: `assets/scripts/airdropRescueFeedGameScene.ts`
- Create: `tools/test_airdrop_rescue_controller.cjs`
- Modify: `assets/scripts/framework/Platform/sdk/SdkUtils.ts`、`assets/scripts/framework/Platform/ADController.ts`（仅在现有映射需要新场景名时）。

**Interfaces:**
- `airdropRescueFeedGameScene` consumes `AirdropRescueRound` and serialized node pools.
- Produces `startRound()`, `onTargetPressed()`, `showHint()`, `rewardAction(kind)`, `revive()`, `requestExit()`, `replay()`, `home()`。

- [ ] **Step 1: Write controller tests**
  - 验证 FeedAcquisition stable render、首次触摸激活、返回/退出清理监听。
  - 验证插屏回调不暂停规则层，激励广告成功后才发放奖励。
  - 验证无限复活可重复恢复 5 次机会，广告失败不改变状态。
  - 验证 BGM 只由共享音乐入口控制，场景不重复播放。
- [ ] **Step 2: Run `node tools/test_airdrop_rescue_controller.cjs` and verify it fails**
- [ ] **Step 3: Implement the controller**
  - 用对象池把规则目标同步到直升机/蔬菜节点，使用场景坐标映射和固定瓶口判定区。
  - 将减速和复活接到 `SdkUtils.showRewardedVideo()`，激励视频保留现有暂停保护；插屏不主动暂停游戏。
  - 用 `ADController.onEnter`, `scheduleFeedEntryInterstitial`, `cancelFeedEntryInterstitial`, `onLevelResult` 接入统一插屏流程。
  - 按现有场景模式在 `onDestroy` 成对解绑 game/input/feed 监听并停止音效。
- [ ] **Step 4: Run controller tests and verify PASS**
- [ ] **Step 5: Commit `feat: implement airdrop rescue controller`**

### Task 4: 场景注册、推荐流路由和主界面卡片

**Files:**
- Modify: `assets/scripts/framework/GameSceneBundle.ts`
- Modify: `assets/scripts/framework/Platform/FeedRevisitConfig.ts`
- Modify: `assets/scripts/loadScene.ts`
- Modify: `assets/scripts/newMainScene.ts`
- Modify: `tools/build_new_main_scene.mjs`
- Modify: `assets/gamescene/NewMainScene.scene`
- Modify: `assets/scripts/framework/Platform/sdk/SdkUtils.ts`
- Test: `tools/test_airdrop_rescue_integration.cjs`

**Interfaces:**
- Adds `GameSceneName.AirdropRescueFeedGame` and UUID fallback.
- Adds `FEED_AIRDROP_RESCUE_CONTENT_ID = "xx"` with a guard that excludes `xx` and empty strings from formal route matching.
- Adds `appendAirdropRescueCard()` and `newMainScene` button binding.

- [ ] **Step 1: Write routing/integration tests**
  - 真实 ID placeholder `xx` 和 unknown 都回 `NewMainScene`，主界面卡片仍能打开新场景。
  - 检查 bundle UUID、scene meta、script meta、SDK 场景标题和 authoring 调用。
- [ ] **Step 2: Run `node tools/test_airdrop_rescue_integration.cjs` and verify it fails**
- [ ] **Step 3: Register the scene, route guard, main card, and attribution title**
- [ ] **Step 4: Run integration tests and verify PASS**
- [ ] **Step 5: Commit `feat: register airdrop rescue feed entry`**

### Task 5: 端到端布局、资源和回归验证

**Files:**
- Modify: `tools/test_feed_integration.cjs`、`tools/test_feed_result_layout.cjs`、`tools/test_new_main_scene.cjs`（只追加新场景断言）。
- Create: `tools/test_airdrop_rescue_feed.cjs`。

**Interfaces:**
- Exercises Tasks 1–4 through Node-side Cocos stubs and serialized scene checks.

- [ ] **Step 1: Add end-to-end assertions**
  - 运行 750×1334、750×1624 两个布局尺寸，验证 HUD、结果遮罩、底部按钮和主界面卡片。
  - 验证场景资源、脚本、scene 和新增媒体输入总大小记录，允许超过 1 MB但输出实际大小。
  - 验证推荐流未知 ID 回大厅、真实 ID映射入口可在配置替换后工作。
- [ ] **Step 2: Run focused tests**
  - `node tools/test_airdrop_rescue_rules.cjs`
  - `node tools/test_airdrop_rescue_scene.cjs`
  - `node tools/test_airdrop_rescue_controller.cjs`
  - `node tools/test_airdrop_rescue_integration.cjs`
  - `node tools/test_airdrop_rescue_feed.cjs`
- [ ] **Step 3: Run shared regression tests**
  - `node tools/test_feed_result_layout.cjs`
  - `node tools/test_feed_screen_layout.cjs`
  - `node tools/test_new_main_scene.cjs`
  - `node tools/test_feed_audio.cjs`
- [ ] **Step 4: Review `git diff --stat` and `git status --short`**
- [ ] **Step 5: Commit `test: verify airdrop rescue feed integration`**
