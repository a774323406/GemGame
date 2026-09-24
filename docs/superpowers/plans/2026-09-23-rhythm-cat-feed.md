# 节奏猫咪 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 制作可从主页及抖音推荐流进入的独立猫咪音游场景，按参考视频还原双指接食物、画面和音乐片段。

**Architecture:** 纯逻辑模块负责固定谱面、双指归属和一次性命中判定；场景控制器绑定编辑器预置节点，使用独立 AudioSource 协调音乐与游戏时间。复用现有 FeedAcquisitionService、GameSceneBundle 和广告服务，通过小范围新增接入主页与推荐流。

**Tech Stack:** Cocos Creator 3.8.5、TypeScript、Node.js 内置 assert/vm、离线 SceneAuthor 工具、FFmpeg、参考帧素材分离与透明素材清理、Cocos 浏览器预览。

**Spec:** [2026-09-23-rhythm-cat-feed-design.md](../specs/2026-09-23-rhythm-cat-feed-design.md)。用户已授权直接执行；实现和验证结果见 ../reports/2026-09-23-rhythm-cat-feed-verification.md。

## Global Constraints

- Cocos Creator 3.8.5；独立场景 `RhythmCatFeedGameScene`；资源目录 `assets/res/rhythmCatFeed/`。
- 用户要求主要素材与视频一致：优先原素材，其次拆取参考帧中的原画内容；不以 AI 生成或重绘的相似角色、食物、背景替代。
- 首局为 32.666667 秒固定片段，0 分、3 颗心；每个单元接住加 1 分、漏接扣 1 心；0 心失败，片段结束且尚有心成功。
- 两只猫分别在左右半屏移动，支持双指同时拖动；触摸穿过中线仍控制原猫。
- 固定界面、角色、对象池、命中点和 AudioSource 保存在 scene；运行时不重建固定界面。
- 参考设计宽 750、高约 1479；验证 750×1334、750×1479、750×1624 和更长屏幕。
- 使用录屏中的混合音轨，不额外叠加重复猫叫；音量遵守现有设置。
- 预览不消耗谱面；后台、推荐流退出及全屏广告同时暂停曲目和游戏时间。
- `FEED_RHYTHM_CAT_CONTENT_ID` 初始为空字符串；匹配前检查非空，不虚构 ID，不改未知 ID 兜底。
- 保留口算玩法及旧玩法移除中的改动；不要整体覆盖主页，不恢复已删除文件，不提交其他任务的修改。
- 产品 UI 不增加歌曲商店、排行、宝箱系统、广告复活或自动接取。
- 实测前不声称抖音真机或正式推荐流已通过；测试不得发送真实广告、分享或埋点请求。

## Review Focus

1. 同一触摸经节点、全局及原生通道重复到达，以及高 DPR 坐标不同：只移动对应猫一次，按钮点击不穿透（任务 2、4）。
2. 广告关闭与应用显示事件交错：仍有任一暂停原因时不恢复；全部解除后从同一时刻继续（任务 3、4）。
3. 音频进度停滞、回跳、静音及播放失败：谱面不跳跃，失败时不抢跑，静音仍可玩（任务 3）。
4. 最后一个音符与曲目结束同帧、低帧率横跨多个音符：先完成判定，只结算一次，生命不为负（任务 2）。
5. 重开或导航后才到达的加载、音频和广告回调：不修改新局，导航失败仍能恢复并重试（任务 4、5）。

## File Map

| 路径 | 职责 |
| --- | --- |
| `marketing/feed/rhythm-cat/reference.mp4`、`reference-notes.md`、`chart-observations.json`、`asset-provenance.json` | 非发布参考、帧时间、谱面观测及每份素材的原文件/来源帧与缺口 |
| `assets/res/rhythmCatFeed/` 及 `.meta` | 压缩后的图像、音频和导入引用 |
| `assets/scripts/rhythmCatChart.ts` | 固定食物数据、曲目时长及类型 |
| `assets/scripts/rhythmCatRules.ts` | 得分、生命、连续判定和局状态 |
| `assets/scripts/rhythmCatInput.ts` | 双指归属和左右移动边界 |
| `assets/scripts/rhythmCatTimeline.ts` | 音频校准、暂停原因集合和有效时间 |
| `assets/scripts/rhythmCatFeedGameScene.ts` | 场景表现、平台生命周期和交互协调 |
| `assets/gamescene/RhythmCatFeedGameScene.scene` 及 `.meta` | 编辑器可见、可调整的完整场景 |
| `tools/rhythm_cat_authoring.mjs`、`build_rhythm_cat_scene.mjs` | 新场景及资源元数据生成 |
| `tools/rhythm_cat_main_card.mjs` | 在现有主页局部添加入口，重复执行不重复添加 |
| `tools/test_rhythm_cat_{assets,rules,input,timeline,controller,scene,integration}.cjs` | 各模块及接入验证 |
| `tools/rhythm_cat_test_helpers.cjs` | 仅供本功能测试使用的 TypeScript 模块加载器和引擎桩 |
| `docs/superpowers/reports/2026-09-23-rhythm-cat-feed-verification.md` | 实际验证证据、截图位置、资源统计与真机限制 |

