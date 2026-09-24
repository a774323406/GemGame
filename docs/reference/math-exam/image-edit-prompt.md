# 原画局部清理记录

工具：内置 imagegen。输入：从用户视频 3.3 秒处提取的 `reference.png`。输出：`clean-paper-generated.png`。

最终游戏不直接使用整张生成图。`prepare_math_exam_art.mjs` 仅采用其中题目区和时钟内部的清理像素，其余部分保留视频原帧。数字图集来自原视频的 3.3、12、15 秒帧。

后续按用户圈定区域移除右上角平台菜单胶囊。清理稿保存为 `menu-removed-generated.png`，只合成原图坐标 x463～585、y94～152 的局部区域；相邻图钉及其他原画保留。

## 实际提示词

Edit this exact game screenshot into a clean background plate for a faithful game reconstruction. Precise-object-edit. Preserve image aspect ratio 592:1280 and exact coordinates and appearance of every retained element. ONLY remove the four large black arithmetic equations (9−3=, 3+1=, 8+2=, 4×7=) and the underline underneath the first equation. Inpaint those marks with the same uninterrupted soft, very pale gray-white paper texture. Also remove only the black clock hands and red wedge INSIDE the circular clock face at top x310..376 y18..80, preserve white dial and all perimeter ticks. Preserve the paper, all page edges, the exact Chinese title '2023年数学竞赛A卷', the score label '得分:' and its underline, the wooden planks, buff paper backing, tape roll, correction fluid bottle, green back arrow, yellow recording button, and translucent top right platform capsule, pixel-aligned, unchanged. Do not restyle, redraw, beautify, sharpen, alter colors, add text or objects, or change camera framing. This is removal-only, not a creative redesign.

## 移除平台胶囊的提示词

Precise-object-edit of the supplied game background. Remove ONLY the translucent rounded horizontal platform menu capsule in the upper-right, containing three black dots, a vertical divider and a black circle. In original 592×1280 image coordinates this capsule is x468..580, y100..147. Restore the underlying warm yellow diagonal backing-paper and brown wooden desk textures seamlessly, following their existing edge and lighting. Keep the small separate black outlined pushpin/person-shaped icon immediately to its LEFT at x418..448 and its surrounding translucent badge unchanged. Keep the tape roll below unchanged. Preserve every other pixel, framing, original portrait aspect ratio, Chinese title and score label, white exam paper, clock, green back button, yellow recording button and correction-fluid bottle. Do not redesign or add anything. Do not include a red annotation rectangle. Only the upper-right three-dot/circle capsule should disappear.

## 拖动瓶子所需图层（内置 imagegen）

输出：`bottle-removed-generated.png`（只合成瓶子原位置的局部底图）和 `bottle-cutout-generated.png`（缩放为 `assets/res/mathExamFeed/correction-fluid.png`，保留 alpha）。

背景清理提示词：

Precise-object-edit. This is an existing game background plate. Remove ONLY the correction fluid bottle at bottom-left (original 592×1280 coordinates x18..180, y957..1232) including its shadow. Reconstruct the white paper surface above the lower edge, its slightly irregular horizontal bottom edge at y1068, the angled yellow backing sheet, and wooden desk behind the bottle seamlessly. Preserve ALL other content, exact original composition, dimensions/aspect ratio, colors, title text, score label, paper texture, clock, tape, pin and back/record buttons. The platform menu capsule at top right has already been removed: it must stay absent. Do not redraw or restyle the rest of the picture. This empty spot will be covered by a separate draggable bottle sprite.

瓶子抠图提示词：

Background-extraction only. Extract this exact correction fluid bottle as a game sprite on a genuinely transparent alpha background. Preserve the complete illustrated white bottle, blue Chinese 修正液 label, printed details, thick black outline, silver cap and thin dark nozzle at the top, in their existing shape, tilt and colors. Remove only the white paper, tan paper and wood outside the black bottle silhouette, including the large cast shadow on the left/bottom; no opaque background, no checkerboard and no added objects. Keep the same 162:276 portrait aspect ratio and bottle's existing relative size, position and margins in the canvas. Do not redesign or center/straighten the bottle. Keep all of the nozzle and black outline.


