# getuserscene 女性发型小游戏概念

## 画面状态

- `female-hair-puzzle-playing-final.png`：挑战进行中；发片错位，只显示操作提示。
- `male-hair-puzzle-playing-final.png`：贴近参考视频的冷色男性版，使用银白短发、青蓝格纹背景和蓝色UI。
- `female-hair-puzzle-playing-art.png`：无字底图。
- `male-hair-puzzle-playing-art.png`：男性版无字底图。

## 男性版分层资源

位于 `layers/`：

- `male-base-layer.png`：750×1624，包含蓝色背景、人物、固定侧后发和头顶网格，不包含旋转发片。
- `male-base-layer-with-ui.png`：基础层加顶部挑战标题和底部操作提示，仍不包含旋转发片。
- `male-rotating-hair.png`：透明 PNG，只包含可旋转的银白发片。
- `male-ui-overlay.png`：透明文字UI层；放在旋转发片上方，避免旋转时遮挡文字。
- `male-layer-composite-preview.png`：带文字基础层与发片重新叠加后的位置预览，不作为运行时资源。

建议在 750×1624 设计分辨率下将发片显示为约 570 像素宽，节点放在头顶旋转中心 `(0, 312)`，`UITransform.anchorPoint` 先设为 `(0.55, 0.58)`，再按真机观感微调。

## 推荐交互逻辑

1. 进入场景时随机打乱 3 片头发，但保证至少 2 片处于错误角度。
2. 点击某片头发后顺时针旋转 90°，用 0.12～0.18 秒回弹动画增强手感。
3. 发片达到正确角度后短暂发光并锁定；错误时不弹失败提示，让玩家继续点。
4. 三片全部正确后播放星星和彩带，隐藏底部操作提示，再淡入唯一按钮“下一关”。
5. 不显示设置、提示、广告或平台模拟按钮，避免获客首屏分散注意力。

## 重新导出

安装 Pillow 后执行：

```bash
python3 marketing/getuserscene/render_mockup.py
python3 marketing/getuserscene/prepare_layers.py
```
