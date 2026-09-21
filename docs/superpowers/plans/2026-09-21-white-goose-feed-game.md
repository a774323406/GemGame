# White Goose Feed Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the “套大鹅” minigame from the Creator 2.4.12 source project into GemGame as an editable Creator 3.8.5 scene reachable from both NewMainScene and feed direct play, without any source reward systems.

**Architecture:** Reuse only the source artwork, Spine 3.8.99 data, and audio; rebuild the scene as Creator 3.8 serialized data and rewrite gameplay in TypeScript. Keep deterministic round state in a pure `WhiteGooseRound` model, keep Cocos node/Spine/ad/feed behavior in `whiteGooseFeedGameScene`, and keep all fixed UI authored in `.scene` through the established offline authoring utilities.

**Tech Stack:** Cocos Creator 3.8.5, TypeScript, Cocos `sp.Skeleton`, Node.js authoring/test scripts, existing `AudioManager`, `FeedAcquisitionService`, `ADController`, and `SdkUtils`.

**Spec:** `docs/superpowers/specs/2026-09-21-white-goose-feed-game-design.md`

## Global Constraints

- Source gameplay comes from `/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose` (Creator 2.4.12); no source prefab or source JavaScript component is copied into runtime code.
- Target runtime is Creator 3.8.5 and the Spine files declare Spine 3.8.99.
- Fixed UI, positions, sizes, touch areas, and result panels must be serialized in `WhiteGooseFeedGameScene.scene`; runtime code may animate or toggle them but must not construct the fixed layout.
- The scene uses a 750×1624 fixed-width layout with proportional background cover/cropping, not non-uniform stretching.
- Initial round values are 7 active geese chosen from 10 slots and 10 rings; a completed rewarded video grants exactly 5 rings.
- Walking geese and `s1` cannot be caught; valid `s2`, `s3`, and `s4` poses retain the source 70% catch probability.
- No entry fee, coins, antique, lucky box, share reward, task progress, replenish prefab, or source save-data dependency is included.
- The temporary feed Content ID is the literal value `"xxx"` and must be defined once in `FeedRevisitConfig.ts`.
- The existing dirty worktree belongs to the user; preserve unrelated changes, including current NewMainScene and food-delivery work.

## Review Focus

- A goose tap must not bubble into the field handler and consume two rings; `tools/test_white_goose_controller.cjs` pins one gesture to one `beginThrow` call.
- Catching the seventh goose with the final ring must win rather than briefly or permanently lose; `tools/test_white_goose_rules.cjs` covers final-ring resolution ordering.
- Old Spine/ad/tween callbacks arriving after reset or scene destruction must not mutate the new round; `tools/test_white_goose_controller.cjs` verifies the round-serial guards and cleanup calls.
- Feed preview must be non-interactive and real `feedEnter` must reset to a fresh 7-goose/10-ring round exactly once; `tools/test_feed_integration.cjs` covers routing and entry state.
- 750×1334, 750×1624, and taller screens must keep a full-screen background/result dim and usable safe-area controls; `tools/test_white_goose_scene.cjs` validates the serialized widgets and design dimensions.

---

### Task 1: Pure Round Rules

**Files:**
- Create: `assets/scripts/whiteGooseRoundRules.ts`
- Create: `assets/scripts/whiteGooseRoundRules.ts.meta`
- Create: `tools/test_white_goose_rules.cjs`

**Interfaces:**
- Consumes: injected `random: () => number` values in the range `[0, 1)`.
- Produces: `WhiteGooseRound`, `WhiteGooseSnapshot`, `WhiteGooseRoundStatus`, `INITIAL_RING_COUNT`, `AD_RING_COUNT`, `TARGET_GOOSE_COUNT`, `GOOSE_SLOT_COUNT`, and `isCatchSuccessful(pose, walking, randomValue)`.

- [ ] **Step 1: Write the failing rules test**

Create a test that transpiles TypeScript with Creator’s bundled TypeScript package, following `tools/test_food_delivery_rules.cjs`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript');

