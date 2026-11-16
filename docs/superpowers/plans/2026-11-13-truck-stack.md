# Truck Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Independent art/rule implementation can use dispatching-parallel-agents with disjoint files.

**Goal:** 新增视频风格的货车无尽叠箱推荐流。

**Architecture:** 纯规则状态机与 Cocos 控制器分离。离线 authoring 生成固定 UI、共享结算和大厅卡片；精简 PNG 资源及 Graphics 动态绳索/粉尘。复用推荐流生命周期与广告服务。

**Tech Stack:** Cocos Creator 3.8.5、TypeScript、Node 离线 authoring。

**Spec:** docs/superpowers/specs/2026-11-13-truck-stack-design.md

## Global Constraints
- kdzzz，保留所有已有内容/广告 ID；新增 xx；不构建/上传/提交。
- 新增素材+场景+源码控制在 1 MB，最终构建大小交用户核验。
- 插屏不主动暂停。预览动画和 getUserBgm 保持。
- 全屏结算和 750×1334、750×1624 安全边距。

## Review Focus
- 掉帧/长帧不穿过支撑面或跳过失败；重复点击只落一次。
- 无限堆叠不持续积累状态/节点；镜头和摆幅始终允许落点可达。
- 推荐流 preload 收到退出事件后仍能报告就绪，首次触摸正常激活。
- 广告关闭/失败/离开场景不误发奖励、不遗留忙状态。
- 长短屏按钮不与场地重叠、不低于安全边距，结果遮罩真正阻止输入。

### Task 1: 规则与单元测试
Files: assets/scripts/truckStackRules.ts(+meta), tools/test_truck_stack_rules.cjs.
Produces: BOX_WIDTH=276, BOX_HEIGHT=124, MAX_VISIBLE_BOXES=18; TruckStackRound with boxes, activeBox, pivot, phase, height, slowRemaining, tick(dt), drop(), slowDown(), revive(), drainEvents(). Coordinates: x around0, deck y=0, box y=center. Expose activeBox and pivot readonly by convention, finite numeric fields. Phase swinging/dropping/settling/falling/failure; events land/perfect/failure.
- [x] Write behavioral tests then observe failure.
- [x] Implement fixed step motion, support/tip, capped difficulty, slowdown, revival, state bound.
- [x] Run deterministic frame-rate/edge/long-run tests.

### Task 2: 小体积美术
Files: tools/truck_stack_ids.mjs, tools/build_truck_stack_assets.mjs, assets/res/truckStackFeed(+meta).
Produces: truck.png (640×228), box.png (276×124), cloud.png (220×86), lobby.png (436×354), stable UUIDs via truckStack namespace. All PNG alpha with no text; truck flatbed deck at local image (240,45), facing right; box rectangle fills image. Export SCENE_UUID and uuid(name).
- [x] Create vector source in authoring script, render PNG plus correct Cocos metadata.
- [x] Inspect reference and generated images; confirm combined resources under 150 KB.

### Task 3: 控制器与场景
Files: assets/scripts/truckStackFeedGameScene.ts(+meta), tools/truck_stack_authoring.mjs, tools/build_truck_stack_scene.mjs, assets/gamescene/TruckStackFeedGameScene.scene(+meta).
Consumes Task1/2. Controller renders sprite pool, rope/effects, manages score persistence/feed/reward lifecycle. Scene uses serialized buttons/result/audio/UI.
- [x] Write behavior tests for lifecycle, drop input, rewards, stale callbacks, best, replay and no interstitial pause; observe initial failure.
- [x] Implement controller and scene, integrate shared result layout with TruckStackFeedGameScene entries.
- [x] Run tests plus scene integrity/sizing checks on both design heights.

### Task 4: 注册与回归
Files: assets/scripts/framework/GameSceneBundle.ts, assets/scripts/framework/Platform/FeedRevisitConfig.ts, assets/scripts/loadScene.ts, assets/scripts/framework/Platform/sdk/SdkUtils.ts, assets/scripts/newMainScene.ts, assets/gamescene/NewMainScene.scene, tools/build_new_main_scene.mjs, tools/test_new_main_scene.cjs, tools/test_truck_stack_integration.cjs.
- [x] Wire scene UUID, placeholder route, feed analytics, lobby button/card and regeneration.
- [x] Test scene/lobby/routing registration and source-based preview via controller mocks.
- [x] Run relevant existing feed/result/lobby/interstitial tests, typecheck, idempotent generation, git diff check and footprint report.
- [x] Fresh independent final code review; fix substantive findings. No build, upload or commit.

## Verification record

- Core: 12 deterministic rules cases including 2,200 placements, controller reward/lifecycle/pause/preview cases, registration/resource/layout checks.
- Shared regression: lobby, full-screen result authoring/presentation, screen layout, startup resolution, feed routing, retired entries, revisit disable, audio recovery, repeating interstitial (21 cases), ad attribution (11 cases).
- Corrected stale test expectations: xx now routes to truck; registry/lobby tests include existing rope/brick plus truck; retired archery sound stays absent (already removed at HEAD).
- Independent code review found native BGM recovery and destroyed-child cleanup issues; both reproduced then fixed with regression coverage.
- Source preview at 750×1334 and 750×1624 covers opening, six-box stack, failure and pause. Fixed truck clipping, pause HUD overlap, and rope/header spacing.
- TypeScript noEmit check uses Creator 3.8.5 compiler with skipLibCheck. No app build, upload or commit.
- Implementation choices within agreed scope: 20s half-speed reward; shared rope-duck short cues; light custom motion/collision and bounded 18-box pool.
- Remaining user-side validation: actual built bundle increment, native audio and Douyin ad callbacks/first-entry behavior on device.