共享文件仅局部修改：`AudioManager.ts`、`GameSceneBundle.ts`、`FeedRevisitConfig.ts`、`loadScene.ts`、`SdkUtils.ts`、`newMainScene.ts`、`NewMainScene.scene`、`tools/build_new_main_scene.mjs` 和适用的构建配置。每次编辑前重读，保留工作区最新内容。

## Task 1: 参考谱面和可用素材

**Files:** 创建 File Map 中的参考目录、资源目录和 `tools/test_rhythm_cat_assets.cjs`。

**Interfaces:** 后续 scene 使用 `background.jpg`、`black-idle.png`、`black-open.png`、`white-idle.png`、`white-open.png`、`brown-pop.png`、`pink-pop.png`、`brown-scoop.png`、`pink-scoop.png`、`brown-cone.png`、`pink-cone.png`、`heart-full.png`、`heart-empty.png`、`crumb-brown.png`、`crumb-pink.png`、`result-panel.png`、`button.png` 和 `track.mp3`。谱面观测记录结构为 `{ id: number, side: 0 | 1, x: number, hitTime: number, kind: string, sourceFrame: number }`，`x` 是该半屏中 0～1 的位置。

- [ ] **Step 1: 保存参考并测量。** 从现有副本复制，记录来源、时长、帧率、分辨率及音轨是混合录音这一限制。

```bash
mkdir -p marketing/feed/rhythm-cat
cp /private/tmp/gem-rhythm-cat-reference/reference.mp4 marketing/feed/rhythm-cat/reference.mp4
ffprobe -v error -show_entries format=duration:stream=codec_type,width,height,r_frame_rate -of json marketing/feed/rhythm-cat/reference.mp4
ffmpeg -hide_banner -loglevel error -y -i marketing/feed/rhythm-cat/reference.mp4 -vf fps=10 /private/tmp/gem-rhythm-cat-reference/frame-%04d.png
```

- [ ] **Step 2: 取得原画内容并核对素材。** 优先同一游戏的原始素材；没有原素材时，检查参考帧中完整无遮挡的黑白猫闭嘴/张嘴姿态、食物和背景，拆取其实际画面内容，从其他参考帧补齐已出现过的部位。编辑仅用于分离背景、清理录屏污染与对齐，保留原五官、嘴形、轮廓、描边、颜色、纹理和比例；不生成相似造型替代。背景保持参考的墙面/地板比例，按场景需要导出；透明素材保留足够的原帧清晰度。用 `view_image` 逐项查看与原帧的同尺寸并排对照，检查两种姿态对齐。

`asset-provenance.json` 每项记录 `{ file, sourceType, sourceFile, sourceFrames, processing, gaps }`，`sourceType` 为 `original`、`video-frame` 或 `new-result-ui`。主要素材不得使用 `new-result-ui`；该类型只用于参考未展示、用户已同意补充的结算界面。仍有关键缺口时列出，不用补绘或生成图悄悄替代，不宣称已经一致。

- [ ] **Step 3: 提取音轨并记录事件。** 按视频帧记录左右食物到达嘴部的时刻，连续段拆成独立计分单元。每条记录必须有来源帧；不得随机生成并称作原谱面。

```bash
ffmpeg -hide_banner -loglevel error -y -i marketing/feed/rhythm-cat/reference.mp4 -vn -t 32.666667 -ac 2 -ar 44100 -codec:a libmp3lame -b:a 128k assets/res/rhythmCatFeed/track.mp3
```

