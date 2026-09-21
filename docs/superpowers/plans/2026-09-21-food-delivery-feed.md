# 外卖精准投送 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 制作不含幸运宝箱的外卖精准投送首版，复刻参考视频的画面和点击投送玩法，支持新主页和抖音推荐流入口。

**Architecture:** 新增独立场景与纯 TypeScript 规则模型；静态节点、素材、碰撞区和文字序列化到场景，控制器只处理输入、状态和表现。主页、路由、广告复用项目现有机制，维护既有旧玩法清理工作，不重建或恢复旧主页。

**Tech Stack:** Cocos Creator 3.8.5、TypeScript、Node.js 离线测试/场景编制、内置图像生成与编辑、ffmpeg、现有 sharp、Playwright + Chrome。

**Spec:** [已批准设计](../specs/2026-09-21-food-delivery-feed-design.md)

## Global Constraints

- 背景图片为 **750×1624 的 JPG**。
- 不复刻幸运宝箱；也不制作视频中的平台引导弹窗、系统胶囊或手机系统界面。
- 五份食物全部送对才通关；误投掉落、砸到保安则失败。
- 固定界面放进 scene，位置、尺寸、文字和图标可在编辑器中调整。
- 手臂首版旋转周期 0.75 秒，即 480°/秒；不自动修正点击角度。
- 一次只有一份在飞行中；飞行超过 4 秒后失败；重新开始复用顺序，下一关重排顺序。
- `FEED_FOOD_DELIVERY_CONTENT_ID` 未配置时为空字符串，路由非空检查必不可少，不借用既有 Content ID。
- 插屏复用 `ADController`，不加独立计时器、触摸遮罩或引擎暂停；事件名称 `interAdType` / `adType`，`feedType` 为“外卖精准投送”。
- 不恢复旧 `MainScene`、奶茶、笔芯，也不改其他玩法的难度、素材或广告间隔。
- 用 `apply_patch` 编辑源码/文本；生成与压缩工具只写其明确声明的输出。提交前检查每个路径，不能将用户原有修改一起提交。
- 执行前使用 `using-git-worktrees` 评估隔离方式。当前未提交的新主页和旧玩法清理是集成基线；如果创建隔离工作树，须完整保留这些工作状态，不能从旧 HEAD 丢失它们。不得自行丢弃或重置。

## Review Focus

1. 原生触摸与 Cocos 触摸重复到达：同一次点击只能投一次，按钮点击不能穿透成投掷（Task 3）。
2. 低帧率穿过目标边界：按扫掠交点排序判定，30/60 FPS 下五个订单都可命中（Task 1）。
3. 编辑器改过支点、图标和位置：视觉与命中区保持一致，控制器不得重设固定样式（Task 2、3）。
4. 推荐流进入事件丢失或后台恢复：预览不消耗订单，首次真实触摸能恢复，后台不推进物理（Task 3）。
5. 新场景未导入/未配置 ID/返回失败：正常主页可重试，空 ID 不抢占旧路由，迟到广告不落入其他场景（Task 4、5）。

## 文件与依赖

项目根目录：`/Users/skyhand/Dev/Source/cocos/GemGame`。本计划命令均在该目录运行。

| 文件 | 职责 |
| --- | --- |
| `assets/scripts/foodDeliveryRules.ts` + `.meta` | 订单、飞行和碰撞纯逻辑 |
| `assets/scripts/foodDeliveryFeedGameScene.ts` + `.meta` | 场景控制、输入、表现与宿主生命周期 |
| `assets/gamescene/FoodDeliveryFeedGameScene.scene` + `.meta` | 全部编辑器节点和参数 |
| `assets/res/foodDeliveryFeed/` + 目录 `.meta` | 最终发布素材，不含生成大图 |
| `tools/food_delivery_authoring.mjs` | 稳定 UUID、素材清单、场景构造与主页追加函数 |
| `tools/build_food_delivery_assets.mjs` | 显式源目录输入，缩放/压缩/导入元数据输出 |
| `tools/build_food_delivery_scene.mjs` | 只编制新场景，支持临时目录输出验证 |
| `tools/test_food_delivery_rules.cjs` | 规则和轨迹测试 |
| `tools/test_food_delivery_scene.cjs` | 资源、节点、引用、尺寸、参数可达性测试 |
| `tools/test_food_delivery_controller.cjs` | 输入/宿主/音频/销毁行为模拟 |
| `tools/test_food_delivery_integration.cjs` | 新主页、Content ID 和广告归因 |
| `tools/preview_food_delivery_feed.cjs` | 新鲜构建中的真实渲染和触摸验证 |
| `marketing/feed/food-delivery-prompts.md` | 素材来源、生成说明、参考帧和导出尺寸 |
| `docs/superpowers/reports/2026-09-21-food-delivery-feed.md` | 验收结果、截图路径和真机待验项 |

复用 `tools/penguin_scene_authoring.mjs` 的 `SceneAuthor` / `compressUuid` / `ref` / `vec` / `rgba`，以及 `tools/feed_result_layout.mjs` 的 `appendSceneGlobals`。不要复制旧玩法中大量无关 UI 或奖励代码。

