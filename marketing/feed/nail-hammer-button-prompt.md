# 砸钉子：锤子 +5 图片按钮

- 生成方式：内置 image_gen，随后仅缩小为项目所需的 128×128 PNG。
- 最终素材：`assets/res/nailHammerFeed/add-hammers-button.png`。
- 参考：乒乓球 `slowdown-button.png` 的金色方框，以及砸钉子的 `hammer-ready.png`。
- 图片无文字、无广告角标；两者由场景中的独立节点显示，方便编辑器调整。

## 造型提示词

```text
Use case: precise-object-edit.
Asset type: production PNG sprite for a small Cocos casual-game picture button, not a screenshot or mockup.
Input image 1 is the edit target: the existing 128x128 gold rounded-square ping-pong slowdown button. Input image 2 is a supporting subject reference for the hammer.
Primary request: replace ONLY the speedometer illustration inside image 1 with a single chunky cartoon claw hammer, retaining the same shiny gold rounded-square frame, blue inner inset, specular highlights, sparkles and empty golden caption band along the bottom. Give the hammer a dark steel head and a short brown wooden handle like image 2, but make its silhouette chunky and readable as a small UI icon; tilt it diagonally across the upper blue inset. Keep the bottom approximately 25 percent of the button empty for an editor-added caption.
Constraints: square 128x128 pixel output if supported; button fills the square tightly with just a tiny transparent border. Outside the rounded button must be genuinely alpha-transparent, not black, white or a checkerboard. No text, no digits, no plus sign, no advertisement/play icon or badge (those will be separate scene nodes). No people, nails, scenery, extra objects, watermark or new surrounding UI. Preserve the frame style and clear silhouette at 128px. The result must be one finished picture-button asset.
```

## 最终透明背景修正提示词

```text
Use case: background-extraction. Edit the supplied finished golden square hammer button sprite. Preserve the entire button and hammer artwork exactly as-is. Change ONLY the black outside-corner background to genuine PNG alpha transparency. This must be a real RGBA transparent PNG suitable for drawing over a game scene, not black pixels, white pixels, or checkerboard pixels. Clean rounded edges; no halo. No text, no ad badge. Export the image as a small 128x128 PNG if supported; retain the original square composition. The bottom empty gold caption strip must stay unchanged.
```