- [ ] **Step 4: 验证可用资源。** 编写资源检查器：读取上述文件并检查非零体积；用已安装的 sharp 获取尺寸及透明通道，用 ffprobe 检查音频实际时长误差小于 0.05 秒。输出总磁盘字节和所有图像 `width * height * 4` 的和。

```js
assert.equal(background.width, 750);
assert.equal(background.height, 1479);
assert.equal(blackIdle.hasAlpha, true);
assert.equal(whiteOpen.hasAlpha, true);
assert(Math.abs(trackDuration - 32.666667) < 0.05);
assert(observations.length > 0);
assert(observations.every(n => Number.isInteger(n.sourceFrame) && n.hitTime >= 0 && n.hitTime <= 32.666667));
```

执行 `node tools/test_rhythm_cat_assets.cjs`，检查输出并保存素材与原帧的对照总览。检查每份主要素材有可追溯的原文件或来源帧，且没有未解决的关键造型缺口；透明度和尺寸检查通过不能代替原画一致性检查。只提交本任务的新增资源及记录。

## Task 2: 固定谱面、判定和双指控制

**Files:** 创建 `rhythmCatChart.ts`、`rhythmCatRules.ts`、`rhythmCatInput.ts`，测试辅助模块及 rules/input 测试。

**Interfaces:**

```ts
export type CatSide = 0 | 1;
export type FoodKind = 'brown-pop' | 'pink-pop' | 'brown-scoop' | 'pink-scoop' | 'brown-cone' | 'pink-cone';
export interface CatNote { id: number; side: CatSide; x: number; hitTime: number; kind: FoodKind; }
export interface CatPose { x: number; radius: number; }
export interface CatJudgment { note: CatNote; caught: boolean; }
export type CatRoundStatus = 'ready' | 'playing' | 'success' | 'failed';
export const RHYTHM_CAT_DURATION = 32.666667;
export const RHYTHM_CAT_CHART: readonly CatNote[];
// class RhythmCatRound:
// constructor(notes: readonly CatNote[], duration: number)
// score: number; lives: number; time: number; status: CatRoundStatus
// reset(): void; start(): void
// advance(toTime: number, from: readonly [CatPose, CatPose], to: readonly [CatPose, CatPose]): CatJudgment[]
// class RhythmCatInput:
// positions: [number, number]  // each side uses normalized local x
// begin(id: number, screenX: number, blocked: boolean): boolean
// move(id: number, screenX: number): void; end(id: number): void; clear(): void
```

在实际模块中定义上列接口和类；`screenX` 是整个画布 0～1，规则模块中 `x/radius` 是所属半屏局部归一化坐标。控制器负责把场景中嘴部、边界位置换算为这一坐标。

- [ ] **Step 1: 编写失败用例。** 测试辅助模块提供 `loadTs(file, imports = {})`：使用工程现有 Cocos TypeScript 包进行 CommonJS transpile，再在 vm 中执行，显式映射 imports，不依赖 Cocos 运行时。

```js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');
function loadTs(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true,
  }}).outputText;
  vm.runInNewContext(code, {exports, require(name) {
    assert(Object.prototype.hasOwnProperty.call(imports, name), `unmocked import: ${name}`);
    return imports[name];
  }, console, Math, Number, String, Set, Map, Symbol});
  return exports;
}
module.exports = {loadTs};
```

```js
const n = [{id:1,side:0,x:0.25,hitTime:1,kind:'brown-pop'}];
const r = new RhythmCatRound(n, 2);
const pose = [{x:0.25,radius:0.1},{x:0.5,radius:0.1}];
r.start();
assert.equal(r.advance(1.1, pose, pose)[0].caught, true);
assert.equal(r.score, 1);
assert.equal(r.advance(1.1, pose, pose).length, 0);
r.advance(2, pose, pose);
assert.equal(r.status, 'success');
const input = new RhythmCatInput();
assert(input.begin(10, 0.2, false));
assert(input.begin(20, 0.8, false));
assert.equal(input.begin(10, 0.2, false), false);
assert.equal(input.begin(30, 0.1, false), false);
input.end(10);
const before = input.positions[1];
input.move(20, 0.9);
assert(input.positions[1] > before);
assert.equal(input.begin(40, 0.4, true), false);
```

增加：3 个漏接后只失败一次；最后音符在 duration 时恰好漏掉最后一心；同侧/异侧独立判定；起始边界音符；NaN、负值及倒退时间；同一线性输入轨迹分别以 30/60 FPS 和 0.3 秒卡顿采样得分一致；跨中线、cancel、重新使用 touch ID 均保持正确归属。