---

### Task 1: 可重复验证的订单与抛投模型

**Files:** Create `assets/scripts/foodDeliveryRules.ts`, `.meta`, `tools/test_food_delivery_rules.cjs`.

**Interfaces:** 输入使用新场景 `GameplayRoot` 局部坐标，Y 向上，所有角度为度。模型不导入 `cc`。

```ts
export type FoodKind = 'lime' | 'icecream' | 'cake' | 'burger' | 'cola';
export const FOOD_KINDS: readonly FoodKind[] = ['lime', 'icecream', 'cake', 'burger', 'cola'];
export interface Point { x: number; y: number; }
export interface Rect { x: number; y: number; width: number; height: number; }
export interface DeliveryTarget extends Rect { food: FoodKind; }
export interface DeliveryWorld {
  targets: DeliveryTarget[]; guard: Rect; wall: Rect; bounds: Rect; groundY: number;
}
export interface DeliveryTuning {
  speed: number; gravity: number; radius: number; maxFlightSeconds: number;
}
export interface Projectile extends Point {
  vx: number; vy: number; age: number; food: FoodKind; deflected: boolean;
}
export type DeliveryEvent =
  | { type: 'delivered'; food: FoodKind; score: number }
  | { type: 'deflected' }
  | { type: 'failed'; reason: 'guard' | 'ground' | 'outside' | 'timeout' }
  | { type: 'won' };
export type DeliveryPhase = 'aiming' | 'flying' | 'delivered' | 'failed' | 'won';
export function segmentRectHit(from: Point, to: Point, rect: Rect, radius?: number): number | null;
export function shuffledFoods(random?: () => number): FoodKind[];
// FoodDeliveryRound 的公开合同：
// constructor(world: DeliveryWorld, tuning: DeliveryTuning, order?: readonly FoodKind[])
// readonly getters: phase: DeliveryPhase, score: number, currentFood: FoodKind | null,
// order: readonly FoodKind[], completed: ReadonlySet<FoodKind>, projectile: Projectile | null
// shoot(angleDegrees: number, origin: Point): boolean
// tick(deltaSeconds: number): DeliveryEvent[]
// advanceOrder(): void
// reset(reuseOrder?: boolean, random?: () => number): void
```

- [ ] **Step 1: 写最小失败测试并运行。** 用项目现有 TypeScript 包转译纯模型后在 VM 中加载；断言没有模块时失败，不能在测试中重新实现被测模型。

```js
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
const output = {};
const code = ts.transpileModule(fs.readFileSync('assets/scripts/foodDeliveryRules.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
vm.runInNewContext(code, { exports: output });
const { FoodDeliveryRound, segmentRectHit, shuffledFoods } = output;
assert.equal(new Set(shuffledFoods(() => 0.5)).size, 5);
assert.equal(segmentRectHit({x: 0, y: 10}, {x: 1000, y: 10},
  {x: 100, y: 0, width: 10, height: 20}, 0), 0.1);
```

Run: `node tools/test_food_delivery_rules.cjs`。初次预期因新模块不存在而失败。

- [ ] **Step 2: 实现扫掠检测和校验。** 对每个轴用下面算法更新进入/退出参数；零长度轴在范围外立即返回 null。矩形先按食物半径扩展。输入必须有限，宽高/速度/重力/超时必须正数；订单必须恰好包含五种不同食物，非法配置抛出带字段名的错误。

```ts
let enter = 0, exit = 1;
for (const axis of ['x', 'y'] as const) {
  const delta = to[axis] - from[axis];
  const min = rect[axis] - radius;
  const max = rect[axis] + (axis === 'x' ? rect.width : rect.height) + radius;
  if (Math.abs(delta) < 1e-9) {
    if (from[axis] < min || from[axis] > max) return null;
  } else {
    const a = (min - from[axis]) / delta, b = (max - from[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (enter > exit) return null;
  }
}
return enter;
```

- [ ] **Step 3: 实现状态推进。** `shoot` 只在 aiming 接受，记录当前食物、初始位置和 `speed * cos/sin(angle)`，清空积累时间。`tick` 用 1/240 秒固定子步推进；非法或非正 delta 忽略，单次可消费最多 0.25 秒且后台由控制器停止调用。每个子步使用以下积分，按最早扫掠交点处理目标/保安/墙/地面/边界。

```ts
const h = 1 / 240;
const next = {
  x: projectile.x + projectile.vx * h,
  y: projectile.y + projectile.vy * h - 0.5 * tuning.gravity * h * h,
};
projectile.vy -= tuning.gravity * h;
projectile.age += h;
```

正确且未完成的订单只发出一次 delivered；第五份同时发出 won。正确交点与墙交点相同则订单优先。错误目标/墙第一次碰撞标记 `deflected=true`，将 vx 变成 `-Math.abs(vx) * 0.2`、vy 限制为非正；之后不再计分或重复弹墙，最终触地/保安/越界/4秒时发出一次 failed。`advanceOrder()` 仅把 delivered 切回 aiming；重开清空 completed、弹体、积分余量和终态。

