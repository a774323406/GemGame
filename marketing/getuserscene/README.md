# getuserscene 女性发型小游戏概念

## HairGameScene 当前十关资源

- 运行时目录：`assets/res/texture/hairGame/`
- 阵容：5 名成年男性、5 名成年女性；第 2、5 关为宽肩肌肉型男性，第 6、8 关为全包裹服装的成熟女性。
- 人物节点显示尺寸统一为 `750×1250`，运行时纹理为 `600×1000`；头发节点显示尺寸统一为 `728×594`，运行时纹理为 `582×475`。
- 头发显示尺寸已烘焙原节点 `1.4` 倍缩放，场景中统一使用位置 `(0, 220)`、缩放 `(1, 1)`。
- 所有头发都以人物图坐标 `(375, 218)` 为共同旋转中心，并用 0° 合成预览校正后再切出。
- 人物与头发 Sprite 均固定为 `CUSTOM` 尺寸模式，替换 SpriteFrame 不会被纹理原始尺寸重新改写节点大小。
- 人物与头发 SpriteFrame 关闭自动裁切；透明画布是十关共用位置与旋转中心的一部分，不能在导入时删掉。
- 不同发型需要的缩放与偏移记录在 `build_hair_game_assets.py` 的 `HAIR_ALIGNMENT`，并已烘焙进各自 PNG；运行时只替换人物和头发图片，不修改节点位置。
- 各生成图的人脸中轴偏差记录在 `CHARACTER_ALIGNMENT`，同样已烘焙进人物 PNG；十关的脸、秃顶中心与头发旋转轴统一落在 `x=375`。
- 两张共享背景为 `750×1624` JPG；运行时图片合计保持在 1,500,000 字节以内。
- `production-sheets/` 是不进入游戏包的生成源图；`hair-game-10-level-preview.jpg` 是十关 0° 对位校样。

局部重建示例：

```bash
python3 marketing/getuserscene/build_hair_game_assets.py \
  --output assets/res/texture/hairGame \
  --bake-existing-hair \
  --replace 1=marketing/getuserscene/production-sheets/level-01.png \
  --replace 2=marketing/getuserscene/production-sheets/level-02.png \
  --replace 5=marketing/getuserscene/production-sheets/level-05.png \
  --replace 6=marketing/getuserscene/production-sheets/level-06.png \
  --replace 7=marketing/getuserscene/production-sheets/level-07.png \
  --replace 8=marketing/getuserscene/production-sheets/level-08.png \
  --replace-hair 6=marketing/getuserscene/production-sheets/level-06-hair.png \
  --replace-hair 8=marketing/getuserscene/production-sheets/level-08-hair.png \
  --downsample-runtime \
  --preview marketing/getuserscene/hair-game-10-level-preview.jpg

pngquant --quality 0-55 --speed 1 --colors 16 --force --ext .png \
  assets/res/texture/hairGame/*.png
```

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