- [ ] **Step 2: 执行并确认失败原因。** 运行 `node tools/test_rhythm_cat_rules.cjs` 和 `node tools/test_rhythm_cat_input.cjs`，先看到目标模块尚不存在或行为缺失的失败。
- [ ] **Step 3: 实现固定数据与最小判定。** 将任务 1 的观测转成排序后的常量数据，验证唯一 ID 和范围。每次 advance 处理 `(previousTime, toTime]` 到期音符，对到达时刻在 from/to 姿态之间插值判定；首帧单独覆盖时间 0。处理同一时刻全部结果后再决定终态，终态不再推进。输入模块按 touch ID 绑定侧别，重复 begin 不重置拖动起点，使用相对位移并限幅。

```ts
const span = toTime - previousTime;
const fraction = span > 0 ? Math.max(0, Math.min(1, (note.hitTime - previousTime) / span)) : 1;
const x = from[note.side].x + (to[note.side].x - from[note.side].x) * fraction;
const caught = Math.abs(x - note.x) <= to[note.side].radius;
```

- [ ] **Step 4: 跑完两组测试并提交。** 不用修改预期值掩盖轨迹不一致；检查音符总数和左右密度与来源记录一致。

## Task 3: 可暂停的曲目时间轴

**Files:** 创建 `rhythmCatTimeline.ts`、`tools/test_rhythm_cat_timeline.cjs`；局部修改 `assets/scripts/framework/AudioManager.ts` 并将音频接管测试加入 timeline 测试文件。

**Interfaces:**

```ts
export interface CatAudioPort {
  play(): void; pause(): void; stop(): void;
  seek(time: number): void; position(): number; playing(): boolean;
}
export type CatPauseReason = 'background' | 'feed' | 'advert' | 'leaving';
// class RhythmCatTimeline:
// constructor(audio: CatAudioPort, duration: number)
// time: number; started: boolean; awaitingGesture: boolean
// start(muted: boolean): boolean; reset(): void
// setPaused(reason: CatPauseReason, value: boolean): void
// tick(dt: number): number
```

- [ ] **Step 1: 写失败用例并运行。** 桩模拟 play 抛错、延迟 playing、position 为 NaN、保持不变、回跳，以及 pause/seek 调用计数。失败播放不推进时间；静音可以运行；开始成功后，有限有效的进度优先校准，读数异常时用单调时钟保持连续。

```js
timeline.start(true);
timeline.tick(1);
timeline.setPaused('background', true);
timeline.setPaused('advert', true);
timeline.tick(10);
assert.equal(timeline.time, 1);
timeline.setPaused('background', false);
timeline.tick(10);
assert.equal(timeline.time, 1);
timeline.setPaused('advert', false);
timeline.tick(0.1);
assert(Math.abs(timeline.time - 1.1) < 0.0001);
timeline.reset();
assert.equal(timeline.time, 0);
assert.equal(timeline.started, false);
```

- [ ] **Step 2: 实现暂停集合与时间校准。** 每种暂停原因独立保存在 Set；只有由零变非零时 pause，由非零变零时 seek 已保存时间并恢复。拒绝负值和非有限 dt；校准不得倒退，异常大音频跳跃不直接消费整段谱面。非静音播放只在确认 playing 后推进；启动失败或超过 0.5 秒仍未启动时退回等待手势。静音仅影响音量/播放需求，不影响有效游戏时钟。

```ts
const wasPaused = this.pauseReasons.size > 0;
if (value) this.pauseReasons.add(reason); else this.pauseReasons.delete(reason);
const isPaused = this.pauseReasons.size > 0;
if (!wasPaused && isPaused) this.audio.pause();
if (wasPaused && !isPaused && this.started) {
  this.audio.seek(this.time);
  this.audio.play();
}
```

- [ ] **Step 3: 防止共享 BGM 叠播。** 在 AudioManager 增加可释放的场景音乐接管方法。只有共享 BGM 受影响，按钮音效保留；独立曲目音量直接读取 `gameStorage.getMusic() !== 1`。为共享 BGM 的 play/restart/resume 及迟到加载回调增加覆盖，确保接管期间不会播放，重复释放无副作用，释放后仍遵守静音设置。