- [ ] **Step 4: 扩展测试并验证红绿循环。** 以下夹具提供可达的五楼层世界；在 0～180°以 0.25°步进搜索每种首单的有效角度。每次搜索用独立模型，不能继承上次失败；若找不到角度，测试失败，不放宽订单到整层。

```js
const kinds = ['lime', 'icecream', 'cake', 'burger', 'cola'];
const world = {
  targets: kinds.map((food, i) => ({food, x: 153, y: 366 - i * 120, width: 72, height: 68})),
  guard: {x: 100, y: -340, width: 82, height: 156},
  wall: {x: 260, y: -350, width: 115, height: 1150},
  bounds: {x: -375, y: -812, width: 750, height: 1624}, groundY: -350,
};
const tuning = {speed: 1750, gravity: 1600, radius: 8, maxFlightSeconds: 4};
function simulate(food, angle, fps) {
  const model = new FoodDeliveryRound(world, tuning, [food, ...kinds.filter(x => x !== food)]);
  assert.equal(model.shoot(angle, {x: -210, y: -230}), true);
  assert.equal(model.shoot(angle, {x: -210, y: -230}), false);
  for (let n = 0; n < fps * 5 && model.phase === 'flying'; n++) model.tick(1 / fps);
  return model;
}
for (const food of kinds) {
  let goodAngle = null;
  for (let angle = 0; angle <= 180; angle += 0.25) {
    if (simulate(food, angle, 60).score === 1) { goodAngle = angle; break; }
  }
  assert.notEqual(goodAngle, null, food + ' must be reachable');
  assert.equal(simulate(food, goodAngle, 30).score, 1);
}
```

补充：五次真实命中后 won 只发一次；误投后不得计分；横向高速跨越保安失败；落地/越界/超时均结束；reset(true) 顺序相同、reset(false, rng) 仍是五种；NaN/Infinity/重复 food 配置拒绝。运行 `node tools/test_food_delivery_rules.cjs` 全绿。

- [ ] **Step 5: 检查并只提交该任务新文件。** `git add -- assets/scripts/foodDeliveryRules.ts assets/scripts/foodDeliveryRules.ts.meta tools/test_food_delivery_rules.cjs`，检查 `git diff --cached --stat` 后仅提交这些路径，message 为 `feat: add food delivery round rules`。

### Task 2: 分层素材与可编辑场景

**Files:** Create 素材目录、`tools/food_delivery_authoring.mjs`、两个 build 工具、`tools/test_food_delivery_scene.cjs`、素材说明。此任务交付素材与内存中的场景编制结果；正式 scene 与控制器在 Task 3 一起写入，避免编辑器提前导入缺少脚本的场景。

**Interfaces:** `food_delivery_authoring.mjs` 导出 `assetUuid(name: string): string`、`frameUuid(name: string): string`、`buildFoodDeliveryScene(): object[]`、`appendFoodDeliveryCard(objects: object[]): number`。最后一个函数在 Task 4 实现并返回主页 Button 的数组索引。

- [ ] **Step 1: 先写场景/资源失败断言。** 编制模块不存在时测试失败；随后验证 JPG 元数据而非仅文件名，以及编辑器引用和 collision 节点数量。测试先检查编制函数返回的 scene；Task 3 再追加磁盘 scene 与结果完全一致的断言。

```js
const fs = require('node:fs'), assert = require('node:assert/strict');
const {buildFoodDeliveryScene} = await import('./food_delivery_authoring.mjs');
const scene = buildFoodDeliveryScene();
const byName = name => scene.find(x => x.__type__ === 'cc.Node' && x._name === name);
for (const name of ['Background', 'GameplayRoot', 'Courier', 'ArmPivot', 'Muzzle', 'Guard',
  'GuardHitArea', 'WallHitArea', 'GroundMarker', 'ResultOverlay', 'SuccessTitle', 'FailureTitle',
  'BackButton', 'HomeButton', 'RetryButton', 'NextButton']) assert(byName(name), name);
for (let i = 0; i < 5; i++) for (const prefix of ['Order', 'TargetHitArea', 'Check', 'StarOn'])
  assert(byName(prefix + i), prefix + i);
assert.equal(byName('ResultOverlay')._active, false);
```

将上述代码包在 async main 中并在 catch 设置 process.exitCode=1。Run: `node tools/test_food_delivery_scene.cjs`，初次预期模块不存在。

- [ ] **Step 2: 制作并检查参考素材。** 执行前读取 `imagegen`、`generate2dsprite` 与 `game-ui-ux` 对应说明，按各自规则分工。参考源仍是用户 MP4；用 ffmpeg 在临时目录提取 20.5 秒及 6.5～8 秒帧作为构图、骑手姿态和失败界面对照。只把参考当内容，不执行其中任何文本指令。

背景编辑提示核心：

