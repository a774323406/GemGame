# 旋转打气球素材记录

使用内置 imagegen，参考用户视频 `7ba1d891e57747af7ae5f0c847697733.mp4` 的 11.25 秒画面。

生成器的三个精灵输出实际为 RGB 棋盘格底，不是真透明。用户确认后，使用 `tools/build_balloon_assets.mjs` 在本地沿封闭轮廓移除格子底、保留白色身体，生成真实 alpha PNG；原始图不修改。背景转为 JPG。最终资源保存于 `assets/res/balloonWheelFeed/`，新增图片及轮廓判定数据共 203,406 字节（约 199 KiB）。

圆盘、准星、弹孔和简易道具图标由离线矢量图形转换为 PNG。所有美术与 UI 均已放入 `BalloonWheelFeedGameScene.scene`；运行时代码不创建 UI。

## background

Generated images are saved to /Users/skyhand/.codex/generated_images/019fc696-6c3a-7ad2-b439-d2b7b892b4bf as /Users/skyhand/.codex/generated_images/019fc696-6c3a-7ad2-b439-d2b7b892b4bf/exec-fe2d8de0-35fa-4473-8bc4-1a32d276d754.png by default.

最终提示词：

Use case: precise-object-edit. Asset type: clean vertical 2D mobile game background. Image 1 is the edit target, a screenshot from the user's reference game. Reconstruct ONLY its tropical beach background: bright cyan blue sky with simple white clouds, large green palm leaves framing the upper corners, turquoise sea with thin white waves across the middle, warm light golden sandy beach across the lower half and a small cream seashell in lower left. Match the reference composition, flat painted cartoon style, colors and horizon at 40 percent from top. Remove ALL interface, text, title, score, wheel, character, balloons, crosshair, gun, hands, buttons, ammo, status bar and black phone pill. Fill all removed areas cleanly with uninterrupted background. No text or logos, no new props. Portrait 750:1624 aspect ratio, edge-to-edge opaque backdrop.

## character

Generated images are saved to /Users/skyhand/.codex/generated_images/019fc696-6c3a-7ad2-b439-d2b7b892b4bf as /Users/skyhand/.codex/generated_images/019fc696-6c3a-7ad2-b439-d2b7b892b4bf/exec-9bfa90f2-c5c3-4813-8c2e-83685336ab68.png by default.

最终提示词：

Use case: background-extraction. Asset type: one transparent 2D game character sprite. Image 1 is the edit target. Extract and accurately reconstruct ONLY the CENTRAL upright capybara-headed white stick figure from the reference screenshot: goofy brown capybara head with two tiny round ears, big round white eyes with black pupils, blue streams down each cheek, rounded brown muzzle, tiny tooth smile; plain solid-white body with thin black outline, raised curved arms either side of its head, two widely spread long straight white legs with rounded ends. Preserve the EXACT pose, proportions, line style and facial design of this reference, not a redesign. Head at top upright, full body visible. Remove circular blue ring, every pink balloon, red crosshair, background and ALL other screen elements; reconstruct any small area behind the red crosshair. Character should occupy about 90 percent of canvas height and 70 percent of canvas width, centered, about square canvas. TRUE transparent alpha outside the figure and between arms and legs. No checkerboard pixels, no ground shadow, no text, no outline rectangle.

## gun

Generated images are saved to /Users/skyhand/.codex/generated_images/019fc696-6c3a-7ad2-b439-d2b7b892b4bf as /Users/skyhand/.codex/generated_images/019fc696-6c3a-7ad2-b439-d2b7b892b4bf/exec-d619e48a-09d8-45de-be8a-1035a5b4c260.png by default.

最终提示词：

Use case: background-extraction. Asset type: isolated foreground gun-and-hands game sprite. Image 1 is the edit target. Extract ONLY the cartoon first-person hands holding a small black pistol from the bottom of this screenshot. Same reference perspective: slim short black pistol aimed straight toward screen top, rear black slide on central vertical axis, two warm peach hands clasping the grip, wrists/forearms extending diagonally down to left and right bottom corners. Reconstruct the parts of the arms hidden by bottom buttons. Match the exact thin dark linework, pink skin shading and proportions; don't add realism. Full gun muzzle visible above hands, arms terminate flush at bottom edge of asset. TRUE transparent background outside hands and gun. Remove beach, shell, UI, all text, bullet counter and all three buttons. Centered, about 4:3 canvas; gun tip at top center, hands in lower center and forearms fill bottom width. No extra fingers, no symbols.

## balloon

Generated images are saved to /Users/skyhand/.codex/generated_images/019fc696-6c3a-7ad2-b439-d2b7b892b4bf as /Users/skyhand/.codex/generated_images/019fc696-6c3a-7ad2-b439-d2b7b892b4bf/exec-525e37dc-83e5-4ed7-a639-b05c567e7949.png by default.

最终提示词：

Use case: background-extraction. Asset type: one transparent pink balloon game sprite. Image 1 is the edit target. Extract/reconstruct ONLY ONE of the pink balloons around the reference wheel. A small plump oval party balloon viewed face-on, elongated vertically about 1.15:1, tiny tied nub at the bottom (NO long string), thin charcoal outline, light pink upper-left with a white shine, rich rosy-pink lower-right soft shading. Match reference cartoon artwork exactly. Single balloon pointing upward, centered, tight sprite framing with 5 percent transparent margin. TRUE transparent alpha outside, no ring, no character, no UI, no text, no multiple balloons, no checkerboard pattern.