```ts
private static sceneMusicOwners = new Set<symbol>();
static acquireSceneMusic(): () => void {
  const token = Symbol('scene-music');
  this.sceneMusicOwners.add(token);
  this.stopMusic();
  return () => { this.sceneMusicOwners.delete(token); };
}
private static canPlayMusic(): boolean {
  return this.sceneMusicOwners.size === 0 && gameStorage.getMusic() !== 1;
}
```

控制器存储返回的释放函数，离开/销毁时调用；导航失败时继续持有，不直接恢复主页 BGM。检查 `playLoadedMusic` 等异步入口在赋值前也调用播放资格检查。

- [ ] **Step 4: 验证并提交。** `node tools/test_rhythm_cat_timeline.cjs` 和 `node tools/test_feed_audio.cjs` 通过，并在报告中保留真实 Cocos AudioSource 仍需验证的项目。

## Task 4: 可编辑场景与可玩的控制器

**Files:** 创建 authoring/build 工具、scene、脚本 `.meta`、`rhythmCatFeedGameScene.ts`、scene/controller 测试。

**Interfaces:** 场景 UUID 固定为 `e7a3d090-ab08-59ac-a467-33ebbc65a924`，控制器脚本 UUID 固定为 `9d82c5be-37a8-51e4-a62c-e232db5fda1b`，来自 `GemGame/rhythmCatFeed/` 命名空间 SHA-256。导出 `buildRhythmCatScene(): object[]`、`rhythmCatUuid(name: string): string`。组件类名为 `rhythmCatFeedGameScene`。

控制器序列化字段：`background`、`layoutRoot`、`laneRoots`、`catRoots`、`catIdleNodes`、`catOpenNodes`、`mouthAnchors`、`laneLeftBounds`、`laneRightBounds`、`foodNodes`、`foodFrames`、`crumbNodes`、`heartFullNodes`、`heartEmptyNodes`、`scoreLabel`、`feedbackLabels`、`guideNode`、`trackSource`、`backButton`、`resultOverlay`、`resultTitle`、`resultScore`、`retryButton`、`homeButton`。侧别数组长 2，爱心数组长 3。

- [ ] **Step 1: 场景与控制器测试先失败。** 参照现有 scene 测试遍历所有 `__id__` 引用，验证必要字段绑定、非空曲目、不自动播放、非循环、结算初始隐藏及 BlockInputEvents。控制器桩覆盖重复 feedEnter 不重开、预览不走时、按钮不触发猫咪、原生/Cocos 同一次输入不重启、低 DPR/高 DPR 等价坐标、销毁解绑以及旧回调不能改变新局。

```js
assert.equal(sceneTrack.__type__, 'cc.AudioSource');
assert.equal(sceneTrack._loop, false);
assert.equal(sceneTrack._playOnAwake, false);
assert.equal(controller.catRoots.length, 2);
assert.equal(controller.heartFullNodes.length, 3);
assert.equal(objects[controller.resultOverlay.__id__]._active, false);
```

- [ ] **Step 2: 离线搭建新场景。** 复用 `SceneAuthor` 的 node/sprite/label/widget 和现有 appendSceneGlobals，使用本功能自己的 UUID；摄像机字段从现有有效场景模板读取。按参考将猫咪脚底放在约画面高度 70% 的地板线上，嘴部约 63%～65% 处，分数/心形约 22% 处；两猫和食物使用同一等比布局根节点。对象池容量按固定谱面在屏食物最大数量计算，再增加少量余量；小碎屑使用共享贴图。

```js
const source = a.component(trackNode, 'cc.AudioSource', {
  _clip: {__uuid__: rhythmCatUuid('track.mp3'), __expectedType__: 'cc.AudioClip'},
  _loop: false, _playOnAwake: false, _volume: 1,
});
const controllerId = a.component(canvas, compressUuid(SCRIPT_UUID), {
  trackSource: ref(source), laneRoots: laneRoots.map(ref), catRoots: catRoots.map(ref),
  foodNodes: foodNodes.map(ref), resultOverlay: ref(resultOverlay),
});
```

生成器只生成新场景；默认遇到已存在 scene 时报错，显式 `--replace-scene` 才允许重建。生成图片、音频、脚本和场景的正确元数据，验证真实引擎序列化字段名。