## 移除胶带上方的小图标（2026-09-23）

工具：内置 imagegen。编辑目标及最终素材：`assets/res/mathExamFeed/video-artwork.png`。清理稿：`pin-badge-removed-generated.png`。去掉小人/图钉状轮廓及半透明徽章，仅合成原坐标 x402～463、y92～154 的局部修补，边缘羽化 4 像素。

Use case: precise-object-edit. Edit this existing portrait game background. Remove ONLY the small black outlined person/pushpin-shaped icon above the white tape roll near the upper right, together with its pale translucent rounded badge. In the original 592×1280 coordinates the unwanted badge is approximately x408..456, y99..149. Restore the warm yellow backing-paper texture and its diagonal top edge underneath seamlessly. Preserve the white tape roll immediately below/right and its existing outline, highlights, hole and shadow. Preserve every other element and its exact position: green back arrow, clock, wooden desktop, yellow backing sheet, white exam paper, exact title '2026年数学竞赛A卷', score label and underline. Keep the existing portrait aspect ratio and layout. The recording button and upper-right menu capsule are already removed and must remain absent. Do not add any annotation, red rectangle, icon or text. Do not redesign, shift, recolor or restyle the image. Remove only that small black icon and its translucent badge.

## 题头年份改为 2026（2026-09-23）

工具：内置 imagegen。编辑目标：`assets/res/mathExamFeed/video-artwork.png`。清理稿：`title-year-2026-generated.png`。最终素材：`assets/res/mathExamFeed/video-artwork.png`。仅合成原坐标 x133～163、y244～294 的末位数字区域，羽化 2 像素；其余标题及背景像素不变。

Use case: text-localization, precise-object-edit. This supplied portrait game background is the edit target. Change ONLY the last digit of the title year from 2023 to 2026. The exact finished title must read '2026年数学竞赛A卷'. Replace the '3' in '2023' with a '6' at the same location, matching the existing dark gray hand-drawn Chinese exam heading font, stroke thickness, digit height, baseline and spacing. In original 592×1280 coordinates the digit to replace is approximately x137..160, y250..289. Keep the first three digits '202' and all the Chinese characters and A unchanged. Preserve the paper texture around the replacement. Keep exact original portrait aspect ratio, composition and all other artwork unchanged: wooden desk, yellow backing paper, white exam page, title position, score label, clock, green back arrow, tape roll and pin. Recording button and upper-right menu are already removed and must stay absent. No added elements, no redesign, no restyling, no sharpening. This is one digit replacement only.

## 移除左上角录屏图标（2026-09-23）

工具：内置 imagegen。编辑目标：`assets/res/mathExamFeed/video-artwork.png`。输出：`record-button-removed-generated.png`。最终仅将原坐标 x20～131、y106～204 的局部修补稿合成到背景，边缘羽化 6 像素，其他区域保持原始像素。

Use case: precise-object-edit. Edit the supplied existing portrait game background plate. Remove ONLY the yellow recording button at the upper left, including its black border, red camera/play symbol, Chinese text '录屏', and drop shadow. In the original 592×1280 coordinates the button occupies approximately x30..118, y115..196. Restore the underlying ochre/yellow backing paper and the small brown desk area at its left seamlessly, following the existing diagonal paper edge, colors, soft texture and lighting. Keep the green circular back arrow above it and its shadow absolutely unchanged. Keep the exact original aspect ratio and coordinates. Keep every other element unchanged: wooden desk, yellow backing sheet, large white exam paper and all page edges, Chinese title '2023年数学竞赛A卷', score label '得分:' and line, clock, tape roll, separate pin. The top-right platform capsule and bottom-left bottle have already been removed from this background; they must remain absent. Do not redesign, restyle, sharpen, add any symbols or text, or shift the layout. Only the recording button should disappear.
