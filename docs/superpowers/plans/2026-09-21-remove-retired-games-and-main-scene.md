# Retired Games and Legacy Main Scene Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the straw, pen-refill, and legacy-main features completely while preserving shared assets and keeping the current lobby and surviving games valid.

**Architecture:** Remove the three scene/controller surfaces from the scene bundle and route tables, prune the two retired cards from the editor-authored lobby, and retain one cross-game back-button asset under a neutral shared path with its UUID unchanged. Update authoring tools and tests so deleted template scenes and legacy entries are no longer dependencies.

**Tech Stack:** Cocos Creator 3.8.5, TypeScript, serialized `.scene` JSON, Node.js verification scripts.

**Spec:** `docs/superpowers/specs/2026-09-21-remove-retired-games-and-main-scene.md`

## Global Constraints

- Preserve all unrelated user changes in the dirty worktree.
- Keep `NewMainScene` as `GameSceneName.Main` and as the loading page's normal destination.
- Preserve the shared back-button UUID exactly; only its asset path changes.
- Delete only assets proven to have no surviving reference.
- Do not add runtime layout code; the six-card lobby remains editor-authored.

## Review Focus

- An old milk-tea or pen Content ID must hit the existing unknown-ID shooting fallback, not a missing scene.
- Removing serialized card subtrees must not leave invalid `__id__` references.
- The six remaining cards must form three complete rows with no gap left by the removed cards.
- Balloon and nail scenes must keep a valid back-button sprite after the milk-tea resource folder is removed.
- Scene-authoring tools must not read deleted scenes or write the deleted legacy main scene.

---

### Task 1: Add a failing retirement guard

**Files:**
- Create: `tools/test_retired_games_removed.cjs`

**Interfaces:**
- Consumes: project files and serialized scenes.
- Produces: a single offline regression command that proves the retired surfaces are absent and shared references are intact.

- [ ] **Step 1: Write the failing test**

Create a Node assertion script that checks the exact removals and the six-card lobby:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const absent = [
  'assets/gamescene/MainScene.scene',
  'assets/gamescene/MilkTeaFeedGameScene.scene',
  'assets/gamescene/PenRefillFeedGameScene.scene',
  'assets/scripts/mainScene.ts',
  'assets/scripts/milkTeaFeedGameScene.ts',
  'assets/scripts/penRefillFeedGameScene.ts',
];
for (const file of absent) assert.equal(fs.existsSync(file), false, `${file} must be removed`);

const bundle = fs.readFileSync('assets/scripts/framework/GameSceneBundle.ts', 'utf8');
for (const token of ['LegacyMain', 'MilkTeaFeedGame', 'PenRefillFeedGame']) {
  assert(!bundle.includes(token), `${token} remains in GameSceneBundle`);
}

const scene = JSON.parse(fs.readFileSync('assets/gamescene/NewMainScene.scene', 'utf8'));
const content = scene.find(item => item?.__type__ === 'cc.Node' && item._name === 'Content');
const names = content._children.map(ref => scene[ref.__id__]._name);
assert.deepEqual(names, [
  'PuzzleGameCard', 'PenguinStackCard', 'ShootingGlassBottlesCard',
  'ArcheryCard', 'NailHammerCard', 'BalloonWheelCard',
]);
assert(!scene.some(item => ['MilkTeaCard', 'PenRefillCard'].includes(item?._name)));

const sharedMeta = JSON.parse(fs.readFileSync(
  'assets/res/texture/UIs/feed_back_button.png.meta', 'utf8'));
