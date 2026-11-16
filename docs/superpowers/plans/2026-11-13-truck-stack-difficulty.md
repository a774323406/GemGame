# Truck Stack Difficulty Implementation Plan

> Use the existing rule/controller separation; implement with regression tests and one final review. No app build or commit.

**Goal:** 第5箱起加难，20米明显变难，增加悬吊倾斜和真实箱堆轻晃，并提高初始吊点。

**Spec:** docs/superpowers/specs/2026-11-13-truck-stack-difficulty.md

**Architecture:** Pure fixed-step rules own all moving coordinates; controller renders the rotated attachment and supplies a viewport-dependent rig lift. Existing authored HUD is compacted to make room. No new engine or media dependencies.

## Global constraints
- Preserve kdzzz IDs, shared ads, no interstitial pause, 20s rewarded half speed, revival and memory bound.
- No build/upload; preserve uncommitted work and use current branch.
- Source previews and layouts at 750×1334 and 750×1624.

## Tasks
1. Rules (`truckStackRules.ts`, rules test): configurable constructor rigLift; staged periods, rotation, actual moving support; fixed layer sway, continuous landing/rest state and bounded data. Behavioral tests must include actual contact outcomes and long-run/revive/preview rather than parameter snapshots alone.
2. Controller (`truckStackFeedGameScene.ts`, controller test): calculate rigLift to put initial pivot at y325 from screen top, use it on replay; camera derives target from rules pivot; rotate rope attachment; preserve small impact follow. Test both sizes, rotated end and old lifecycle/reward cases.
3. Authored scene (`truck_stack_authoring.mjs`, scene): title and score above250, best/hint row260–300; preserve bottom button/ad badge and result. Regenerate serialized scene, verify authoring parity.
4. Verification: current rules/controller/integration, feed results and repeating interstitial regressions, TypeScript noEmit, source preview at first/6th/20th box and extreme swing. Independent review for actual support/visible pose consistency, frame rate, bounded memory and safe layout. Fix any substantive findings and rerun affected checks.

## Review focus
- Visual tilt must retain the same release centre and correct top attachment.
- Stack movement cannot be decorative-only or make old boxes jump when a new layer lands.
- The new high rig must not overlap HUD or hide the truck on short screens.
- Preview/reward pauses preserve timing and no extra per-frame allocations accumulate in long sessions.

## Verification record — 2026-11-13
- Rules: 19 behavioral checks passed, including moving-support contact outcomes, continuous landing/sway, 30/60/144 Hz and variable frames, reward/preview timing, and 2,200 real placements with at most 18 retained boxes/rest entries.
- Controller and scene integration: passed; initial pivot is 325 design units below the top at both portrait sizes, rope ends at the rotated box attachment, and existing replay/revive/preview/music/interstitial behavior remains covered.
- Shared regressions: feed result layout/presentation and all 21 repeating-interstitial checks passed.
- TypeScript `--noEmit --pretty false --skipLibCheck` and `git diff --check`: passed. No Cocos build, upload or commit.
- Source-rendered previews: opening, six boxes, twenty boxes, both swing extremes, failure and return menu at 750×1334 and 750×1624; no observed HUD/rope overlap or held-box clipping. These are source previews, not a device run.
- Resource check: no added art/audio/dependency for this difficulty change; current new-game runtime inputs total 221,782 bytes, including 20,206 bytes of media. Final packaged increment remains subject to the user's build.
- Independent final review: no material findings. Reviewer independently reran rules/controller/integration checks, verified source-preview hashes and scene/authoring parity, and probed fractional-step moving-support contact plus high-tier drop/revive continuity. Ready for the user's device build and feel validation.

## Follow-up: higher rig and side HUD
- User screenshot requests a higher rope/box and permits removing the title and moving the metres to the side. Raised the target pivot from 325 to 120 units below the top; shared the target constant between initial rig calculation and camera tracking, with 10 units of spawn/resize camera slack.
- Removed the gameplay title; moved current/best metres beside the back button at top left, leaving top right for native controls. Cleared persistent hint copy while retaining timed feedback/errors above the slowdown button. Authored scene regenerated from the updated authoring source; result/return overlays remain unchanged.
- Existing controller rig assertion failed against the previous layout, then passed after the update. Controller, scene/authoring integration, shared result-layout checks, TypeScript noEmit and diff checks all pass.
- Inspected source previews at both portrait sizes, including extreme swing, release and return/result states. HUD and raised rope/box do not overlap in the inspected states. Current runtime inputs 220,472 bytes, media still 20,206 bytes; no new media, Cocos build, upload or commit.

## Follow-up: offscreen anchor with box raised
- Clarified with user: the box must move up with the anchor, rather than only extending the drawn cord. Set target anchor to 30 units above the screen; removed the black fixed-point circle.
- The rules' 1100 rig-height limit initially left the anchor slightly visible. Initializing cameraY from the difference between actual and requested rig height, and allowing the same signed camera target thereafter, places the real anchor at -30 from the first frame without changing physics constants.
- Raising the box crossed the previous score area. Moved the left HUD group below the suspended swing region (back top340, metres top338, best top396), preserving the existing buttons and feedback flows. Regenerated scene from authoring.
- Verification: expected offscreen-anchor regression first failed, then controller and integration passed at 750×1334/1624. Initial anchor measured exactly -30 on both; 25-box camera following, replay, reward/preview lifecycle, type checks, shared result-layout checks and diff checks passed. Inspected updated source previews; no build/upload/commit performed.

## Follow-up: restore top-left HUD and lengthen cord
- User explicitly corrected the HUD location: restored back top80, metres top78 and best top136 in authoring and regenerated the scene. Keep this group at top left in subsequent work.
- User also requested ~25% more cord: length 220→275. Kept horizontal reach220 as a separate value; derived the vertical arc from the longer cord and updated its analytic vertical velocity. Swing timing, horizontal reach and the 35% throw coefficient remain unchanged.
- Rope-length regression failed before the source change, then all 24 rule tests, controller/integration and TypeScript noEmit passed. Shortest-rig expected flight lower bound is now0.2s because the longer cord lowers the release position. Finite-difference velocity probe across early/late phases and both speed modes matched within1.12×10⁻⁷.
- Inspected short/long source previews with the HUD restored and longer cord. No new assets, build, upload or commit.