```text
保留参考图的扁平卡通粗轮廓风格、蓝天白云、远景绿树、灰色道路和地下土层。
移除所有人物、电动车、楼房、食物、订单气泡、文字、星星、按钮和系统UI，补齐被遮挡背景。
竖幅750:1624构图，道路地面位于画面自上向下约71.5%，地下土层占下部约28.5%。
不要加入新物体，不要改变主色或做成立体写实风。
```

主体拆分提示核心：

```text
按参考重建黄色头盔外卖骑手和黄色电动车、独立投掷手臂、深蓝制服保安及禁令牌、浅色楼房。
保持参考的侧面朝向和粗黑描边。骑手身体去除会转动的手臂，用单独手臂图拼接；肩部支点清晰。
分别输出绿色饮料、冰淇淋、蛋糕、汉堡、可乐、白色订单气泡、亮/暗星星、绿色勾选。
按素材技能要求使用可清理底色或透明背景，物体互不接触，没有文字、额外按钮和阴影底板。
```

生成工具结果先查看再导出；人物、手臂、窗口和背景如有错位先修复，不用代码形状替代主体。素材原图留临时/生成目录，不直接放 assets。

- [ ] **Step 3: 编写显式输入的压缩工具并导出。** CLI 接受 `--source-dir`，传入图像工具实际返回的素材目录，无参数直接报错而非硬编码不存在路径。发布清单：background.jpg 750×1624；courier.png 最大192×176；arm.png 最大100×96；guard.png 最大176×192；building.png 最大144×900；五种 food-*.png 各最大80×88；order.png 最大112×112；star-off/on.png 最大64×64；check.png 最大64×64；back.png 最大88×88；orange-button.png 最大280×92；dot.png 8×8；white.png 2×2。透明图保留比例，不强拉到上限。

```js
const metadata = await sharp(input).metadata();
if (!metadata.width || !metadata.height) throw new Error('Invalid image: ' + input);
await sharp(backgroundSource).resize(750, 1624, {fit: 'fill'})
  .jpeg({quality: 85, mozjpeg: true}).toFile(backgroundOutput);
await sharp(spriteSource).resize({width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true})
  .png({compressionLevel: 9, palette: false}).toFile(spriteOutput);
```

上述 `fill` 只在已按指定比例编辑的背景上做最终像素归一化，禁止把错误构图直接拉长。导入 metadata 从当前项目一个匹配 JPG/PNG 模板复制 schema，再填真实 UUID、尺寸、trim、vertices 与 redirect；UUID 用字符串 `'GemGame/foodDeliveryFeed/' + name` 的固定哈希生成并复用，不能每次运行变化。已有元数据保留 UUID。输出素材报告含 bytes、width、height 和 width×height×4，不把 JPG 文件大小当运行内存。

- [ ] **Step 4: 编制新场景。** `buildFoodDeliveryScene()` 用现有 SceneAuthor 和 `ArcheryGameScene.scene` 的 Camera/Globals 模板；不要将其他玩法脚本或按钮一起复制。生成根 Scene/Canvas/Camera 后，用以下定位初值，所有目标/碰撞数据由场景节点读取。

```js
const gameplay = a.node('GameplayRoot', canvas, {w: 750, h: 1624});
const armPivot = a.node('ArmPivot', gameplay, {x: -230, y: -245, w: 1, h: 1});
const muzzle = a.node('Muzzle', armPivot, {x: 40, y: 0, w: 1, h: 1});
for (let i = 0; i < 5; i++) {
  a.sprite('Order' + i, gameplay, frameUuid('order.png'), {x: 189, y: 400 - i * 120, w: 104, h: 108});
  a.node('TargetHitArea' + i, gameplay, {x: 189, y: 400 - i * 120, w: 72, h: 68});
}
```

场景初值 speed=1750、gravity=1600、radius=8、maxFlightSeconds=4、rotationSpeed=480。准星方向点预置为12个小 Sprite；待投和飞行显示各五个预置食物节点，通过显隐选图，不重写 SpriteFrame。碰撞区不挂可见 Sprite。背景铺底与核心区分开；依据可用屏幕将核心区整体等比适配，缓存 authored transform，绝不逐个改写美术配置。

结算的遮罩/标题/三按钮固定在场景，默认 inactive，遮罩只在结算打开时拦截玩法触摸。按钮间距一致，文案直接写在 scene。公共标题初值“外卖精准投送”，失败初值“差点就成功了，重新试试吧”，成功初值“投送成功”。

工具支持 `--output-dir` 写临时文件供验证，正式 scene 在 Task 3 中由 apply_patch 应用；绝不运行整个主页生成器覆盖当前用户布局。

- [ ] **Step 5: 完成资源/布局验证并提交新文件。** 用 sharp.metadata 断言 JPG 为750×1624；递归验证返回数组的所有 `__id__`、素材 `.meta` UUID、五个订单/Check/StarOn、三结算按钮。控制器所需属性以 Task 3 清单绑定，使用稳定预留的控制器 UUID；控制器文件存在性在 Task 3 导入后再验证。从序列化碰撞节点形成 world，再复用 Task 1 角度搜索，检查所有目标可达。记录素材体积后只提交本任务新增路径，message `feat: author food delivery artwork and scene`。

