# Rope Duck Difficulty Implementation Plan

> For agentic workers: Use superpowers:executing-plans inline; one final independent review.

Goal: Implement the user-approved distance-based difficulty curve, with a 1–2 minute tuning target.
Architecture: Keep the existing physics/input/controller untouched. Extend deterministic terrain generation in ropeDuckRules.ts using a capped distance profile and safe obstacle/recovery variants. Retain checkpoint PRNG restoration.
Tech Stack: Cocos Creator 3.8.5, TypeScript, Node tests and Playwright.
Spec: docs/superpowers/specs/2026-11-10-rope-duck.md (approved difficulty addendum below).

## Global constraints
- Stages: 0–80 / 80–200 / 200–400 / 400–650 / 650+ metres.
- No spikes before 140m. No new artwork/audio/UI controls; preserve 0.2s charge, spring, rescue and ad rules.
- First five energy opportunities around 160–220m. Existing 5-pickup boost duration unchanged.
- From 200m, every fourth platform is a wide, level, spike-free recovery platform.
- Never combine a narrow platform, maximum gap and spikes. Spike platforms retain >=200 entrance and >=100 exit clearance.
- Cap gaps at170, adjacent elevation change40; no endlessly increasing difficulty.
- 1–2 minutes is a tuning target, not a forced timeout or a measured human-play result.

## Tasks
- [x] 1. Add RED tests for stage caps, tutorial protection, recovery rhythm, energy opportunities, hazard safety, deterministic regeneration and bounded terrain.
- [x] 2. Implement profile interpolation and map variants. Add safe checkpoint filter. Keep physics unchanged; run existing rescue/input/controller tests.
- [x] 3. Validate generated traversal samples; preview stage layouts, energy boost, revival, actual touch and both sizes. Build Web/ByteDance and measure incremental package size.
- [x] 4. Independent final review, fix consequential findings, record verification.

## Review focus
Regeneration after checkpoint pruning; difficulty based on map position rather than high-water score; spike/energy placement; boost landing on elevated terrain; stage changes creating impossible gap/height combinations.

## Ledger
Approved design and direct user request authorize implementation in the active project; preserve existing changes, no commit/upload requested.

Tasks 1–2 complete: difficulty regression failed before profile implementation and passes after. Generated first five energy opportunities by197.8m; all map contracts, deterministic late checkpoint restoration, five-pickup boost and safe checkpoint tests pass. Physics/input/controller/scene integration/typecheck pass unchanged. Real-input representative transitions at all stages pass; initial test fixture was corrected to start after the previous platform’s spikes instead of on top of them. Route geometry regression now ignores mutable energyTaken so acquired energy is retained after revival.

Tasks 3–4 complete: actual-touch browser test passed at750×1334/1624, including rescue/restart/revive and boost. Inspected representative stage screenshots at151/343/519/763m. Web and ByteDance logs report build success. Final package19,163,028 bytes, +816 bytes versus previous revision; total new game increment88,818 bytes (86.74KiB) versus initial baseline. Independent reviewer reported no important findings; additionally checked every generated transition and boost ending at all energy locations through~3,000m. No deferred findings. Human1–2min duration remains a playtesting target, not an automated-test claim. No commit/upload.