assert.equal(sharedMeta.uuid, '8f6b54c1-3b72-4cf3-8a36-a5d9f6e4c721');
for (const file of [
  'assets/gamescene/BalloonWheelFeedGameScene.scene',
  'assets/gamescene/NailHammerFeedGameScene.scene',
]) {
  assert(fs.readFileSync(file, 'utf8').includes(`${sharedMeta.uuid}@f9941`));
}
```

- [ ] **Step 2: Run the guard and verify it fails**

Run: `node tools/test_retired_games_removed.cjs`

Expected: failure because the three scenes/controllers and retired cards still exist.

### Task 2: Remove runtime routes and controller bindings

**Files:**
- Modify: `assets/scripts/framework/GameSceneBundle.ts`
- Modify: `assets/scripts/framework/Platform/FeedRevisitConfig.ts`
- Modify: `assets/scripts/loadScene.ts`
- Modify: `assets/scripts/framework/Platform/sdk/SdkUtils.ts`
- Modify: `assets/scripts/newMainScene.ts`

**Interfaces:**
- Consumes: existing unknown Content ID fallback in `loadScene.resolveFeedEntry()`.
- Produces: a runtime scene enum and lobby controller containing only surviving scenes.

- [ ] **Step 1: Remove the three scene enum members and UUID records**

Delete `LegacyMain`, `MilkTeaFeedGame`, and `PenRefillFeedGame` from `GameSceneName` and `GAME_SCENE_UUIDS`. Keep:

```ts
export enum GameSceneName {
  Main = "NewMainScene",
  Game = "GameScene",
  ShootingGlassBottles = "ShootingGlassBottlesGame",
  ArcheryGame = "ArcheryGameScene",
  JuggleBallGame = "JuggleBallGameScene",
  NailHammerFeedGame = "NailHammerFeedGameScene",
  BalloonWheelFeedGame = "BalloonWheelFeedGameScene",
  PenguinStackFeedGame = "PenguinStackFeedGameScene",
}
```

- [ ] **Step 2: Remove retired Content IDs and routes**

Delete `FEED_MILK_TEA_CONTENT_ID` and `FEED_PEN_REFILL_CONTENT_ID`, their imports, and their two `resolveFeedEntry()` branches. Do not add replacements; unknown IDs continue to return `GameSceneName.ShootingGlassBottles`.

- [ ] **Step 3: Remove retired analytics names**

Delete `MainScene`, `MilkTeaFeedGameScene`, and `PenRefillFeedGameScene` from `AD_FEED_TYPES`; retain `NewMainScene: "玩法大厅"`.

- [ ] **Step 4: Remove retired NewMain controller properties and callbacks**

Delete `milkTeaButton`, `penRefillButton`, their listener registration/removal, `openMilkTea()`, `openPenRefill()`, and both entries from `gameButtons`.

- [ ] **Step 5: Transpile the changed TypeScript files**

Run a targeted `typescript.transpileModule` check for the five modified files using Creator's bundled TypeScript. Expected: zero diagnostics with category `Error`.

### Task 3: Prune editor-authored cards and delete assets safely

**Files:**
- Modify: `assets/gamescene/NewMainScene.scene`
- Modify: `tools/build_new_main_scene.mjs`
- Move: `assets/res/milkTeaFeed/back-button.png` to `assets/res/texture/UIs/feed_back_button.png`
- Move: `assets/res/milkTeaFeed/back-button.png.meta` to `assets/res/texture/UIs/feed_back_button.png.meta`
- Delete: retired scene/controller files and their `.meta` files
- Delete: `assets/res/milkTeaFeed.meta`, remaining `assets/res/milkTeaFeed/*`
- Delete: `assets/res/penRefillFeed.meta`, `assets/res/penRefillFeed/*`
- Delete: four retired `assets/res/newMain` card images and their `.meta` files
- Delete: four old-main-only images and their `.meta` files

**Interfaces:**
- Consumes: existing serialized NewMain layout and shared back-button UUID.
- Produces: a six-card editor-authored lobby and no retired binary payload.

- [ ] **Step 1: Update the NewMain authoring source**

Remove the four retired image declarations/art bindings, the two card definitions, and the two controller bindings. Change the template scene to `ArcheryGameScene` and serialize content height `888` for three rows:

```js
const sourceScene = JSON.parse(
  fs.readFileSync('assets/gamescene/ArcheryGameScene.scene', 'utf8'),
);
// Content: 3 * 268 + 2 * 26 + 18 + 14 = 888
```

After the removals, bind `nailHammerButton` to `cards[4]` and `balloonWheelButton` to `cards[5]`.

- [ ] **Step 2: Mechanically prune only the two card subtrees from the current scene**

Create `/private/tmp/prune_new_main_cards.mjs` with the following transform, then run it from the project root. It preserves all unrelated editor-authored objects and values:

```js
import fs from 'node:fs';

const file = 'assets/gamescene/NewMainScene.scene';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const removed = new Set();
const nodeId = name => data.findIndex(item => item?.__type__ === 'cc.Node' && item._name === name);
const contentId = nodeId('Content');
if (contentId < 0) throw new Error('NewMainScene Content node is missing');

function collectNode(id) {
  if (removed.has(id)) return;
  const node = data[id];
  if (node?.__type__ !== 'cc.Node') throw new Error(`Expected node at ${id}`);
  removed.add(id);
  for (const child of node._children ?? []) collectNode(child.__id__);
  for (const component of node._components ?? []) removed.add(component.__id__);
}

const retired = new Set(['MilkTeaCard', 'PenRefillCard']);
const content = data[contentId];
for (const child of content._children) {
  if (retired.has(data[child.__id__]?._name)) collectNode(child.__id__);
}
content._children = content._children.filter(child => !removed.has(child.__id__));

const controller = data.find(item =>
  item && Object.hasOwn(item, 'puzzleButton') && Object.hasOwn(item, 'gameList'));
if (!controller) throw new Error('newMainScene controller is missing');
delete controller.milkTeaButton;
delete controller.penRefillButton;

const contentTransform = content._components
  .map(component => data[component.__id__])
  .find(component => component.__type__ === 'cc.UITransform');
contentTransform._contentSize.height = 888;
content._children.forEach((child, index) => {
  const column = index % 2;
  const row = Math.floor(index / 2);
  data[child.__id__]._lpos.x = column === 0 ? -139 : 139;
  data[child.__id__]._lpos.y = -152 - row * 294;
});

const remap = new Map();
const next = [];
for (let oldId = 0; oldId < data.length; oldId++) {
  if (removed.has(oldId)) continue;
  remap.set(oldId, next.length);
  next.push(data[oldId]);
}
function rewrite(value) {
  if (Array.isArray(value)) return value.forEach(rewrite);
  if (!value || typeof value !== 'object') return;
  if (Number.isInteger(value.__id__)) {
    if (!remap.has(value.__id__)) throw new Error(`Dangling reference to ${value.__id__}`);
    value.__id__ = remap.get(value.__id__);
    return;
  }
  Object.values(value).forEach(rewrite);
}
next.forEach(rewrite);
fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
```

Run: `node /private/tmp/prune_new_main_cards.mjs`

- [ ] **Step 3: Move the shared back button without changing its metadata UUID**

Move the PNG and `.meta` pair to `assets/res/texture/UIs/feed_back_button.png`, then assert the metadata UUID remains `8f6b54c1-3b72-4cf3-8a36-a5d9f6e4c721`.

- [ ] **Step 4: Delete the exact retired files**

Delete the three scene/controller pairs and metadata; delete exclusive milk-tea/pen art, retired NewMain thumbnails/titles, and the four old-main-only images listed in the spec. Do not delete any file whose UUID appears in a surviving scene.

- [ ] **Step 5: Run the retirement guard**

Run: `node tools/test_retired_games_removed.cjs`

Expected: PASS.

### Task 4: Repair authoring tools and regression tests

**Files:**
- Modify: `tools/build_balloon_scene.mjs`
- Modify: `tools/build_penguin_scene.mjs`
- Modify: `tools/build_nail_scene.mjs`
- Modify: `tools/test_new_main_scene.cjs`
- Modify: `tools/test_feed_integration.cjs`
- Modify: `tools/test_feed_audio.cjs`
- Modify: `tools/test_ad_analytics.cjs`
- Modify: `tools/test_repeating_interstitial.cjs`
- Modify: `tools/test_feed_revisit_disabled.cjs`
- Modify: `tools/test_penguin_stack_feed.cjs`
- Modify: `tools/test_balloon_feed.cjs`
- Modify: `tools/preview_balloon_feed.cjs`
- Modify: `tools/preview_penguin_stack_feed.cjs`
- Modify: `tools/preview_penguin_feed_startup.cjs`
- Delete: `tools/test_main_menu.cjs`

**Interfaces:**
- Consumes: `NewMainScene`, its `newMainScene` component, and surviving game scenes.
- Produces: authoring/test utilities with no dependency on deleted files.

- [ ] **Step 1: Replace deleted template scene dependencies**

Use `assets/gamescene/ArcheryGameScene.scene` as the camera/global template in balloon, penguin, nail, and NewMain builders. Point balloon's shared back asset lookup to `assets/res/texture/UIs/feed_back_button.png`.

- [ ] **Step 2: Remove all legacy-main entry injection**

Delete `addMainEntry()` / `addEntryToMainScene()` functions and their calls from the three scene builders. These builders must write only their own scene and metadata.

- [ ] **Step 3: Update tests to the surviving scene/card set**

Change all expected lists to omit the two retired games and `MainScene`, assert `NewMainScene`, six cards, five extracted preview JPGs, and no `LegacyMain`. Remove the old-home-specific cases from `test_feed_revisit_disabled.cjs`; preserve its service-level revisit checks.

- [ ] **Step 4: Update browser preview entry code**

Wait for `NewMainScene`, obtain `newMainScene`, and call the surviving `openPenguin()` or `openBalloonWheel()` entry methods instead of accessing `mainScene`.

- [ ] **Step 5: Scan for residual references**

Run:

```bash
rg -n '\b(MainScene|mainScene|MilkTeaFeedGameScene|milkTeaFeedGameScene|PenRefillFeedGameScene|penRefillFeedGameScene)\b|CONTENT14484635394|CONTENT14615823362' \
  assets settings tools
```

Expected: no retired runtime/tool references. Mentions in this dated plan/spec are documentation only.

### Task 5: Verify the cleaned project

**Files:**
- Test: `tools/test_retired_games_removed.cjs`
- Test: existing Node-side regression scripts
- Build: Cocos Creator web-mobile output

**Interfaces:**
- Consumes: the fully cleaned project.
- Produces: evidence that the removal did not break serialization, routing, tests, or build.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node tools/test_retired_games_removed.cjs
node tools/test_new_main_scene.cjs
node tools/test_feed_integration.cjs
node tools/test_feed_audio.cjs
node tools/test_ad_analytics.cjs
node tools/test_repeating_interstitial.cjs
node tools/test_feed_revisit_disabled.cjs
node tools/test_penguin_stack_feed.cjs
node tools/test_balloon_feed.cjs
```

Expected: every command exits `0`.

- [ ] **Step 2: Validate scene references and UUID uniqueness**

Run an offline JSON traversal over every surviving `.scene` to assert all `__id__` values are in range and every `_id` is unique within its scene.

- [ ] **Step 3: Build web-mobile**

Run the project's established Cocos Creator 3.8.5 web-mobile build command. Expected build log: `build success`; Creator's known process exit code is interpreted from the log rather than the numeric code alone.

- [ ] **Step 4: Final reference and size audit**

Confirm the retired files are absent, the shared back button is present once, the two old Content IDs are absent, and report the deleted byte total from the removed images/scenes/scripts.