### Task 3: 场景控制器、触摸与推荐流生命周期

**Files:** Create `assets/scripts/foodDeliveryFeedGameScene.ts`, `.meta`, `tools/test_food_delivery_controller.cjs`、`assets/gamescene/FoodDeliveryFeedGameScene.scene` 及 `.meta`；应用并绑定 Task 2 新场景，扩充 `tools/test_food_delivery_scene.cjs` 的实际文件验证。

**Interfaces:** 控制器类名 `foodDeliveryFeedGameScene`。消费 Task 1 模型。属性：`background`, `gameplayRoot`, `courier`, `armPivot`, `muzzle`, `guard`, `guardHitArea`, `wallHitArea`, `groundMarker`, `resultOverlay`, `successTitle`, `failureTitle` 均为 Node；`targets`, `orderSprites`, `checks`, `stars`, `pendingFoods`, `flyingFoods`, `aimDots` 为 Node[]；`backButton`, `homeButton`, `retryButton`, `nextButton` 为 Button；五个数值属性为 rotationSpeed/speed/gravity/radius/maxFlightSeconds。`round` 持有模型。内部初值 disposed/leaving/appHidden/feedExited/interstitialScheduled=false、roundSerial=0、lastAcceptedTouchMs=-Infinity；按回调更新，不把宿主状态存到跨局永久锁。

控制器内部方法合同：`onTouchStart(event: EventTouch): void`、`onNativeTouchStart(event: {touches?: Array<{identifier?: number; clientX: number; clientY: number}>}): void`、`tryThrow(isButton: boolean, nowMs: number): boolean`、`onFeedState(state: FeedAcquisitionState): void`、`onHide(): void`、`onShow(): void`、`resetRound(reuseOrder: boolean): void`、`returnHome(): Promise<void>`、`refreshVisuals(): void`、`validateBindings(): void`。

- [ ] **Step 1: 建立 VM 控制器夹具和失败测试。** 复用当前 `tools/test_feed_integration.cjs` 的 Cocos/Feed/SDK 模拟思路，不调用真实 SDK。Node 保存原始 position/scale/子节点，Button 保存 on/off；将 SpriteFrame、Label.string 等固定样式设为只读以捕获覆盖。加载实际 TypeScript 后设置 scene 绑定，不测试一份复制逻辑。

```js
// 夹具 setup 返回实际控制器实例和可记录的宿主桩。
const f = fixture({feed: {active: true, entered: false, exited: false}});
f.game.onLoad(); f.game.start();
const order = [...f.game.round.order];
for (let i = 0; i < 300; i++) f.game.update(1 / 60);
assert.equal(f.game.round.score, 0);
assert.equal(f.game.round.phase, 'aiming');
assert.deepEqual([...f.game.round.order], order);
assert.equal(f.ads.length, 0);
assert.equal(f.audio.length, 0);
assert.equal(f.game.tryThrow(false, 1000), true);
assert.equal(f.game.tryThrow(false, 1001), false);
assert.equal(f.game.round.phase, 'flying');
```

`fixture(options)` 在测试文件中定义：创建上述 cc 对象、FeedAcquisitionService 状态桩、AudioManager 调用数组 `audio`、adc 调用数组 `ads`，转译真实控制器/规则并返回 `{game, feed, audio, ads, clock}`；`feed` 提供 emit(state)，`clock` 提供 nowMs。缺少模块时先运行失败：`node tools/test_food_delivery_controller.cjs`。

- [ ] **Step 2: 绑定场景而非搭UI。** 导入 FeedAcquisitionService、adc、SdkUtils、EnvTool、AudioManager、GameSceneBundle、soundName。onLoad 校验全部引用和数组数量，保存编辑器姿态，将目标/保安/墙区域用 UITransform 的世界角点转换回 GameplayRoot 局部坐标构建 world；监听 Button、input TOUCH_START、game SHOW/HIDE。只在 ByteDance API 支持时绑定同一个原生 onTouchStart handler。

```ts
@property({tooltip: '手臂每秒旋转角度'}) rotationSpeed = 480;
@property(Node) armPivot: Node = null;
@property([Node]) targets: Node[] = [];
@property(Button) retryButton: Button = null;
// 上方 Interfaces 的其他属性逐一使用对应 @property 类型，scene 使用完全相同字段名。
```

`tryThrow` 按顺序拒绝 disposed/leaving/appHidden/resultOverlay.active/激励忙/按钮触摸；有效游戏触摸才调用 `activateFromFirstTouch()`，并检查返回的 entered/exited。使用上一接受触摸时间 80ms 防原生/引擎重复，随后用模型 `shoot` 的 flying 状态做第二道去重。投射方向从 Muzzle 与肩点的世界向量转换到 GameplayRoot，保持编辑器局部旋转偏移。

