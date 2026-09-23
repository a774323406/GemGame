# Retired Games and Legacy Main Scene Removal Spec

## Goal

Remove the milk-tea straw game, the pen-refill game, and the legacy `MainScene` from the shipped Cocos Creator project without breaking the current `NewMainScene` lobby or any surviving game.

## Required behavior

- Remove both retired gameplay scenes, controllers, scene metadata, controller metadata, direct-play routes, Content ID constants, analytics names, and lobby entries.
- Remove `MainScene`, `mainScene.ts`, their metadata, `GameSceneName.LegacyMain`, and tests/tools that exist only for that legacy scene.
- Old Content IDs `CONTENT14484635394` and `CONTENT14615823362` must no longer route to deleted scenes; the existing unknown-ID shooting fallback must handle them.
- Keep `NewMainScene` as the only main lobby. Its remaining cards stay in their existing order and reflow to three rows of two.
- Delete the four retired lobby card images: `preview_milk_tea.jpg`, `title_milk_tea.jpg`, `preview_pen.jpg`, and `title_pen.jpg`, together with their metadata.
- Delete all exclusive images under `assets/res/milkTeaFeed` and `assets/res/penRefillFeed`.
- Preserve the existing milk-tea `back-button.png` UUID because `BalloonWheelFeedGameScene` and `NailHammerFeedGameScene` use it. Move that file and its `.meta` to `assets/res/texture/UIs/feed_back_button.png`, then update path-based authoring tools.
- Delete old-main-only images `主界面-750x1624压缩后.jpg`, `开始游戏按钮3.png`, `LOGO.png`, and `UIs/bg_big_rounded_progress_white.png`, together with their metadata.
- Do not delete shared settings, share, sidebar, shooting, archery, nail, balloon, penguin, or puzzle artwork.
- Keep authoring and verification tools runnable by replacing deleted template-scene dependencies with `ArcheryGameScene` and removing legacy-main entry injection.

## Acceptance criteria

- No runtime source, serialized scene, authoring tool, or active test references the three removed scenes/controllers or the two removed Content IDs.
- `NewMainScene.scene` contains exactly six cards and no milk-tea or pen-refill bindings.
- All serialized `__id__` references remain valid.
- The shared back button keeps UUID `8f6b54c1-3b72-4cf3-8a36-a5d9f6e4c721` and both surviving scenes still reference its sprite frame.
- Relevant Node-side tests and a Cocos web-mobile build pass.
