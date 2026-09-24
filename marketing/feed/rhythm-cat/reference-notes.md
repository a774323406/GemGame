# 节奏猫咪参考与素材

来源：https://www.douyin.com/video/7531786748461649210 （原分享链接 https://v.douyin.com/BI7Bge2ZkBE/ ）

- 录屏：576×1136，30 FPS，32.666667 秒。原始副本为 reference.mp4，不进入 Cocos 发布资源包。
- 主体图片均直接取自录屏，透明分离保留 RGB；没有生成或重绘猫咪、食物、爱心及地板。四个姿态的源坐标、帧号和处理方式见 asset-provenance.json。帧号为从 0 开始的原视频帧；5 FPS 采样的首帧对应原帧 2。
- 背景使用原视频无遮挡墙面区域、地板和中线；录屏固定文字和平台按钮通过原背景片段替换。游戏返回按钮、提示文字和结算面板是新增可编辑界面。
- 连续冰淇淋段的纹理按原帧切片重用，原帧的上下接缝保留。已有录屏压缩噪点、边缘锯齿及少量贴近猫咪的碎屑，不是游戏原始高清工程素材。
- 谱面通过固定四列的食物像素匹配、5 FPS 观测及约 220 像素/秒下落速度重建。chart-observations.json 保存每项来源和拟合误差。这是录屏近似谱面，并非原游戏数据文件。
- track.mp3 是录屏混合音轨，含原视频的音乐和猫叫；没有额外叠加猫叫。实际音频约 32.625 秒，末尾与 32.666667 秒场景时长有约 42 毫秒差异。
- 普通模式使用 `track-normal.mp3`，按原速的 85% 运行；看广告后切换 `track-slow.mp3`，按原速的 70% 运行。两份音轨从原音轨分别以 `atempo=0.85` 和 `atempo=0.70` 保持音高放慢，补齐至完整片段。通过 `node tools/build_rhythm_cat_slow_audio.mjs` 重建；广告完成后从当前音乐位置切换，食物与音轨保持同一进度。重开恢复 85% 速度。
- 降速按钮按用户截图复用外卖游戏同款：`juggleBallGame/slowdown-button.png`、`texture/UIs/ad_badge_cartoon_red.png`，以及原按钮的“降速”字体描边。主体猫咪／食物素材不变。
- 重做素材：python3 tools/extract_rhythm_cat_assets.py；重建谱面：python3 tools/observe_rhythm_cat_chart.py；重建场景：node tools/build_rhythm_cat_scene.mjs。`--main-card` 仅在当前主页局部追加入口，可重复执行。
