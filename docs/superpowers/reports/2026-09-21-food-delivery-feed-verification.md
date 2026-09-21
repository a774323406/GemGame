# 外卖精准投送推荐流验收报告

日期：2026-09-21

## 结论

本地首版已经完成并通过规则、场景、控制器、主页接入、推荐流生命周期、广告回归、TypeScript、Cocos web-mobile 构建和真实浏览器触摸验收。主页序列化卡片可以进入 `FoodDeliveryFeedGameScene`；五份订单可以依次完成并通关；失败、重试、下一轮、返回主页和再次进入均通过。

这不是抖音真机发布结论：`FEED_FOOD_DELIVERY_CONTENT_ID` 仍为空字符串，尚未配置真实推荐流 ID，也没有在抖音真机验证预览切入、触摸、后台恢复和插屏关闭恢复。

## 构建证据

- Cocos Creator：3.8.5
- 构建目录：`/tmp/gem-food-delivery-build.2wUDXa/web-mobile`
- 构建日志：`.superpowers/sdd/2026-09-21-food-delivery-feed/task-5-build-resize.log`
- 日志结果：`build success in 6733!`
- 命令进程退出码：36。Creator CLI 在成功写出完整产物后仍返回 36；本报告不把退出码隐藏为 0，而是以日志成功标记、产物存在、场景注册和浏览器实跑共同确认构建可用。
- `gamescene/config.json` 包含：
  - 场景名 `FoodDeliveryFeedGameScene`
  - UUID `fccc8a6c-9bab-5757-a411-a8bf4c40935b`
  - `gamescene` bundle 映射

构建日志仍有项目现存的 `ADController -> SdkUtils -> BaseSDK -> ADController` 循环依赖警告，本次构建没有因此失败。

## 浏览器实际渲染与触摸

验收命令：

```bash
node tools/preview_food_delivery_feed.cjs \
  http://127.0.0.1:8139/ \
  /tmp/gem-food-delivery-shots-final
```

结果：退出码 0，`errors: []`，`blockedRequests: []`。测试期间拦截真实外部请求，没有发送抖音打点或广告请求。

覆盖内容：

- 从 `NewMainScene` 的序列化 `FoodDeliveryCard` 进入，不直接调用场景方法跳转。
- 使用 CDP `touchStart/touchEnd` 完成五次真实碰撞，分数 1→5，第五单进入 `won`。
- 成功页、下一轮、失败页、失败后重试、返回主页、再次进入均通过。
- 检查 750×1624、750×1334、750×1800 三种视口。
- 750×1334 下玩法层缩放为 `1334 / 1624 = 0.821428...`，标题底部为 158px，五星顶部为约 173.32px，保留约 15.32px 间距。
- 三种视口中背景覆盖完整，五个订单、骑手、保安和返回按钮均在可视范围内。
- 推荐流预览只旋转手臂，不投掷、不计分、不请求插屏；正式进入后首次触摸只发射一次。
- `feedExit` 后物理冻结；hide/show、销毁和排队中的晚到原生/Cocos 触摸均通过。
- 销毁后原生触摸监听数量为 0。

产物：

- `/tmp/gem-food-delivery-shots-final/gameplay-750x1624.png`
- `/tmp/gem-food-delivery-shots-final/gameplay-short.png`
- `/tmp/gem-food-delivery-shots-final/gameplay-tall.png`
- `/tmp/gem-food-delivery-shots-final/success.png`
- `/tmp/gem-food-delivery-shots-final/failure.png`
- `/tmp/gem-food-delivery-shots-final/food-delivery-browser-verification.json`

## 静态、规则与回归验证

以下命令最终均以退出码 0 完成：

```text
node tools/test_food_delivery_rules.cjs
node tools/test_food_delivery_scene.cjs
node tools/test_food_delivery_controller.cjs
node tools/test_food_delivery_integration.cjs
node tools/test_new_main_scene.cjs
node tools/test_ad_analytics.cjs
node tools/test_feed_integration.cjs
node tools/test_feed_revisit_disabled.cjs
node tools/test_repeating_interstitial.cjs
node tools/test_retired_games_removed.cjs
node tools/test_feed_audio.cjs
node tools/test_balloon_feed.cjs
node tools/test_penguin_stack_feed.cjs
node tools/test_preview_food_delivery_feed.cjs
/Applications/Cocos/Creator/3.8.5/CocosCreator.app/Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json --skipLibCheck true
git diff --check
```

重点结果：

- 规则、场景、控制器和主页/推荐流接入通过。
- 广告事件 10 项、推荐流集成 15 项、重复插屏 12 项通过。
- 复访关闭 5 项、气球 33 项、企鹅 7 项、推荐流音频 36 项通过。
- 已下线玩法与旧主页仍保持删除状态，没有被本功能恢复。
- 浏览器验收工具缺少 URL 或输出目录时会直接失败，避免误验陈旧构建。

## 图片包体与纹理内存

`assets/res/foodDeliveryFeed` 内 18 张发布图片统计：

- 压缩文件总大小：372,443 bytes（363.71 KiB）。
- 预计 RGBA 解码纹理：5,754,480 bytes（5.49 MiB）。
- `background.jpg`：750×1624，47,060 bytes；预计 RGBA 解码 4,872,000 bytes（约 4.65 MiB）。

JPG 降低的是包体，不会降低同尺寸解码纹理内存；因此报告同时保留两种统计。

## 尚需发布前验证

1. 用户提供真实 `FEED_FOOD_DELIVERY_CONTENT_ID` 后填写配置，并验证未知 ID 兜底没有变化。
2. 重新打抖音包，在真实推荐流卡片检查预览稳定渲染、正式进入首触、退出/后台恢复。
3. 真机检查插屏关闭后音频和触摸恢复；本地只验证了平台桩和浏览器触摸，不能替代真机。