```ts
if (isButton || this.disposed || this.leaving || this.appHidden || this.resultOverlay.active ||
    SdkUtils.isRewardedVideoBusy()) return false;
if (FeedAcquisitionService.isActive()) FeedAcquisitionService.activateFromFirstTouch();
const state = FeedAcquisitionService.getState();
if (state.active && (!state.entered || state.exited)) return false;
if (nowMs - this.lastAcceptedTouchMs < 80) return false;
// 在同一 GameplayRoot 坐标系取得 origin 和方向后调用 round.shoot，只有 true 才更新时间戳。
```

原生触摸使用 client 坐标变换到 Canvas 碰撞坐标后排除 Button 的 UITransform hitTest；Cocos 路径使用 event.getLocation()/windowId。不能仅检查事件 target，因为原生没有相同节点树。

- [ ] **Step 3: 实现局内表现及清理。** aiming 时依据 deltaTime 旋转，飞行时暂停手臂以显示投出动作；模型 tick 返回事件后显示命中缩小/勾选/亮星、错误挡落与失败。delivered 等待0.22秒再 advanceOrder；won/failed 延迟0.3秒显示对应结算。重开清空延迟和局序号，过期回调不触碰新局。

```ts
// 刷新只切预置图的显隐；不赋值 spriteFrame 或固定 Label.string。
this.pendingFoods.forEach((node, i) => { node.active = FOOD_KINDS[i] === this.round.currentFood; });
this.checks.forEach((node, i) => { node.active = this.round.completed.has(FOOD_KINDS[i]); });
this.stars.forEach((node, i) => { node.active = i < this.round.score; });
this.successTitle.active = this.round.phase === 'won';
this.failureTitle.active = this.round.phase === 'failed';
```

首版声音复用现有 `archeryShoot`（投出）、`up`（送达）、`fail`（失败）、`buttonClick`（按钮），不新增音频包；BGM 用 `AudioManager.playDefaultBgm()`。如果复用音色与画面不合适，在验收报告中提出而非擅自加大素材。静音由 AudioManager 管；预览与后台不播放。

- [ ] **Step 4: 接推荐流稳定渲染和安全恢复。** start 中订阅 Feed；使用如下真实接口，关键可见节点包括背景、骑手、保安及五个订单 Sprite，而非透明命中区。onFeedState 只在有效 entered 首次出现时唤醒现有插屏；退出则取消当前资格，重进不永久锁死。

```ts
void FeedAcquisitionService.reportSceneReadyAfterStableRender({
  owner: this.node,
  requiredVisibleNodes: [this.background, this.courier, this.guard, ...this.orderSprites],
  isReady: () => !this.disposed && !this.leaving && !this.feedExited,
  stableFrameCount: 3,
  surfaceDelayMs: 180,
});
```

补充 `orderSprites: Node[]` 为场景属性，对应 Order0～Order4。onHide 停止 tick/音效并清除输入手势；onShow 仅在真实玩法可交互时恢复BGM，不向模型传后台累计时间。onDestroy 使用 `node?.isValid` 后 off，撤销原生监听和 Feed listener，只在离开玩法时 completeSession，不能在胜负结算时关闭全局广告时钟。

- [ ] **Step 5: 应用场景、跑完整回归并提交。** 以 apply_patch 写入 Task 2 编制的 scene 与 `.meta`，控制器 `.meta` UUID 必须等于编制阶段预留值。场景测试新增 `assert.deepEqual(JSON.parse(fs.readFileSync('assets/gamescene/FoodDeliveryFeedGameScene.scene', 'utf8')), buildFoodDeliveryScene())`；验证控制器引用、脚本无动态固定UI创建。验证按钮触摸不投射、引擎/原生重复仅一发、漏 feedEnter 首触恢复、预览不投不响不弹广告、hide期间模型位置不变、退出/销毁后无回调、节点先销毁 off 不抛错、重开无残留、编辑器样式只读不抛错。控制器测试和场景测试均全绿后提交本任务路径，message `feat: wire food delivery scene and feed lifecycle`。

### Task 4: 新主页、Content ID 和广告归因

**Files:** Modify `assets/scripts/framework/GameSceneBundle.ts`、`assets/scripts/framework/Platform/FeedRevisitConfig.ts`、`assets/scripts/loadScene.ts`、`assets/scripts/framework/Platform/sdk/SdkUtils.ts`、`assets/scripts/newMainScene.ts`、`assets/gamescene/NewMainScene.scene`、`tools/build_new_main_scene.mjs`、`tools/test_new_main_scene.cjs`、`tools/test_ad_analytics.cjs`；Create `tools/test_food_delivery_integration.cjs`。

**Interfaces:** `GameSceneName.FoodDeliveryFeedGame` 值为 `FoodDeliveryFeedGameScene`；常量 `FEED_FOOD_DELIVERY_CONTENT_ID`；主页字段 `foodDeliveryButton: Button`、处理器 `openFoodDelivery(): void`；卡片名 `FoodDeliveryCard`。卡片尺寸252×268、双列间距26，追加为第七张，不改六张既有卡片顺序。