- [ ] **Step 3: 控制器接线并实现表现。** 从绑定的嘴部及边界换算归一化判定坐标，使用输入模块控制角色，时间轴驱动食物位置。食物 x 映射到对应半屏边界，y 从命中点加 `(hitTime - time) * fallSpeed` 得到；镜头外的食物不激活。每个 judgment 驱动一次口型、碎屑和文字，结果面板仅在状态改变时更新。动画使用编辑器初始姿态作为基线。

```ts
const time = this.timeline.tick(dt);
const outcomes = this.round.advance(time, this.previousPoses, this.currentPoses);
for (const outcome of outcomes) this.showJudgment(outcome);
this.renderFoods(time);
if (this.round.status === 'success' || this.round.status === 'failed') this.showResult();
```

在此任务中定义并实现控制器私有方法 `showJudgment(outcome: CatJudgment)`、`renderFoods(time: number)` 和幂等 `showResult()`。尺寸变化时重新计算布局和绑定坐标，保持角色宽高比。

- [ ] **Step 4: 处理平台暂停和安全离开。** 复用 Feed 就绪、首触恢复和插屏调度。使用 `SdkUtils.isFullscreenAdBusy()` 及现有广告事件更新暂停原因，不直接暂停全局引擎。使用任务 3 的 `AudioManager.acquireSceneMusic()`，销毁或成功离开时释放；不能轮询 stopMusic 掩盖双曲播放。导航成功才 completeSession；失败恢复此前暂停状态及按钮；异步操作携带 roundSerial。

- [ ] **Step 5: 测试、观察并提交。** 运行 assets/rules/input/timeline/scene/controller 测试，打开新场景验证首触、一次接取、一次漏接、结算和重开；验证失败提示不会被频繁 UI 刷新覆盖。

## Task 5: 主页与推荐流接入

**Files:** 新增 `tools/rhythm_cat_main_card.mjs`、`tools/test_rhythm_cat_integration.cjs`；局部修改 File Map 所列共享文件。

**Interfaces:** `appendRhythmCatCard(objects: object[]): void` 必须幂等；主页属性 `rhythmCatButton`，节点名 `RhythmCatCard`，路由枚举 `RhythmCatFeedGame`，归因值“节奏猫咪”。

- [ ] **Step 1: 先验证接入缺失。** 测试新枚举、UUID、卡片/按钮绑定、配置为空不匹配、配置模拟 ID 后可进入、未知 ID 仍走旧兜底及“节奏猫咪”广告归因。对已有主页对象复制运行 append 两次，断言只新增一张卡片，旧节点的图片、文字和相对顺序保持原样。

```js
appendRhythmCatCard(lobby);
appendRhythmCatCard(lobby);
assert.equal(lobby.filter(o => o.__type__ === 'cc.Node' && o._name === 'RhythmCatCard').length, 1);
assert.equal(resolveWithConfig('', '').sceneName, 'ShootingGlassBottlesGame');
assert.equal(resolveWithConfig('CONTENT_TEST_RHYTHM_CAT', 'CONTENT_TEST_RHYTHM_CAT').sceneName, 'RhythmCatFeedGameScene');
```

`resolveWithConfig(configId, launchId)` 是本任务测试内定义的包装：以桩模块注入配置和启动状态后调用真实 loadScene 控制器的推荐流选择逻辑，不发送平台请求。

- [ ] **Step 2: 增加路由及入口。** 在现有非空检查模式旁局部插入：

```ts
export const FEED_RHYTHM_CAT_CONTENT_ID: string = '';
// GameSceneName 中新增：RhythmCatFeedGame = 'RhythmCatFeedGameScene'
// UUID 表中新增：[GameSceneName.RhythmCatFeedGame]: 'e7a3d090-ab08-59ac-a467-33ebbc65a924'
if (FEED_RHYTHM_CAT_CONTENT_ID && contentId === FEED_RHYTHM_CAT_CONTENT_ID) {
  return {sceneName: GameSceneName.RhythmCatFeedGame, reason: '节奏猫咪推荐流'};
}
```

主页新增 @property(Button) 的 `rhythmCatButton`、点击绑定/解绑和 `openRhythmCat()`；进入导航锁时包含新按钮。卡片添加工具沿用当前已有卡片样式和网格，在列表末尾添加，更新滚动内容高度及控制器按钮引用。将 append 调用加入主页离线生成器，不执行整个主页重建。构建列表按当前有效配置补入 scene。

