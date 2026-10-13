# 拉索漂移第一版验证记录

2026-10-04。交付目标为用户要求的第一版可试玩玩法，不代表正式平台投放完成。

## 已实现

- 新增 `DriftFeedGameScene` 和大厅“拉索漂移”卡片；使用当前项目场景 Bundle 和平台服务。
- 复用 drift 的无尽道路生成与固定步长拉索求解器、三类道路图片，车辆使用本次新生成的透明橙色小车。
- 按住接绳、松开出弯，无尽过弯计分、本地最高纪录、基础速度 1.0～1.4 倍。按用户后续要求，撤掉自加的每十弯四倍冲刺。
- 草绿、沙漠、冰蓝、夜间四套环境色循环，原项目固定朝向、固定比例的画面定位，锚点、拉索、漂移烟尘与尾迹。
- 合成六段音频：引擎、漂移、挂绳、计分、加速、爆炸；复用现有背景音乐。循环和短音使用可停止的场景音源，遵守静音与前后台生命周期。
- 撞车火团、火花、烟雾、冲击环（不震动画面）；保留变暗车辆，约 0.8 秒后进入全屏结算。暂停、重玩、返回大厅、每局两次激励复活和三秒复活倒计时。
- 场景生成器复用共有结算布局；真实 Content_ID 保持空值，空 ID 不匹配正式推荐流入口。

## 自动化验证

以下命令在最终源代码运行通过：

- `node tools/test_drift_feed_rules.cjs`
- `node tools/test_drift_feed_longrun.cjs`
- `node tools/test_drift_track_visual.cjs`
- `node tools/test_drift_feed_scene.cjs`
- `node tools/test_drift_feed_controller.cjs`
- `node tools/test_drift_feed_effects.cjs`
- `node tools/test_drift_feed_audio.cjs`
- `node tools/test_drift_audio_lifecycle.cjs`
- `node tools/test_drift_feed_integration.cjs`
- 共有 `test_feed_result_layout`、`test_feed_screen_layout`、`test_feed_integration`、`test_new_main_scene`、`test_retired_games_removed` 均通过。
- Creator 3.8.5 TypeScript 检查：`tsc --noEmit -p tsconfig.json --skipLibCheck true` 无错误。

恢复原参数后的纯模拟：种子 123、999 的固定输入脚本分别在通过 35、37 弯后碰撞，最大保留道路数 18、17；两次重复运行逐帧结果一致。没有为自动驾驶通关修改原参数。新增源文件一致性检查：三个核心文件逐字一致、实际 JSON 参数一致、11 个控制器方法保持原公式。

## 实际 Cocos 画面

Creator 3.8.5 Web Mobile 独立输出位于 `/tmp/gem-drift-first-build/web-mobile`。最终构建日志 `/tmp/gem-drift-build.log` 确认 `build success`。

`tools/preview_drift_feed.cjs` 通过 Chromium 移动触摸模拟，从真实大厅进入场景，实际 CDP 触摸验证前 3 弯，并抓取拉索过弯画面；主题切换另由纯模拟覆盖。旧固定时机浏览器输入在第 9 弯后碰撞，未为通过该脚本调整手感。未改写车辆位置。浏览器错误列表为空。随后以测试调用触发碰撞以固定爆炸截图时机；激励视频取消与成功使用隔离的模拟回调，不调用真实广告。取消未扣次数，成功进入复活倒计时并余下一次。

`tools/check_drift_runtime_layout.cjs` 验证 750×1334、750×1624 的结算按钮实际屏幕底边距，车辆保留、HUD 收起、复活耗尽显隐，以及暂停/继续恢复 HUD。最下方按钮底边距分别为 88 和 122.13 设计单位，均大于 80。检查通过，浏览器错误为空。数值与截图保存在 `docs/reference/drift-feed/first-playable/`。

本地试玩：`http://127.0.0.1:8769/drift-preview.html`。启动页由 `node tools/open_drift_preview.mjs <build-directory>` 生成，自动打开实际游戏场景并隐藏开发用性能文字；它不是模拟游戏页面。静态服务关闭后需重新启动对应目录的本地 HTTP 服务。

## 审查与修复

独立审查找出的两项问题已用失败后通过的回归验证修复：暂停/切后台后的新触摸可重连当前锚点；短音改用可停止的 AudioSource，避免 detached one-shot 在退出后继续发声。审查者复核修复及 Creator 延迟音频加载语义，无剩余阻塞项。