function loadRules() {
  const source = fs.readFileSync('assets/scripts/whiteGooseRoundRules.ts', 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const output = {};
  vm.runInNewContext(code, { exports: output, module: { exports: output }, Math, Set, Error });
  return output;
}

const { WhiteGooseRound, isCatchSuccessful } = loadRules();
const round = new WhiteGooseRound(() => 0);
assert.deepEqual(Array.from(round.snapshot.activeSlots), [1, 2, 3, 4, 5, 6, 7]);
assert.equal(round.snapshot.ringsRemaining, 10);
assert.equal(round.beginThrow(), true);
assert.equal(round.resolveThrow(false).status, 'playing');
for (let index = 0; index < 6; index += 1) {
  assert.equal(round.beginThrow(), true);
  round.resolveThrow(true);
}
for (let index = 0; index < 2; index += 1) {
  assert.equal(round.beginThrow(), true);
  round.resolveThrow(false);
}
assert.equal(round.snapshot.ringsRemaining, 1);
assert.equal(round.beginThrow(), true);
assert.equal(round.resolveThrow(true).status, 'won', 'last ring may catch the seventh goose');
assert.equal(round.grantRings(5), false, 'won rounds cannot revive');
assert.equal(isCatchSuccessful('s2', false, 0.699999), true);
assert.equal(isCatchSuccessful('s4', false, 0.7), false);
assert.equal(isCatchSuccessful('s1', false, 0), false);
assert.equal(isCatchSuccessful('s3', true, 0), false);

const failed = new WhiteGooseRound(() => 0.5);
for (let index = 0; index < 10; index += 1) {
  failed.beginThrow();
  failed.resolveThrow(false);
}
assert.equal(failed.snapshot.status, 'lost');
assert.equal(failed.grantRings(5), true);
assert.equal(failed.snapshot.status, 'playing');
assert.equal(failed.snapshot.ringsRemaining, 5);
assert.equal(failed.snapshot.ringLimit, 15);
console.log('White goose rules tests passed');
```

- [ ] **Step 2: Run the rules test and verify failure**

Run: `node tools/test_white_goose_rules.cjs`

Expected: FAIL because `assets/scripts/whiteGooseRoundRules.ts` does not exist.

- [ ] **Step 3: Implement the pure round model**

Implement these exact public shapes and state transitions:

```ts
export const GOOSE_SLOT_COUNT = 10;
export const TARGET_GOOSE_COUNT = 7;
export const INITIAL_RING_COUNT = 10;
export const AD_RING_COUNT = 5;

export type WhiteGooseRoundStatus = "playing" | "won" | "lost";
export type CatchablePose = "s1" | "s2" | "s3" | "s4";

export interface WhiteGooseSnapshot {
  readonly activeSlots: readonly number[];
  readonly caughtCount: number;
  readonly ringsRemaining: number;
  readonly ringLimit: number;
  readonly status: WhiteGooseRoundStatus;
  readonly throwInFlight: boolean;
}

export function isCatchSuccessful(
  pose: CatchablePose,
  walking: boolean,
  randomValue: number,
): boolean {
  return !walking && pose !== "s1" && randomValue < 0.7;
}

export class WhiteGooseRound {
  public constructor(private readonly random: () => number = Math.random) { this.reset(); }
  public get snapshot(): WhiteGooseSnapshot;
  public reset(): WhiteGooseSnapshot;
  public beginThrow(): boolean;
  public resolveThrow(caught: boolean): WhiteGooseSnapshot;
  public grantRings(count: number = AD_RING_COUNT): boolean;
}
```

`reset()` must Fisher–Yates shuffle `[0..9]` with the injected random source and select exactly seven unique indices. `beginThrow()` decrements once and marks a throw in flight; it must not declare loss. `resolveThrow()` increments caught count first, then selects `won`, `lost`, or `playing`, which guarantees the seventh catch on the final ring wins.

- [ ] **Step 4: Run the rules test and verify pass**

Run: `node tools/test_white_goose_rules.cjs`

Expected: `White goose rules tests passed`.

- [ ] **Step 5: Commit the rules unit**

```bash
git add assets/scripts/whiteGooseRoundRules.ts assets/scripts/whiteGooseRoundRules.ts.meta tools/test_white_goose_rules.cjs
git commit -m "feat: add white goose round rules"
```

### Task 2: Minimal Source Asset Pack and Audio Registry

**Files:**
- Create: `assets/res/whiteGooseFeed/` and its Creator 3.8 metadata
- Create: `assets/res/newMain/preview_white_goose.png` and metadata
- Create: `tools/test_white_goose_assets.cjs`
- Modify: `assets/scripts/gamePrefabMgr.ts`

**Interfaces:**
- Consumes: source files from `g_whitegoose/texture`, `g_whitegoose/spine`, and `g_whitegoose/sound`.
- Produces: sprite-frame UUIDs for background/foreground/shadow/rings/preview, `sp.SkeletonData` UUIDs for `taodae` and `taoquanshou`, and audio keys `whiteGooseBgm`, `whiteGooseCall1`, `whiteGooseCall2`, `whiteGooseCall3`.

- [ ] **Step 1: Write the failing asset-scope test**

Create `tools/test_white_goose_assets.cjs` with exact allow/deny checks:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = 'assets/res/whiteGooseFeed';
const required = [
  'ditu.jpg', 'ditulang.png', 'goose-shadow.png',
  'ring-blue-bottom.png', 'ring-blue-top.png',
  'ring-yellow-bottom.png', 'ring-yellow-top.png',
  'ring-red-bottom.png', 'ring-red-top.png',
  'taodae.json', 'taodae.atlas', 'taodae.png', 'taodae2.png',
  'taoquanshou.json', 'taoquanshou.atlas',
  'white-goose-bgm.mp3', 'white-goose-call-1.mp3',
  'white-goose-call-2.mp3', 'white-goose-call-3.mp3',
];
for (const file of required) {
  assert(fs.existsSync(path.join(root, file)), `missing ${file}`);
  assert(fs.existsSync(path.join(root, `${file}.meta`)), `missing meta for ${file}`);
}
for (const forbidden of ['+ 80.png', '套大鹅简介.png', '开心套大鹅.png', '拿多拿少全靠技术！.png', 'dqq_rk.png']) {
  assert(!fs.existsSync(path.join(root, forbidden)), `reward/intro asset copied: ${forbidden}`);
}
const soundSource = fs.readFileSync('assets/scripts/gamePrefabMgr.ts', 'utf8');
for (const name of ['whiteGooseBgm', 'whiteGooseCall1', 'whiteGooseCall2', 'whiteGooseCall3']) {
  assert(soundSource.includes(`${name} = "${name}"`), `missing sound enum ${name}`);
  assert(soundSource.includes(`[soundName.${name}]`), `missing sound UUID ${name}`);
}
assert(fs.statSync(root).isDirectory());
console.log('White goose asset tests passed');
```

- [ ] **Step 2: Run the asset test and verify failure**

Run: `node tools/test_white_goose_assets.cjs`

Expected: FAIL on the first missing target asset.

- [ ] **Step 3: Copy only approved binary assets**

Copy and rename the exact files below; do not copy the source directory wholesale:

```bash
mkdir -p assets/res/whiteGooseFeed
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/texture/ditu.jpg" assets/res/whiteGooseFeed/ditu.jpg
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/texture/ditulang.png" assets/res/whiteGooseFeed/ditulang.png
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/texture/de影子.png" assets/res/whiteGooseFeed/goose-shadow.png
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/texture/yuqn1.png" assets/res/whiteGooseFeed/ring-blue-bottom.png
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/texture/yuqn2.png" assets/res/whiteGooseFeed/ring-blue-top.png
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/texture/yuqn3.png" assets/res/whiteGooseFeed/ring-yellow-bottom.png
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/texture/yuqn4.png" assets/res/whiteGooseFeed/ring-yellow-top.png
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/texture/yuqn5.png" assets/res/whiteGooseFeed/ring-red-bottom.png
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/texture/yuqn6.png" assets/res/whiteGooseFeed/ring-red-top.png
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/spine/taodae.json" assets/res/whiteGooseFeed/taodae.json
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/spine/taodae.atlas" assets/res/whiteGooseFeed/taodae.atlas
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/spine/taodae.png" assets/res/whiteGooseFeed/taodae.png
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/spine/taodae2.png" assets/res/whiteGooseFeed/taodae2.png
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/spine/taoquanshou.json" assets/res/whiteGooseFeed/taoquanshou.json
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/spine/taoquanshou.atlas" assets/res/whiteGooseFeed/taoquanshou.atlas
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/sound/套大鹅背景音乐.mp3" assets/res/whiteGooseFeed/white-goose-bgm.mp3
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/sound/大鹅叫_01.mp3" assets/res/whiteGooseFeed/white-goose-call-1.mp3
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/sound/大鹅叫_02.mp3" assets/res/whiteGooseFeed/white-goose-call-2.mp3
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/sound/大鹅叫_03.mp3" assets/res/whiteGooseFeed/white-goose-call-3.mp3
cp "/Users/skyhand/Dev/Source/cocos/xxx/村口过庙会01_restore/assets/g_whitegoose/texture/照片.png" assets/res/newMain/preview_white_goose.png
```

Create Creator 3.8 image/audio/atlas/spine metadata with stable UUIDs. Image metadata uses the same `image`, `texture`, and `sprite-frame` schema as `assets/res/nailHammerFeed/*.meta`; atlas metadata uses importer `"*"`; each skeleton JSON uses importer `"spine-data"` and its matching `atlasUuid`. The two atlases intentionally share `taodae.png` and `taodae2.png` because that is how the source atlas pages are authored.

- [ ] **Step 4: Register the four audio clips**

Add these enum values and map them to the UUIDs in the new `.mp3.meta` files:

```ts
whiteGooseBgm = "whiteGooseBgm",
whiteGooseCall1 = "whiteGooseCall1",
whiteGooseCall2 = "whiteGooseCall2",
whiteGooseCall3 = "whiteGooseCall3",
```

```ts
[soundName.whiteGooseBgm]: "b87e7117-2101-541c-a09a-d9098dc1999f",
[soundName.whiteGooseCall1]: "29d5da10-dd9f-5055-a86e-bb35e3c94992",
[soundName.whiteGooseCall2]: "5f156231-244b-5544-a6ee-34214f17ea77",
[soundName.whiteGooseCall3]: "961f66b2-0c6a-59ec-a1fd-2110270be33d",
```

Use the same four deterministic UUIDs in the corresponding audio metadata so the registry and metadata are identical.

- [ ] **Step 5: Run the asset test and verify size/scope**

Run:

```bash
node tools/test_white_goose_assets.cjs
du -sh assets/res/whiteGooseFeed assets/res/newMain/preview_white_goose.png
```

Expected: test passes; only the approved asset list exists in `whiteGooseFeed` and the payload remains below the size of copying all source UI/reward assets.

- [ ] **Step 6: Commit the asset unit**

```bash
git add assets/res/whiteGooseFeed assets/res/whiteGooseFeed.meta assets/res/newMain/preview_white_goose.png assets/res/newMain/preview_white_goose.png.meta assets/scripts/gamePrefabMgr.ts tools/test_white_goose_assets.cjs
git commit -m "feat: import white goose gameplay assets"
```

### Task 3: Creator 3.8 Scene and Runtime Controller

**Files:**
- Create: `assets/scripts/whiteGooseFeedGameScene.ts`
- Create: `assets/scripts/whiteGooseFeedGameScene.ts.meta`
- Create: `tools/white_goose_authoring.mjs`
- Create: `tools/build_white_goose_scene.mjs`
- Create: `assets/gamescene/WhiteGooseFeedGameScene.scene`
- Create: `assets/gamescene/WhiteGooseFeedGameScene.scene.meta`
- Create: `tools/test_white_goose_scene.cjs`
- Create: `tools/test_white_goose_controller.cjs`

**Interfaces:**
- Consumes: `WhiteGooseRound`, imported SpriteFrames/SkeletonData, `AudioManager`, `FeedAcquisitionService`, `adc`, `SdkUtils`, `GameSceneBundle`.
- Produces: `@ccclass("whiteGooseFeedGameScene")`, an editor-bound `WhiteGooseFeedGameScene.scene`, and public scene name `WhiteGooseFeedGameScene` for later routing.

- [ ] **Step 1: Write failing serialized-scene and controller contract tests**

`tools/test_white_goose_scene.cjs` must parse the scene and assert:

```js
assert.equal(scene[0]._name, 'WhiteGooseFeedGameScene');
assert.equal(scene[1]._name, 'WhiteGooseFeedGameScene');
assert(nodeByName('Background'));
assert(nodeByName('GooseSlots'));
assert.equal(nodeByName('GooseSlots').entry._children.length, 10);
assert(nodeByName('ThrowingHand'));
assert(nodeByName('ThrownRingLayer'));
assert(nodeByName('ResultOverlay'));
assert(component(nodeByName('ResultOverlay').id, 'cc.BlockInputEvents'));
assert.equal(component(nodeByName('ResultDim').id, 'cc.Widget')._alignFlags, 45);
assert.deepEqual(
  [component(nodeByName('Canvas').id, 'cc.UITransform')._contentSize.width,
   component(nodeByName('Canvas').id, 'cc.UITransform')._contentSize.height],
  [750, 1624],
);
for (const name of ['BackButton', 'AddRingsButton', 'ReplayButton', 'RestartButton', 'ReviveButton', 'HomeButton', 'NextButton']) {
  assert(component(nodeByName(name).id, 'cc.Button'), `missing editor-authored button ${name}`);
}
```

`tools/test_white_goose_controller.cjs` must statically/transpiled-fixture check the behavior contracts:

```js
assert(source.includes('event.propagationStopped = true'), 'goose tap must not also hit the field');
assert(source.includes('private roundSerial = 0'));
assert(source.includes('serial !== this.roundSerial'));
assert(source.includes('this.round.beginThrow()'));
assert(source.includes('this.round.resolveThrow(caught)'));
assert(source.includes('AudioManager.playMusic(soundName.whiteGooseBgm)'));
assert(source.includes('AudioManager.playEffect(soundName.whiteGooseCall'));
assert(source.includes('SdkUtils.showRewardedVideo()'));
assert(source.includes('Tween.stopAllByTarget'));
assert(source.includes('setCompleteListener(null)'));
```

- [ ] **Step 2: Run the scene/controller tests and verify failure**

Run:

```bash
node tools/test_white_goose_scene.cjs
node tools/test_white_goose_controller.cjs
```

Expected: both fail because the scene and controller do not exist.

- [ ] **Step 3: Implement deterministic scene authoring**

Build with `SceneAuthor` from `tools/penguin_scene_authoring.mjs` and `fitFeedResultOverlay` from `tools/feed_result_layout.mjs`. Add a Spine helper that serializes the standard Creator 3.8 component shape:

```js
function skeleton(author, node, skeletonDataUuid, animation, loop = true) {
  return author.component(node, 'sp.Skeleton', {
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: rgba(255, 255, 255),
    _skeletonData: { __uuid__: skeletonDataUuid, __expectedType__: 'sp.SkeletonData' },
    defaultSkin: 'default',
    defaultAnimation: animation,
    _premultipliedAlpha: false,
    _timeScale: 1,
    _preCacheMode: 2,
    _cacheMode: 2,
    _sockets: [],
    _useTint: false,
    _debugMesh: false,
    _debugBones: false,
    _debugSlots: false,
    _enableBatch: false,
    loop,
  });
}
```

Author a 750×1624 canvas, cover background, safe-area HUD, 10 goose slot nodes at the source-relative positions scaled from 720-wide coordinates, the shared hand skeleton, three two-layer ring templates, field touch target, foreground, and success/failure result actions. Bind every referenced node/component on the controller. `build_white_goose_scene.mjs --write` writes the scene and scene metadata; a second build must be byte-identical.

- [ ] **Step 4: Implement the runtime controller with explicit state ownership**

Use these internal state boundaries:

```ts
type GooseState = {
  slot: Node;
  skeleton: sp.Skeleton;
  hitArea: Node;
  active: boolean;
  walking: boolean;
  pose: CatchablePose;
  direction: -1 | 1;
  walkRemaining: number;
};

type ScenePhase = "preview" | "playing" | "throwing" | "result" | "leaving";

private round = new WhiteGooseRound();
private phase: ScenePhase = "preview";
private roundSerial = 0;
private adInFlight = false;
private feedMode = false;
private feedEntered = false;
private feedExited = false;
```

Implement these concrete methods so each responsibility remains isolated:

```ts
private validateSceneBindings(): void;
private bindEvents(): void;
private resetRound(startPlaying?: boolean): void;
private activateRoundSlots(activeSlots: readonly number[]): void;
private updateGooseMotion(deltaTime: number): void;
private enterRandomPose(goose: GooseState): void;
private onGooseTouch(event: EventTouch, gooseIndex: number): void;
private onFieldTouch(event: EventTouch): void;
private beginThrow(target: GooseState | null, landing: Vec3): void;
private launchRing(target: GooseState | null, landing: Vec3, serial: number): void;
private resolveThrow(target: GooseState | null, ringColor: number, serial: number): void;
private playCaughtAnimation(goose: GooseState, ringColor: number, serial: number): void;
private refreshHud(): void;
private finishRound(success: boolean): void;
private watchAdForRings(revive: boolean): Promise<void>;
private reportFeedSceneReady(): Promise<void>;
private finishFeedExperience(): void;
private stopSceneTweensAndSpineListeners(): void;
```

The goose handler sets `event.propagationStopped = true` before `beginThrow`. Both goose and field paths call `round.beginThrow()` exactly once. The hand plays `reng`; its completion launches the selected ring. The ring tween ends at the goose or touch location; only then does `resolveThrow` call `isCatchSuccessful`, play a call effect on catch, and call `round.resolveThrow(caught)`.

Guard every asynchronous completion with a captured `serial = roundSerial`, `node.isValid`, and `phase !== "leaving"`. `resetRound` increments `roundSerial`, stops tweens/listeners, resets the pure model, and starts all selected geese in the source walking behavior.

- [ ] **Step 5: Implement result, audio, rewarded-video, and feed lifecycle behavior**

Match the established nail scene lifecycle:

```ts
protected start(): void {
  AudioManager.setSoundEvent();
  if (this.feedMode) {
    FeedAcquisitionService.addListener(this.onFeedStateChanged);
    void this.reportFeedSceneReady();
  } else {
    this.phase = "playing";
    AudioManager.playMusic(soundName.whiteGooseBgm);
  }
}
```

Reward success calls `round.grantRings(5)`; revive closes failure UI and resumes `playing`. A canceled ad only restores buttons and shows `完整看完广告才能增加套圈`. Feed preview renders the board but keeps `phase = "preview"`; the first real entered state calls `resetRound(true)` and schedules the existing feed-entry interstitial. Background/hide, foreground/show, exit, return home, and enter puzzle follow the same cancellation and single-session completion guarantees as `nailHammerFeedGameScene`.

- [ ] **Step 6: Generate scene twice and run tests**

Run:

```bash
node tools/build_white_goose_scene.mjs --write
cp assets/gamescene/WhiteGooseFeedGameScene.scene /tmp/WhiteGooseFeedGameScene.first.scene
node tools/build_white_goose_scene.mjs --write --replace-scene
cmp /tmp/WhiteGooseFeedGameScene.first.scene assets/gamescene/WhiteGooseFeedGameScene.scene
node tools/test_white_goose_scene.cjs
node tools/test_white_goose_controller.cjs
node tools/test_white_goose_rules.cjs
```

Expected: `cmp` is silent and all three tests pass.

- [ ] **Step 7: Commit the playable scene unit**

```bash
git add assets/scripts/whiteGooseFeedGameScene.ts assets/scripts/whiteGooseFeedGameScene.ts.meta assets/gamescene/WhiteGooseFeedGameScene.scene assets/gamescene/WhiteGooseFeedGameScene.scene.meta tools/white_goose_authoring.mjs tools/build_white_goose_scene.mjs tools/test_white_goose_scene.cjs tools/test_white_goose_controller.cjs
git commit -m "feat: build white goose gameplay scene"
```

### Task 4: Scene Bundle and New Main Menu Entry

**Files:**
- Modify: `assets/scripts/framework/GameSceneBundle.ts`
- Modify: `assets/scripts/newMainScene.ts`
- Modify: `tools/build_new_main_scene.mjs`
- Create: `tools/white_goose_main_card.mjs`
- Modify: `assets/gamescene/NewMainScene.scene`
- Modify: `tools/test_new_main_scene.cjs`

**Interfaces:**
- Consumes: `WhiteGooseFeedGameScene.scene` UUID and `preview_white_goose.png` SpriteFrame UUID.
- Produces: `GameSceneName.WhiteGooseFeedGame`, `newMainScene.whiteGooseButton`, and the eighth two-column lobby card.

- [ ] **Step 1: Extend the main-menu test first**

Change expected order and layout checks to:

```js
const expectedCards = [
  'PuzzleGameCard', 'PenguinStackCard', 'ShootingGlassBottlesCard', 'ArcheryCard',
  'NailHammerCard', 'BalloonWheelCard', 'FoodDeliveryCard', 'WhiteGooseCard',
];
assert.equal(contentTransform._contentSize.height, 1182, 'four complete rows must be scrollable');
assert.deepEqual(
  [nodeByName('WhiteGooseCard').entry._lpos.x, nodeByName('WhiteGooseCard').entry._lpos.y],
  [139, -1034],
);
assert(controller.whiteGooseButton, 'white goose controller binding is missing');
assert(visibleStrings.includes('套大鹅'), 'white goose title is missing');
```

Also assert `GameSceneBundle.ts` contains the new enum/UUID mapping and `newMainScene.ts` binds/unbinds the button.

- [ ] **Step 2: Run and verify the menu test fails**

Run: `node tools/test_new_main_scene.cjs`

Expected: FAIL because `WhiteGooseCard` and its binding do not exist.

- [ ] **Step 3: Register and bind the scene**

Add:

```ts
WhiteGooseFeedGame = "WhiteGooseFeedGameScene",
```

and map it to the UUID in `WhiteGooseFeedGameScene.scene.meta`. In `newMainScene.ts`, add `@property(Button) whiteGooseButton`, bind/unbind `openWhiteGoose`, include it in `gameButtons`, and implement:

```ts
private openWhiteGoose(): void {
  void this.enterGame(GameSceneName.WhiteGooseFeedGame);
}
```

- [ ] **Step 4: Append the editor-authored card without rebuilding unrelated cards**

Create `appendWhiteGooseCard(objects)` following the non-destructive `appendFoodDeliveryCard` pattern. It clones `PuzzleGameCard`, changes the node name to `WhiteGooseCard`, sets its artwork to `preview_white_goose.png`, replaces the title with an editor-authored Label containing `套大鹅`, places it at `[139, -1034]`, and sets `controller.whiteGooseButton` to the cloned Button reference. Update `build_new_main_scene.mjs` to call:

```js
appendFoodDeliveryCard(objects);
appendWhiteGooseCard(objects);
```

Both appenders must be idempotent. Preserve the current card order and current food-delivery changes.

- [ ] **Step 5: Regenerate and verify the main scene**

Run:

```bash
node tools/build_new_main_scene.mjs --write --replace-scene
node tools/test_new_main_scene.cjs
node tools/test_white_goose_scene.cjs
```

Expected: both tests pass and the scene has exactly eight cards in four rows.

- [ ] **Step 6: Commit the menu entry unit**

```bash
git add assets/scripts/framework/GameSceneBundle.ts assets/scripts/newMainScene.ts assets/gamescene/NewMainScene.scene tools/build_new_main_scene.mjs tools/white_goose_main_card.mjs tools/test_new_main_scene.cjs
git commit -m "feat: add white goose lobby entry"
```

### Task 5: Feed Direct-Play Routing and Analytics Name

**Files:**
- Modify: `assets/scripts/framework/Platform/FeedRevisitConfig.ts`
- Modify: `assets/scripts/loadScene.ts`
- Modify: `assets/scripts/framework/Platform/sdk/SdkUtils.ts`
- Modify: `tools/test_feed_integration.cjs`
- Create: `tools/test_white_goose_feed.cjs`

**Interfaces:**
- Consumes: `GameSceneName.WhiteGooseFeedGame` and controller feed lifecycle methods.
- Produces: `FEED_WHITE_GOOSE_CONTENT_ID = "xxx"`, load routing for direct play, and the SDK scene display name `套大鹅`.

- [ ] **Step 1: Add failing feed-route checks**

Extend the existing route cases:

```js
assert.equal(config.FEED_WHITE_GOOSE_CONTENT_ID, 'xxx');
const cases = [
  ['xxx', 'WhiteGooseFeedGameScene'],
  // retain every existing case unchanged
];
```

Create `tools/test_white_goose_feed.cjs` to assert the controller includes `reportSceneReadyAfterStableRender`, subscribes/removes `FeedAcquisitionService`, resets on the first real entered state, calls `adc.scheduleFeedEntryInterstitial`, guards preview interaction, and completes the session once.

- [ ] **Step 2: Run and verify feed tests fail**

Run:

```bash
node tools/test_feed_integration.cjs
node tools/test_white_goose_feed.cjs
```

Expected: FAIL because `FEED_WHITE_GOOSE_CONTENT_ID` and routing do not exist.

- [ ] **Step 3: Add the single temporary ID constant and route**

Add to `FeedRevisitConfig.ts`:

```ts
/** 套大鹅推荐流方案；后台正式 ID 创建前使用用户指定的临时值。 */
export const FEED_WHITE_GOOSE_CONTENT_ID = "xxx";
```

Import it in `loadScene.ts` and route before the unknown-ID fallback:

```ts
if (FEED_WHITE_GOOSE_CONTENT_ID && contentId === FEED_WHITE_GOOSE_CONTENT_ID) {
  return {
    sceneName: GameSceneName.WhiteGooseFeedGame,
    reason: `推荐流套大鹅方案（${contentId}）`,
  };
}
```

Add `WhiteGooseFeedGameScene: "套大鹅"` to the SDK scene-title map. Do not change revisit mode, which must keep its existing bottle-game fallback.

- [ ] **Step 4: Run feed and regression tests**

Run:

```bash
node tools/test_feed_integration.cjs
node tools/test_white_goose_feed.cjs
node tools/test_feed_revisit_disabled.cjs
node tools/test_repeating_interstitial.cjs
```

Expected: all tests pass, existing content IDs retain their scenes, and only direct-play content ID `xxx` selects the goose scene.

- [ ] **Step 5: Commit the feed routing unit**

```bash
git add assets/scripts/framework/Platform/FeedRevisitConfig.ts assets/scripts/loadScene.ts assets/scripts/framework/Platform/sdk/SdkUtils.ts tools/test_feed_integration.cjs tools/test_white_goose_feed.cjs
git commit -m "feat: route white goose feed entry"
```

### Task 6: Integrated Verification and Resource Cleanup

**Files:**
- Modify only if a verification failure identifies a defect in files from Tasks 1–5.

**Interfaces:**
- Consumes: the complete scene, controller, asset pack, menu entry, and feed route.
- Produces: a verified first version with no unused/reward files in `assets/res/whiteGooseFeed`.

- [ ] **Step 1: Run all feature tests together**

Run:

```bash
node tools/test_white_goose_rules.cjs
node tools/test_white_goose_assets.cjs
node tools/test_white_goose_scene.cjs
node tools/test_white_goose_controller.cjs
node tools/test_white_goose_feed.cjs
node tools/test_new_main_scene.cjs
node tools/test_feed_integration.cjs
node tools/test_feed_audio.cjs
node tools/test_repeating_interstitial.cjs
```

Expected: every command exits 0.

- [ ] **Step 2: Run TypeScript compilation with Creator’s generated config**

Run:

```bash
/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```

Expected: exit 0. If pre-existing unrelated errors occur, record them separately and verify no error names `whiteGooseFeedGameScene.ts` or `whiteGooseRoundRules.ts`.

- [ ] **Step 3: Audit references and payload**

Run:

```bash
rg -n "Antique|LuckyBox|ScoreDialog|ShareDialog|ReplenishDialog|GameData|rewardCoins|taskList" assets/scripts/whiteGooseFeedGameScene.ts assets/res/whiteGooseFeed tools/white_goose_authoring.mjs
find assets/res/whiteGooseFeed -type f | sort
du -sh assets/res/whiteGooseFeed assets/res/newMain/preview_white_goose.png
```

Expected: the dependency search prints nothing; the file list contains only Task 2’s approved runtime assets and metadata.

- [ ] **Step 4: Perform Creator/manual acceptance checks**

Open the project in Creator 3.8.5 and verify:

1. `WhiteGooseFeedGameScene.scene` opens without missing-script or missing-Spine warnings.
2. At 750×1334, 750×1624, and a taller simulator size, the background covers proportionally, the result dim fills the canvas, and safe-area buttons remain reachable.
3. A goose tap consumes one ring; an empty-field tap consumes one ring; repeated touch while throwing consumes none.
4. Walking/`s1` geese evade, valid poses can be caught, caught geese play colored-ring animation and disappear.
5. Ring exhaustion shows failure; completed rewarded video grants five and preserves caught geese; cancel grants none; restart resets to ten.
6. Seven catches show success; replay, enter puzzle, and return work.
7. Main-menu entry and feed content ID `xxx` both load the scene; feed preview is inert and formal entry starts a fresh round.
8. Music/effect switches, app hide/show, rewarded video, scene exit, and button sounds behave consistently with the other minigames.

- [ ] **Step 5: Review the final diff for unrelated changes**

Run:

```bash
git status --short
git diff --check
git diff --stat HEAD~5..HEAD
```

Expected: no whitespace errors; only intended goose files plus the explicitly listed shared routing/menu/audio files are part of this feature’s commits. Existing unrelated user changes remain untouched.

- [ ] **Step 6: Commit verification-only fixes if any were required**

If Steps 1–5 required source corrections, stage only the affected goose/shared files and commit:

```bash
git commit -m "fix: finalize white goose game integration"
```

If no correction was needed, do not create an empty commit.
