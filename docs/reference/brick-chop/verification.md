# 劈砖挑战验收（2026-11-04）
用户确认：新增玩法；无排行榜、关卡选择、跳关；12 块砖 / 3 次机会；完整激励后降速及次数＋3；Content_ID=CONTENT15740674562；新增包体预算约 1 MB。

## 交付
- BrickChopFeedGameScene，UUID b3c0567c-f955-53eb-a799-7318d480bf2d。
- 大厅新增劈砖挑战卡片；推荐流路由 CONTENT15740674562；广告归因“劈砖挑战”。
- 手掌按下时锁定蓄力，先抬手后加速下砸，0.25 秒接触并短暂停顿，砖块逐层向两侧碎开；10 块约 1.08 秒完成，12 块约 1.17 秒完成。
- 复用返回、降速、额外次数底图、视频角标、标题牌、全屏结算标题/按钮、getUserBgm；挥掌与碎砖使用新增短音效，不使用 archeryShoot。
- 首次预览及返回卡片保持蓄力动画与音乐，不自动扣次数；进入时继承可见蓄力。后台、手动暂停、激励期间暂停；插屏沿用全局重复调度且不主动暂停。
- 失败/成功使用现有全屏结算工具，HUD 收起。750×1334 与 750×1624 底部交互边距 ≥80。

## 验证记录
通过：test_brick_chop_rules、test_brick_chop_controller、test_brick_chop_integration、test_feed_integration、test_new_main_scene、test_feed_result_layout、test_repeating_interstitial、test_ad_analytics。
TypeScript --noEmit --skipLibCheck 通过；未用全量引擎声明检查作为结论（项目既有引擎类型问题）。
真实 Web 构建浏览器验证：首次预览蓄力和 AudioSource.playing / getUserBgm、真实触摸、出掌碎片、成功失败、HUD、两种尺寸边距、暂停后继续、确认回大厅，无 pageerror。
截图 /tmp/brick-chop-preview/{play,impact,success,failure}-{1334,1624}.png。
独立复核发现两项：首次触摸丢失预览蓄力、结算命中提示重现；已加回归修复并复核通过。

## 包体
新增图片合计 96,939 字节。构建前输出总计 18,871,724 字节；最新构建后 19,055,581 字节；累计增加 183,857 字节（179.55 KiB）。
按 build/bytedance-mini-game 文件合计比较，非手机运行内存或平台压缩下载大小。记录基线 /tmp/gemgame-brick-before.json。
新增挥掌与撞击音频合计 26,990 字节，没有新增第三方运行依赖。

## 资源来源与复现
参考：用户提供 e52700c5b02144baf21f45ee817b19a8.mp4。
图像生成：独立中式空背景（移除所有 UI/砖/手）、一块青花长砖、从右侧伸入向左出掌的手臂。按视频的配色、构图、画风复现，非逐像素原素材。
原图位于 ~/.codex/generated_images/01a0cbf0-ddba-70f3-a6ee-b21f1e46c43c/，文件名在 tools/build_brick_chop_assets.mjs。
运行 node tools/build_brick_chop_assets.mjs、node tools/build_brick_chop_audio.mjs 和 node tools/build_brick_chop_scene.mjs --lobby 可复现资源/场景；大厅主构建脚本也维护新增卡片。

## 构建与限制
Web: build/brick-preview，预览 http://127.0.0.1:8767/，从大厅选择劈砖挑战。
小游戏: build/bytedance-mini-game。两个 Creator 构建日志均显示 build success（该 CLI 成功返回码为 36）。
未上传、发布。真实推荐流宿主的可见性、广告播放及声音仍需真机确认；本地广告奖励测试使用模拟回调。

## 背景音乐重叠修复（2026-11-04）
用户反馈是多段音乐同时播放。实际 WebAudio 取证复现 FeedEnter/首次触摸/onShow 连续调用后两条循环 BufferSource 同时存在。根因：AudioManager.restartMusic 直接清空 clip；Cocos 3.8 WebAudio destroy 不停止现有 source；同一 AudioSource 连续重绑同一个 clip 时，旧异步加载回调还会通过身份检查。
修复：同曲且正在播放时恢复调用直接返回；确需重建时先静音/停止旧源并清空 clip、销毁旧 AudioSource，再使用独立新组件，隔离过期回调。
test_bgm_recovery.cjs 验证恢复去重、旧通道清理、暂停和音乐开关；verify_brick_audio.cjs 用真实 WebAudio start/stop 计数，修复前重音及后台残留检查失败，修复后进入/点击/show/连续 hide-show 始终一条循环声源，hide 后为零。劈砖、鸭子及推荐流音频生命周期回归与 TypeScript 检查通过。
修复位于共享音乐管理，未新增任何媒体资源。Web/小游戏均重建；尚未真机听音验收。旧页面已经遗留的声音需刷新页面清除。

