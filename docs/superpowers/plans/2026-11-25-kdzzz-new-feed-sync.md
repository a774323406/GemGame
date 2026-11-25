# kdzzz New Feed Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. The user's explicit no-build/no-tests instruction overrides test execution steps.

**Goal:** Sync recent recommendation-feed games from `yddbjd` (`be8d90e`) into `kdzzz` (`2e86e33`) while preserving target branding and identifiers.

**Architecture:** Copy the new scenes, resources, controllers and matching authoring scripts. Extend target configuration with placeholder IDs and active-entry recognition, keeping every existing target ID and all SDK identity files unchanged.

**Tech Stack:** Cocos Creator 3.8.5, TypeScript, serialized Cocos scenes, Node authoring tools.

**Spec:** User instructions in this chat: sync mainly the recent feed games, retain kdzzz-specific logo/ad/content IDs, use `xx` for the three new feeds; user performs builds and gameplay tests.

## Global Constraints

- Source branch and source checkout remain unchanged; commit locally to `kdzzz`, no remote push.
- Preserve target logo image/meta, loading-scene logo binding, SDK/ad configuration and existing recommendation IDs.
- New AirdropRescue, MarbleBottle and KnifeClimb content IDs are each `xx` and cannot route as an actual ID.
- Include restored JuggleBall menu entry, readiness/pause/layout fixes and shared feed integration.
- Interstitials keep shared eligibility, indefinite repeats, 60-second close/failure cooldown and no active gameplay pause.
- Keep authoring scripts consistent with serialized scenes; do not run scene generators, build or game tests.
- Leave unrelated target-only docs and files intact; do not modify bead-puzzle settlement.

## Review Focus

- Missing/placeholder content IDs must not route to one of the three new scenes accidentally.
- Existing kdzzz IDs, ad identifiers, branding assets and scene bindings must stay intact.
- All new scenes must have complete controller, asset and main-menu bindings.
- Active-entry readiness and interstitial hooks must be copied along with gameplay.
- Source IDs must not leak into runtime config, tests or authoring scripts.

### Task 1: Sync games and integration with target identity preserved

**Files:**
- Add scenes/controllers/rules/resources and authoring files for AirdropRescue, MarbleBottle and KnifeClimb.
- Update JuggleBall scene/controller, NewMainScene scene/controller, GameSceneBundle, loadScene, FeedAcquisitionService, SdkUtils and shared presentation/authoring files.
- Extend `assets/scripts/framework/Platform/FeedRevisitConfig.ts` without changing existing constants.
- Update corresponding existing verification fixtures without copying source-specific IDs.

**Interfaces:** New GameSceneName entries and main-menu buttons load their serialized scene UUIDs. `isConfiguredFeedAcquisitionContentId(contentId)` accepts active configured IDs but excludes `xx` and removed routes.

- [x] Snapshot target identity hashes and feed constants; inspect changed-file inventory.
- [x] Copy scoped gameplay/integration changes; retain unrelated target-only files.
- [x] Append three `string = "xx"` constants and the active-entry helper to target configuration.
- [x] Preserve branch-aware fixtures and authoring ID behavior.
- [x] Perform static syntax/JSON/reference/ID/hash/whitespace inspection only; no build or gameplay tests.
- [x] Obtain a read-only whole-change review and resolve material synchronization defects.
- [x] Commit locally on kdzzz; confirm source checkout and branch are unchanged.

## Validation Record

Static inspection: all 5 synchronized scenes have valid object references, asset UUIDs and controller scripts; 40 script files parse, and 95 relative imports resolve. All 18 pre-existing content-ID constants and protected branding/SDK files match target baseline. Staged whitespace check is clean. No builds, game tests, scene generators or device ad checks were run; the user will perform runtime validation.

Read-only whole-change review against target baseline `2e86e33` and source `be8d90e` found no synchronization defects. All copied gameplay files match the source; only target configuration and branch-aware fixtures intentionally differ. No source identifier leakage was found. The source checkout remains clean on `yddbjd` at `be8d90e`.

Review boundaries: JuggleBall recommendation-card expansion, screen adaptation and actual ad delivery remain for device validation by the user. Retired IDs, bead-puzzle settlement and target-only historical docs/tools remain unchanged; source layout preview PNGs are not runtime dependencies and were not copied.
