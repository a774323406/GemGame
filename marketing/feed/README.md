# 抖音推荐流素材

## 推荐用法

- `acquisition-feed-cover-final.png`：获客流，突出“一步完成”的即时爽点。
- `revisit-random-daily-cover-final.png`：复访流，以中心问号盘面表达随机每日挑战，不对应某一个固定关卡。
- `*-art.png`：无字底图，方便后台规格或文案变化时重新排版。
- `*-layout.svg`：可直接编辑的排版参考。

## 随机关卡策略

当前实现用一个复访 `Content ID`，在事件排期时把随机关卡写入 `extra`。平台素材不能根据 `extra.level` 动态换图，因此复访封面不展示关卡号和固定盘面，只承诺稳定存在的体验：每日随机挑战、2～3 分钟候选池、通关获得道具。

如果以后必须让封面与关卡图案严格一致，需要在抖音后台建立多个复访内容方案（多个 `Content ID`），按主题或难度分组，并在排期时同时选择匹配的 `Content ID` 和关卡；不建议为每个关卡单独建方案。

## 重新导出

安装 Pillow 后执行：

```bash
python3 marketing/feed/render_feed_covers.py
```