- [ ] **Step 1: 写入口失败用例。** VM 导入真实 loadScene/newMainScene 和配置，模拟本地 Content ID 时用仅存在测试内的 `TEST_FOOD_DELIVERY`；不得将测试值写入发布配置。

```js
assert.equal(config.FEED_FOOD_DELIVERY_CONTENT_ID, '');
config.FEED_FOOD_DELIVERY_CONTENT_ID = 'TEST_FOOD_DELIVERY';
feed.contentId = 'TEST_FOOD_DELIVERY';
assert.equal(loader.resolveFeedEntry().sceneName, 'FoodDeliveryFeedGameScene');
config.FEED_FOOD_DELIVERY_CONTENT_ID = '';
feed.contentId = '';
assert.equal(loader.resolveFeedEntry().sceneName, 'ShootingGlassBottlesGame');
```

这里 config/loader/feed 在测试夹具内分别指同一 CommonJS 配置导出、真实 loadScene 实例、FeedAcquisitionService.getState 返回值。运行 `node tools/test_food_delivery_integration.cjs` 先红。

- [ ] **Step 2: 增加最小代码注册。** 使用新场景 `.meta` 的真实 UUID 写 GameSceneBundle 映射；已有枚举/映射不重排。

```ts
// FeedRevisitConfig.ts
export const FEED_FOOD_DELIVERY_CONTENT_ID = '';
// loadScene.resolveFeedEntry 中复访分支之后、未知兜底之前：
if (FEED_FOOD_DELIVERY_CONTENT_ID && contentId === FEED_FOOD_DELIVERY_CONTENT_ID) {
  return {sceneName: GameSceneName.FoodDeliveryFeedGame, reason: '外卖精准投送获客玩法'};
}
// SdkUtils 的 AD_FEED_TYPES 新增键：FoodDeliveryFeedGameScene: '外卖精准投送'
// newMainScene：
@property(Button) foodDeliveryButton: Button = null;
private openFoodDelivery(): void { void this.enterGame(GameSceneName.FoodDeliveryFeedGame); }
```

onLoad/onDestroy 补充对应 on/off，将新按钮加入 gameButtons，跳转失败沿用原有导航解锁；不另写第二套 loadScene。

- [ ] **Step 3: 只追加新主页卡片并同步工具。** 实现 `appendFoodDeliveryCard(objects)`：通过名称定位 Canvas/GameList/View/Content，若已有 FoodDeliveryCard 返回已有 Button（幂等）；深拷贝现有正常卡片节点子树并重映射其内部 `__id__` 与 `_id`，将 Artwork 区域替换为新游戏背景/骑手/订单小图组合，标题使用现有空白牌+编辑器Label“外卖精准投送”。不复制原卡片的跳转绑定；回填主控 `foodDeliveryButton`。

```js
const index = content._children.length;
newCard._lpos = vec(index % 2 === 0 ? -139 : 139, -152 - Math.floor(index / 2) * 294);
content._children.push(ref(newCardId));
contentTransform._contentSize.height = 18 + Math.ceil((index + 1) / 2) * 268 +
  (Math.ceil((index + 1) / 2) - 1) * 26 + 14;
mainController.foodDeliveryButton = ref(newButtonId);
```

`newCard`/`newButtonId` 是本函数复制重映射后的对象与索引，`contentTransform` 为 Content 上 cc.UITransform。函数追加 objects 而非重排旧数组；保存到正式 scene 使用 apply_patch。修改 build_new_main_scene 在写文件之前调用同一追加函数，使离线重建也保留该入口。对照修改前快照，除了 Content 子列表/高度和主控新引用，既有对象必须不变。

- [ ] **Step 4: 跑入口、路由、广告回归。** 更新 `test_new_main_scene.cjs` 的 expectedCards/buttonProperties 为七张，并保持所有旧断言；更新广告场景映射预期。测试旧 ID、空 ID、未识别 ID、正常主页、返回主页、跳转拒绝后新按钮重开、当前场景归因和既有广告时间不变。

```bash
node tools/test_food_delivery_integration.cjs
node tools/test_new_main_scene.cjs
node tools/test_ad_analytics.cjs
node tools/test_feed_integration.cjs
node tools/test_feed_revisit_disabled.cjs
node tools/test_repeating_interstitial.cjs
node tools/test_retired_games_removed.cjs
```

如果旧玩法清理测试固定写死“六张卡片”，只将总数更新为七，不能删除旧资源不存在/旧 ID 不路由等有效断言。每个命令单独检查退出码。

- [ ] **Step 5: 审查并提交仅本任务变更。** 共享文件包含用户已有修改，必须基于执行前快照逐块确认归属；不能整文件 git add 把旧玩法清理塞进新功能提交。无法干净分离时保留本任务共享改动在工作区并报告，不回滚用户状态。

### Task 5: 实际渲染、输入与交付验证

