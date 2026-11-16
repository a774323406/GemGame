# Truck Stack Throw Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in the current authorized kdzzz working tree. Preserve existing uncommitted changes. Do not build, commit or switch branches.

**Goal:** 释放后沿原摆动方向甩出，带倾角快速下落，实际惯性影响落点。

**Architecture:** Pure fixed-step rules derive release velocities from the displayed swing, integrate damped horizontal motion and gravity, and sweep against the moving top. The controller already renders the actual pose. Existing source preview is extended to show release sequences.

**Tech Stack:** Cocos Creator 3.8.5, TypeScript, Node behavioral fixtures; no dependencies or media added.

**Spec:** docs/superpowers/specs/2026-11-13-truck-stack-throw.md

## Global constraints
- Keep current branch/IDs/ads/music/UI, 18-box retention, no interstitial pause, no Cocos build.
- User approved trying the proposed real-inertia approach; numerical tuning in the spec is a first iteration.
- Preserve source-derived previews at 750×1334 and 750×1624.

## Review focus
- Left/right release and instant preview activation must preserve the visible pose and travel direction.
- Fast movement must use contact-time horizontal position, not release or frame-end position.
- Early and late drops, including slow motion, must remain reachable without a hidden snap or wall clamp.
- A tilted airborne corner must not visibly penetrate the support before normal flat contact.
- Pause/preview/revive, fixed-step equivalence and retained state must remain valid.

### Task 1: Inertial release and verification
**Files:** `assets/scripts/truckStackRules.ts`, `tools/test_truck_stack_rules.cjs`, `tools/truck_stack_test_helpers.cjs`, `tools/test_truck_stack_controller.cjs`, `tools/preview_truck_stack.cjs`.
**Interfaces:** Keep `TruckStackRound` and controller APIs unchanged; active vx/vy during swing describe instantaneous motion. Actual-release tests use natural swing timing; cloned real rounds scan full late-game swing cycles for bounds and contact continuity.

- [x] Add failing behavior checks: both-way lateral travel with continuous tilt, normal fall 0.25–0.5 seconds across rig bounds, release/preview timing, slower swing gives weaker inertia, fractional-step horizontal contact, corner clearance, and natural long-run placements.
- [x] Implement analytic swing derivatives, bounded velocity transfer, gravity/air drag and flight-relative levelling. Integrate x at contact time and preserve state through a miss.
- [x] Adapt contact-only fixtures to explicitly zero test velocities. Keep actual-release tests independent of the trajectory formula.
- [x] Add source preview frames for release/midfall/near-contact at both sizes and inspect the resulting motion.
- [x] Run rules/controller/integration, repeating interstitial, TypeScript noEmit and diff checks; one independent focused review. Record results below.

## Progress
- Pre-flight: one coupled task; existing renderer already consumes active x/y/angle, no scene/authoring change expected.
- Ruling: execute in the existing kdzzz checkout and keep the ledger here, because the user's pending game implementation is already in this working tree and they will build it themselves. No commits or branch operations.
- Baseline probe: x displacement stays 0 at 0.1/0.2/0.325s, angle reaches 0 by 0.325s, contact at 0.733s on the long-screen rig.
- RED: four new checks failed against the prior source (no lateral inertia, slow fall, incorrect horizontal contact, no slowed throw velocity); all prior support/lifecycle checks still passed.
- Ruling: no future-projection aiming helper was needed. The existing 2,200 natural releases still land with the moderate inertia, and controller support fixtures remain valid. The new whole-cycle clone probes validate real trajectories without duplicating their formula.
- GREEN: 24 rule tests, controller and scene integration passed; full-cycle late throws stay onscreen at both rig limits with no contact penetration or landing clamp. Actual throws match at 30/60/144 Hz and variable frames.
- Source previews: 20 states at the two portrait sizes, including release/120ms/280ms. Inspected continuous leftward movement and smooth angle reduction; no HUD clipping. These are source renders, not a device test.
- TypeScript noEmit, all 21 shared repeating-interstitial checks and `git diff --check` passed. Runtime inputs now total 223,586 bytes; media remains 20,206 bytes. The runtime source increase for this iteration is 1,804 bytes before packaging.
- Final independent review: ready, no substantive findings. Reviewer independently passed all rules/controller/integration tests and probed 19,200 throws across intermediate/late tiers, both speed modes and rig limits. Maximum rotated horizontal extent was 364.917 of the available 375 units, no pre-contact corner penetration, and analytic derivatives matched finite differences within 8.1×10⁻⁸.
- Final rulings: retain intentionally reduced velocity/spin transfer, flight-relative angle blend, contact-time support/current-sway rest position, and existing placement helpers; review confirmed each preserves actual visible motion and avoids a landing snap. No Cocos build, upload or commit.

## Follow-up: slightly stronger inertia
- User feedback: inertia feels slightly weak. Raised horizontal transfer from 0.30 to 0.35, retaining speed cap, gravity, drag, swing and rotation timing.
- Expanded the existing whole-cycle edge test to stacks at x=-210/0/210. With the increased transfer it reproduced a landing snap at the old ±229 center boundary; widened that boundary to ±235, still leaving two units of visible margin for a 276-wide box. The regression then passed.
- Verification: all 24 rule tests (including 2,200 natural placements and both rig limits), controller tests, TypeScript noEmit and diff whitespace checks passed. No added assets, build or commit.