实际画面还发现并修复新车 SpriteFrame 赋值重置显示尺寸；验证宽高 125×238、按原项目缩放 0.58。保留原180°弯预制体的300单位子图偏移，避免道路画面和轨迹错位。

## 本版范围与后续验证

- 本版以原道路图片与纯色环境换景为主，未增加装饰物素材包。
- 后续修正以原 drift 项目为准：半径速度倍率 1.5、道路半宽 165、固定步长 1/60、最多 4 子步，原拉索选择/接入/碰撞/复活定位；撤销转向旋转、动态缩放和震动。复活速度归零再逐渐恢复。
- 音频已验证文件信号、循环边界和播放生命周期，未宣称完成真人听感评审或手机扬声器混音验收。
- 未提供正式 Content_ID，未上线投放。真实抖音广告、切后台与平台安全区仍需真机验证；模拟广告不能代替平台验收。
- 当前工作区另有其他玩法移除/新增更改，本次未回滚、批量暂存或提交它们。

## 2026-10-04 后续：原版爆冲、高架与无感续路

用户重新明确允许碰撞震动，并要求原版无尽爆冲、高架、排气和双轮印。本文前述“无爆冲/无震动”结论由本节覆盖。

标题已从 authoring 与场景删除。排气/双轮印沿用 drift 的后轮几何、0.028秒轨迹、0.042秒烟尘、三层软烟、寿命与淡出；普通行驶不喷蓝色圆点。只有撞车触发0.28秒衰减震动。

从历史聊天和保存附件恢复原始 asm.js 与 GameSettings，核对阈值10/25/45/70/110/160/220、10段过渡、4倍爆冲、后段回正和高低层切换；证据见 work/drift-endless-original/report/findings.md。沿用 Cocos R300道路映射，不宣称完整Unity随机地图/高架素材逐像素一致。

续路同时检查剩余距离和末端的屏幕位置，保留屏幕外2400单位的末端余量；新路不在扩展视野内创建；旧路完整离开视野后才回收。8组（种子3/123/999/42、1334/1624两高度）中心线审计到500000单位，检查无屏内新增与断头；该审计不代表真人驾驶通关。

新增 test_drift_source_trails、test_drift_streaming、test_drift_endless_stages。保留驾驶参数和11个源控制器公式的一致性检查，TrackRuntime/生成器因过渡路与高架接入不再逐字一致。

独立审查发现并修复：空间续路死路、轮胎印覆盖车辆、高架插值漏layer、同节点Graphics抢占Sprite、爆冲长直道绕过安全检查。实际浏览器检查使用独立的道路定位夹具验证爆冲、主题、高架和碰撞震动，与触摸驾驶测试分开报告。

最终检查：Creator构建成功、TypeScript通过；触摸连续3弯和模拟广告复活通过；爆冲/桥面/碰撞震动夹具通过，震动结束位移回零。高架护栏单独子节点渲染并缓存，车辆与轮胎印按层显示。两种屏幕结算底距仍为88/122.13。一次并行浏览器运行出现临时socket资源错误，单独复跑错误列表为空。

## 连续加速箭头与赛道绘制优化（2026-10-04）

- 原 drift 的 `hspyjiantou1.png` 原样复制；按 `speedArrow.prefab` 的 230×140、y=-60/0/60 复建三箭头，每600单位两组。保留 SpeedArrowEffect 的0.68秒脉冲、透明度和缩放公式，改用共享引擎时钟，保证流式创建和池复用后的相位连续。
- 独立地面/高架标记层位于各自道路上方、同层车辆下方；绳索独立。场景及 authoring 增加 arrowFrame 引用。
- 道路贴图、尺寸、位置、缩放只在节点分配时写入；只有车辆跨层时重排层级。绘制节点在带360单位缓冲的视区附近分配，移出视野后才回收。12个双组三箭头节点在开局预热并独立复用。
- TrackRuntime 的路径采样查询改为二分搜索，已过采样点一次批量回收；原生成规则、ensureTrack 调用时机和驾驶参数保留。
- 回归：TypeScript检查、Creator web-mobile构建通过。全部 drift 规则脚本通过；8种尺寸/种子组合各跑到500000距离，通过屏幕外生成与前方道路充足检查。浏览器场景检查验证地面/高架箭头层级、230×140尺寸、动画变化，以及静止赛道节点每次render的setPosition/setScale/setParent调用为0；无页面异常。两种尺寸结算布局通过。
- 性能测量是桌面Chrome中连续调用的CPU微基准，不含完整GPU帧耗或手机表现。最终固定seed123、999次render：view平均0.057ms、P95约0.20ms、最大0.90ms；22次生成平均0.177ms、最大0.70ms。此前随机种子的探索性基线不可用于严谨百分比比较，未据此声称帧率提升比例或手机卡顿完全消除。可用 `node tools/profile_drift_render.cjs` 复查。
- 代码复核发现并修正了Sprite赋帧覆盖尺寸和分批创建动画时钟不同步两项问题；复核后未发现新问题。

