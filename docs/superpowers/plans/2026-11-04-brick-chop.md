# Brick Chop Implementation Plan
> **For agentic workers:** Use superpowers:executing-plans inline, with a final fresh review.
**Goal:** Add the confirmed brick chopping feed game.
**Architecture:** Pure round model + Cocos controller + repeatable asset/scene authors; shared lifecycle/audio/ad/results.
**Tech Stack:** Cocos Creator 3.8.5, TypeScript, node/sharp, built-in imagegen.
**Spec:** docs/superpowers/specs/2026-11-04-brick-chop-design.md

## Global Constraints
12 bricks / 3 chances; CONTENT15740674562 feed ID; no rank/levels/skip; getUserBgm; no archeryShoot; full-screen shared results; no interstitial pause; both viewport heights; bottom ≥80; no unrelated deletion.

## Review Focus
- Taps during strike or reward cannot deduct/grant twice.
- Rewards after replay/exit/destroy cannot mutate a new round.
- No premature result before the final strike animation.
- Hidden/background feed cannot consume chances or emit effects.
- Added routing, lobby, analytics and authoring regeneration remain in sync.

## Tasks
- [x] 1. Create brickChopRules.ts and test_brick_chop_rules.cjs; demonstrate failure before implementing strength mapping, locked strike, settle/reward/reset.
- [x] 2. Generate background/brick/hand; build_brick_chop_assets.mjs writes small assets and stable metadata. Inspect output before scene.
- [x] 3. Create brick_chop_authoring.mjs/build_brick_chop_scene.mjs, brickChopFeedGameScene.ts; adapt verified duck lifecycle with strike/fragment/gauge rendering; controller tests.
- [x] 4. Register scene, CONTENT15740674562 route, analytics and append lobby card. Maintain build_new_main_scene and shared result layout. Integration checks.
- [x] 5. Typecheck, Web/ByteDance build, browser preview at both sizes. Check input, outcomes, audio, controls, returns, file-size delta.
- [x] 6. Fresh final review, fix material findings; report delivered behavior and device limitations.

## Ledger
- User confirmed requirements in four replies on 2026-11-04. Current dirty workspace retained; no automatic commit or upload.
- Ruling: previous penguin-specific quota applies to prior duck replacement; new game kept small with shared assets and one repeated brick.

- Final review found and fixed preview power transfer on first entry and terminal hit-message visibility. Regression checks failed before fixes and passed afterward; independent recheck confirmed both.
- Web/ByteDance builds succeeded; new image payload 96,939 bytes; total native package delta 149,531 bytes (146.03 KiB), below user 1 MB cap. No commit, upload or publication.

- 2026-11-04 力量感反馈：完成 windup/impact hold/逐层劈开、10 对碎片与 2 整砖对应、碎片行距回归、短合成音效和双短震动（强命中）。未改变玩法命中规则。
- 新一轮规则/反馈/控制器/集成、背景音乐去重、双尺寸真实 Web 验证通过；Web/ByteDance 重建成功。最新累计包体增量 183,857 字节（179.55 KiB），包含 26,990 字节新增音效。真机触感待用户体验。

## 旧版剩余比例判定（2026-11-04，后续澄清后废弃）
- [x] 以当前剩余砖数乘力度比例向下取整替代固定块数伤害；98% 清空门槛应用于每次出掌，保留 12 砖/3 次。
- [x] 先复现剩 2 块、20% 力度错误破砖，再完成修复；覆盖剩 1/2 块、98% 边界、10→2→1→0 连续命中及最后一次机会胜利。
- [x] Web/小游戏重建成功；浏览器实测 12→2→2→1→1→0，覆盖 20% 劈空、50% 劈 1 块、低于 98% 最后一块劈空、98% 清空成功。双尺寸与结算检查通过。

## 固定原始层阈值（2026-11-04 最终确认）
- [x] 每层固定门槛，不按剩余砖数重新缩放；前 11 层分别要求 > 层号/12，最后一层 >=95%。扣除已经劈掉的层数，仅命中本次可达范围内尚未破碎的砖。
- [x] 先用“剩 2 块、50% 力度必须劈空”复现旧版错误，再修复。覆盖各层严格阈值边界、95% 双向采样、重复/较弱力度劈空，以及耗尽次数失败和末次机会成功。
- [x] Web/小游戏均 build success；浏览器实测固定层阈值连续出掌与 95% 清空、双尺寸及结算通过。

## 最后一层门槛上调（2026-11-04）
用户要求最后一层由 >=95% 改为 >=98%；前 11 层固定阈值与原始层位置规则不变。旧版 95% 记录由本节取代。
规则回归先验证旧版在 97.9999% 提前清空，再修复通过；确认 95% 不能劈最后一块，98% 在上升/下降两侧均可清空。规则/反馈/控制器/集成测试、TypeScript、真实浏览器固定层阈值连续出掌检查均通过。Web/小游戏重新构建成功，未上传发布，无新增资源。

## 正式推荐流 ID 与插屏核对（2026-11-04）
- 劈砖推荐流 ID 由 xx 替换为 CONTENT15740674562，加载页路由进入 BrickChopFeedGameScene；旧占位符不再路由劈砖。共用插屏已在场景 start/进入/退出生命周期接入，未再增加独立广告计时器。
- 使用项目现有 ByteDance 插屏广告位。首次请求同时满足应用启动 31 秒、进入推荐流至少 2 秒及场景就绪；预览不请求，关闭全屏广告后间隔 60 秒再次请求，失败重试也等待 60 秒，无次数上限。插屏不主动暂停游戏，激励仍使用原有暂停流程。
- test_feed_integration 4 项、test_repeating_interstitial 19 项（含正式劈砖 ID 的就绪/重复/失败重试/退出用例）、test_ad_analytics 11 项以及劈砖控制器/资源集成、TypeScript 检查通过。SDK 模拟验证插屏不改暂停、音频、触摸拦截状态。
- Web 与小游戏均 build success。真实广告库存/展示仍需抖音真机验证；未上传发布或更改平台后台配置。