**Files:** Create `tools/preview_food_delivery_feed.cjs`、验收报告；仅按发现的问题修正本功能相关文件。

**Interfaces:** 预览工具从 `process.argv[2]` 接受新构建 URL，从 `process.argv[3]` 接受截图输出目录；缺一参数直接报错。URL 必须指向本次构建，不能使用可能陈旧的现有7457目录。输出 gameplay-750x1624.png / gameplay-short.png / gameplay-tall.png / success.png / failure.png 和 JSON 验收结果；不发送真实抖音打点。

- [ ] **Step 1: 全量静态与规则验证。** 按路径单独运行并记录退出码：

```bash
node tools/test_food_delivery_rules.cjs
node tools/test_food_delivery_scene.cjs
node tools/test_food_delivery_controller.cjs
node tools/test_food_delivery_integration.cjs
/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json --skipLibCheck true
git diff --check
```

接着运行 Task 4 的全部回归及 test_feed_audio/test_balloon_feed/test_penguin_stack_feed，避免新场景影响已有生命周期。

- [ ] **Step 2: 构建到独立临时目录。** 使用当前 Creator 3.8.5，先 `mktemp -d /tmp/gem-food-delivery-build.XXXXXX` 得到明确目录；读取现有 builder 配置，使用 LoadScene UUID `7d8273b0-d258-478a-923a-74d5829d12f7` 和 gamescene bundle，不改变项目的抖音构建配置。

```bash
food_delivery_build_dir=$(mktemp -d /tmp/gem-food-delivery-build.XXXXXX)
/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/MacOS/CocosCreator --project /Users/skyhand/Dev/Source/cocos/GemGame --build "platform=web-mobile;debug=true;buildPath=$food_delivery_build_dir;outputName=web-mobile;startScene=7d8273b0-d258-478a-923a-74d5829d12f7"
```

两个命令在同一 shell 执行，记录实际生成的目录，不覆盖现有构建。保留完整构建日志，确认 build success、最新产物和新场景注册同时存在；退出码异常不能忽略，需核实其含义后在报告中说明。构建失败时不声称完成，也不改其他任务代码来掩盖问题。

- [ ] **Step 3: 对新构建执行真实Cocos移动触摸测试。** 使用现有 Playwright 和独立临时浏览器 profile，关闭广告真实请求。通过主页按钮事件进入新场景，使用 CDP touchStart/touchEnd 操作，不只直接调用 throw 方法。测试三种视口750×1624、750×1334、750×1800；每个截图需检查背景和固定节点边界。

```js
const cc = await page.evaluateHandle(async () => System.import('cc'));
await page.waitForFunction(async () => {
  const c = await System.import('cc');
  return c.director.getScene()?.name === 'FoodDeliveryFeedGameScene';
});
const client = await page.context().newCDPSession(page);
await client.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: 210, y: 900}]});
await client.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
```

在测试专用浏览器中可以设置初始手臂角度来稳定覆盖五种命中，但不得改变生产命中判断。连续完成五单、失败、重开、下一轮和返回主页各检查一次；抓 pageerror、资源404、Cocos missing component/asset 日志，预期为空。

- [ ] **Step 4: 模拟推荐流与广告生命周期。** 在本地浏览器通过桩 launch options/FeedService 进入 acquisition 预览，先验证 arm angle 变化但订单/音频/广告不变；再发 feedEnter 与首次原生触摸、重复Cocos触摸，检查只有一发。模拟 feedExit/hide/show/destroy，确保无迟到动作；广告调用在 mock 中记录，不能触达真实服务。

- [ ] **Step 5: 逐图对照、自审与记录。** 调用 view_image 查看本次实际渲染截图，对照参考里的道路高度、骑手/保安大小、订单间距、标题留白、手臂旋转支点和橙色结算按钮。错位先修复，再重跑被影响测试和截图。报告写明素材总 bytes/估算纹理内存、测试命令与结果、构建路径、截图路径、真实 Content ID 仍未配置，以及抖音真机未测的具体项目。

- [ ] **Step 6: 最终审查和交付。** 使用 verification-before-completion 核对每条验收证据；按用户选择的执行方式执行相应代码审查，问题修正后重跑验证。最后交付一个可从新主页打开的本地首版，明确发布推荐流仍需真实 ID 和真机验收，不称已经上线。只提交本功能拥有的变更，不自动推送或创建PR。

## 计划自检与执行选择

覆盖对应关系：设计1/2→Task2，设计3→Task1/3，设计4→Task3/4，设计5→各Task接口，设计6→Task1～5；重开顺序、无宝箱、编辑器所有权、空ID、共享广告均有具体用例。所有步骤依赖的模型、节点和主页字段在本计划中命名。

推荐由当前助手在本任务内直接执行（Native）：规则、场景参数与美术位置联系紧密，逐项集成更合适。另一个可选方式是逐任务交给子代理实施并分别审查，代价是更多上下文和交接。

本计划保存后等待用户审阅并确认执行方式；批准后开始 Task 1，不再重复设计讨论。