## 漂移大厅入口与正式推荐流 ID（2026-10-04）

- 修复 DriftCard 缺失的 CardShadow/CardOutline/CardSurface；直接复用同排飞碟卡片的圆角底图、尺寸、颜色与前后顺序。保留道路/橙车缩略图。authoring 对已有和新建卡片都执行修复，重复运行无变化。
- 大厅标题、预览页标题、SDK场景名及路由说明统一为“漂移”。FEED_DRIFT_CONTENT_ID 使用用户给定的 CONTENT15441408514。
- 执行真实 resolveFeedEntry 方法的离线测试，验证该 ID 的获客路由进入 DriftFeedGameScene；旧复访模式仍回大厅。
- 现有漂移控制器已经调用共用插屏调度器，无需另建广告计时器。增加漂移ID专用离线模拟，验证推荐流预览不请求、正式进入等待2秒且受启动31秒下限约束、广告关闭后60秒再请求、退出后取消未展示请求。共13项插屏检查通过；没有请求真实广告。
- TypeScript与Creator web-mobile构建通过。浏览器750×1334、750×1624均验证卡片样式、名称和点击进入漂移，页面异常为0。截图 lobby-1334.png / lobby-1624.png。原生抖音广告素材展示仍需真机验证。

## 返回主页销毁异常修复（2026-10-04）

- 用户提供编辑器/抖音堆栈定位到 DriftFeedAudio.dispose：Cocos 先销毁 Canvas 的子节点及其组件，控制器 onDestroy 随后读取 AudioSource.node 时已为空。
- dispose 改为可重复调用，并在停止音频/销毁节点之前检查组件及节点有效性；退出后的延迟音频调用直接忽略。显式销毁仍会停止并销毁存活音频节点。
- DriftFeedEffects.dispose 仅释放模拟数据；不再调用活场景复用的 reset()，避免清理已销毁的 Graphics（Error 5000）。
- 新增子节点先销毁、重复dispose、退出后延迟回调回归用例：修复前失败，修复后通过。音效生命周期及粒子检查通过；TypeScript与web-mobile构建通过。
- 750×1334、750×1624各测试3次大厅→漂移→暂停/失败→连续点击返回主页，共6轮；均回到大厅且没有脚本/引擎console错误（忽略localhost的favicon.ico 404）。抖音原生包需重新构建后验证。

## 插屏出现时进入漂移暂停菜单（2026-10-04）

- 原因：drift.blocked() 把包含加载阶段的 isFullscreenAdBusy 当作静默冻结条件，没有显示暂停菜单。
- SDK 在原生 shown 回调首次确认展示时发送 EVENT_INTERSTITIAL_SHOWN；请求/失败不发送，重复回调只发一次。SDK不直接暂停引擎或改变其他玩法。
- 漂移订阅展示事件，调用现有 setPaused(true)，清理按住状态并静音。广告关闭不自动恢复，玩家点击“继续驾驶”才恢复。结算/碰撞阶段保留原流程；退出场景移除事件监听。插屏加载期间不再冻结驾驶，激励/分享仍保留原阻塞。
- controller回归、11项SDK回调/统计测试、13项插屏计时测试及TypeScript通过；Creator web-mobile构建成功。
- 两种尺寸的真实浏览器场景模拟shown/ended事件：显示“暂停驾驶”，等待时progress不变，ended后仍暂停，点继续后progress增长；并通过各3轮返回大厅无异常检查。这是本地事件模拟，没有请求原生广告，原生展示时机需抖音端重编译验证。