- [ ] **Step 3: 新功能与已有集成回归。** 执行 rhythm_cat_integration、test_new_main_scene、test_feed_integration、test_ad_analytics、test_feed_revisit_disabled、test_repeating_interstitial、test_retired_games_removed 以及企鹅和口算相关测试。先记录其他任务的基线失败，再区分本次引入问题；不为通过测试恢复旧游戏。提交仅包含本功能的改动块。

## Task 6: 构建、实际操作与最终审查

**Files:** 创建验收报告；只修复验证发现的本功能问题。

**Interfaces:** 报告记录每个命令退出码、构建目录、Cocos 日志、实际截图绝对路径、音频/素材统计、双指桩结果及真机待验项。

- [ ] **Step 1: 执行完整本功能检查。** 逐个运行 7 个 `test_rhythm_cat_*.cjs` 测试，再运行任务 5 的受影响回归。TypeScript 检查使用工程安装的编译器；已有失败必须明确列出，不能误写全通过。

```bash
/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json --skipLibCheck true
git diff --check
```

- [ ] **Step 2: 构建到独立临时目录。** 避免覆盖用户已有产物；记录实际输出路径，成功判断同时核对日志、文件和场景注册。若 Cocos 返回非零退出码，即便产物可用也在报告中保留真实结果。

```bash
rhythm_cat_build_dir=$(mktemp -d /private/tmp/gem-rhythm-cat-build.XXXXXX)
/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/MacOS/CocosCreator --project /Users/skyhand/Dev/Source/cocos/GemGame --build "platform=web-mobile;debug=true;buildPath=$rhythm_cat_build_dir;outputName=web-mobile;startScene=7d8273b0-d258-478a-923a-74d5829d12f7"
```

- [ ] **Step 3: 实際场景检查。** 用当前支持的 CUA 浏览器工具打开本次构建，操作主页卡片进入，再进行拖动、漏接、失败重试、成功路径的逻辑验证、返回和再次进入。实际 UI 行为只用当前浏览器工具，不直接运行旧预览脚本的外部浏览器驱动。双指用控制器桩覆盖身份和并发规则，真机多点触摸另列为待验，不将鼠标拖动冒充双指实测。

在 750×1334、750×1479、750×1624、750×1800 检查玩法与结算画面。提取第 3、9、15、27 秒参考帧对照猫咪、地板线、分数爱心、食物密度和画面留白；开启音乐观察食物与参考节奏，暂停/恢复后再比对。完成后恢复浏览器视口。

- [ ] **Step 4: 验收与审查。** 依照 verification-before-completion 技能保留新鲜证据；执行一次整体代码审查，重点复核 Review Focus 的 5 项，修复实际缺陷后只重跑对应验证及必要回归。报告真实 Content ID 未提供、未做抖音真机验证、录屏混合音轨和源素材重建的限制。

- [ ] **Step 5: 交付。** 展示场景截图、场景文件链接、验证结果和待配置的 Content ID 位置。清点最终差异，提交本功能文件，保留其他任务未提交改动；不发布、不推送或声称上线。

## Self-Review

- 设计第 1～2 节由任务 1、4 覆盖；用户追加的主要素材一致性要求由任务 1 的来源记录、缺口检查和同尺寸原帧对照覆盖；第 3 节由任务 2、4 覆盖；第 4 节由任务 3、4 覆盖；第 5 节由任务 4、5 覆盖；模块和验收由任务 2～6 覆盖。
- Review Focus 的 5 项分别落在具名测试步骤中；真实双指与平台音频仍保留真机验收边界。
- 数据侧别、归一化坐标、UUID、文件名、场景属性和入口命名在各任务间统一；谱面来自已取得参考文件，不预填虚构食物事件。
- 推荐由当前会话顺序实施：时间轴、双指判定和场景表现共享接口较多，按顺序完成可减少反复对接；末尾做一次整体审查。

## 实施前基线（2026-09-23）

已在猫咪游戏产品代码尚未创建时运行 8 组现有测试：企鹅规则/场景、推荐流音频、主页、推荐流集成、广告归因、口算规则及口算场景共 7 组通过。`node tools/test_math_exam_controller.cjs` 在场景销毁用例失败：`scene teardown must tolerate already-destroyed children`，实际错误为 `destroyed event processor`。这是当前口算任务的基线状态，不属于猫咪改动；实施后回归须与这条记录区分，且不得覆盖其他任务正在进行的修复。