## 力量感追加（2026-11-04）
- 对照参考视频 18–20 秒的大力出掌：增加抬手预备、快速下砸、45ms 接触停顿、按命中层数深入的手掌动作、局部震动和碎屑。未改变蓄力对应块数、12 砖/3 次规则，未暂停全局游戏。
- 每块完整砖仅在该层裂开的时刻隐藏。10 块命中对应 10 对碎片及 2 块完整砖；碎片延长可见时间，调整上抛速度和旋转，避免较早飞出的上层与下层挤成少量砖块。最后一层裂开后仍留出 0.38 秒才进入结算。
- 原创合成短挥掌声、低频撞击与碎裂声；不是参考视频音轨。音效遵循音效开关，暂停/后台/退出停止。接触短震动，命中至少 8 块在最后一层再短震动一次，遵循现有震动开关。
- test_brick_chop_feedback/rules/controller/integration、test_bgm_recovery 通过。针对 1/5/10/12 层时序、10 对碎片/2 整砖、碎片行距、手掌深度、震动去重与生命周期完成回归。
- 最新 Web 构建实测通过 preview_brick_chop.cjs：双尺寸、真实触摸、成功/失败、暂停/返回及底部边距；截图 /tmp/brick-chop-preview/ten-bricks.png。verify_brick_audio.cjs 实测前台始终一条循环背景音，后台为零。
- 最新 Web 和小游戏构建均 build success；TypeScript --noEmit --skipLibCheck 通过。真机震动强弱及主观听感尚未验收；未上传发布。

## 旧版剩余比例判定记录（2026-11-04，已被下方固定阈值规则取代）
用户确认：命中数按当前剩余砖数 × 力度比例向下取整，达到 98% 才能清空；保留 12 砖/3 次。取代旧版固定 12 块映射再截断的规则。
- 先验证旧版剩 2 块、20% 力度会错误劈掉 1 块，再修复并通过回归。
- 规则测试覆盖剩 1/2 块、98% 上下边界、每次使用最新余量、10→2→1→0，以及最后一次机会胜利。
- test_brick_chop_rules/feedback/controller/integration、TypeScript --noEmit --skipLibCheck 通过。
- preview_brick_chop.cjs 在新 Web 构建中实际验证 12→2→2→1→1→0：弱击不清空，剩余完整砖显示与数据一致，98% 出掌后显示挑战成功；双尺寸/暂停/返回/结算检查通过。
- Web 与小游戏均 build success；最新小游戏输出 19,055,576 字节，较新增玩法前累计增加 183,852 字节（179.54 KiB）。本次未新增图片或音频，未上传发布。

## 最终固定层阈值规则（2026-11-04）
用户澄清：力量表示可达到原始第几层，已破碎砖块不会降低深层砖的门槛；最后一块阈值改为 >=95%。旧版按剩余数量乘力度的逻辑废弃。
- 总数仍 12 块；前 11 层要求力度 > 层号/12，最后一层要求 >=95%。本次命中数为可达层数扣除已破碎层数，最低为 0。动画仍只展示本次实际新破碎的砖。
- 回归先证明旧版剩 2 块、50% 力度错误命中 1 块，再修复并通过；覆盖前 11 层门槛上下边界、原始层位置保留、相同或较弱力度不能磨砖、95% 上升/下降采样、次数耗尽失败与最后一次机会成功。
- test_brick_chop_rules/feedback/controller/integration 及 TypeScript --noEmit --skipLibCheck 通过。
- 新 Web 构建中 preview_brick_chop.cjs 通过：90% 劈掉 10 块后，50%/90% 均劈空；92% 劈第 11 块，重复 92% 或 94.9999% 劈空；95% 劈掉最后一块并成功。完整砖显示与剩余数量一致；双尺寸/暂停/返回/结算通过。
- Web/小游戏均 build success；最新小游戏输出 19,055,636 字节，较新增玩法前累计增加 183,912 字节（179.60 KiB）。无新增媒体资源，未上传发布。

## 最后一层门槛上调（2026-11-04）
用户要求最后一层由 >=95% 改为 >=98%；前 11 层固定阈值与原始层位置规则不变。旧版 95% 记录由本节取代。
规则回归先验证旧版在 97.9999% 提前清空，再修复通过；确认 95% 不能劈最后一块，98% 在上升/下降两侧均可清空。规则/反馈/控制器/集成测试、TypeScript、真实浏览器固定层阈值连续出掌检查均通过。Web/小游戏重新构建成功，未上传发布，无新增资源。

## 正式推荐流 ID 与插屏核对（2026-11-04）
- 劈砖推荐流 ID 由 xx 替换为 CONTENT15740674562，加载页路由进入 BrickChopFeedGameScene；旧占位符不再路由劈砖。共用插屏已在场景 start/进入/退出生命周期接入，未再增加独立广告计时器。
- 使用项目现有 ByteDance 插屏广告位。首次请求同时满足应用启动 31 秒、进入推荐流至少 2 秒及场景就绪；预览不请求，关闭全屏广告后间隔 60 秒再次请求，失败重试也等待 60 秒，无次数上限。插屏不主动暂停游戏，激励仍使用原有暂停流程。
- test_feed_integration 4 项、test_repeating_interstitial 19 项（含正式劈砖 ID 的就绪/重复/失败重试/退出用例）、test_ad_analytics 11 项以及劈砖控制器/资源集成、TypeScript 检查通过。SDK 模拟验证插屏不改暂停、音频、触摸拦截状态。
- Web 与小游戏均 build success。真实广告库存/展示仍需抖音真机验证；未上传发布或更改平台后台配置。
