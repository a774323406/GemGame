# kdzzz 双鸭推荐流同步清单

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 yddbjd 的双鸭跳跃及主界面入口迁移至 kdzzz，保留目标分支身份配置。

**Architecture:** 从来源提交 1d49fa0 按文件迁移已验证的玩法、资源、场景和生成脚本。入口路由基于 kdzzz 修改，仅新增双鸭分支，保留外卖/摩托/漂移的兼容 ID 路由。

**Tech Stack:** Cocos Creator 3.8.5、TypeScript、Node 检查脚本。

**Spec:** 本次用户要求同步推荐流及主界面；ID、插屏 ID 使用 kdzzz 独有配置；用户自行构建测试。

## 约束

- 不覆盖 kdzzz 现有推荐流 ID、激励和插屏 ID、品牌 Logo。
- 不构建、不上传。修改保留在 kdzzz 工作区供用户检查。
- 用户补充双鸭专属 Content ID 为 `CONTENT16072580098`，替换此前 `xx` 占位；不能带入来源分支的正式 ID。
- 同步昨天的预加载就绪与首次触摸恢复修复；沿用共用重复插屏机制，插屏不主动暂停玩法。

## 核查重点

- 旧推荐流和额外兼容 ID 仍进入原玩法。
- 双鸭大厅按钮和资源引用完整，场景可按 authoring 再生。
- 两种结算尺寸及广告标识沿用现有布局。
- 来源广告 ID 不进入配置、测试或预览脚本。
- 只验证代码和序列化场景，不将旧构建当成本分支新包。

## 执行

- [x] 记录来源 1d49fa0、目标基线 ab60c4a；目标路由、主界面和插屏基线测试通过。
- [x] 同步双鸭 scene、controller、rules、媒体、主界面以及生成/验证脚本。
- [x] 为目标分支加入双鸭路由，接入专属 ID `CONTENT16072580098`；保留所有原有配置与兼容路由。
- [x] 调整推荐流和插屏测试、预览脚本，使用本分支配置。
- [x] 运行规则/控制器/场景/主界面/路由/结算/插屏/打点检查及项目类型检查。
- [x] 对比目标基线的身份配置和 Logo；检查来源分支未改动，汇总结果。

## 验证记录

- `xx` 路由回归：加入测试时实际返回大厅，测试失败；补充目标分支配置和路由后通过。
- `test_rope_duck_rules`、`test_rope_duck_difficulty`、`test_rope_duck_controller`、`test_rope_duck_integration`、`test_new_main_scene` 通过。主界面为 10 张卡片；双鸭媒体为 61,203 字节。
- `test_feed_integration` 4 项、`test_repeating_interstitial` 20 项、`test_ad_analytics` 11 项通过。
- `test_feed_result_layout --maintained-only` 与 `test_feed_screen_layout` 通过；覆盖序列化及生成布局，不宣称真机视觉已验收。
- TypeScript `--noEmit --pretty false --skipLibCheck`、`node --check tools/preview_rope_duck_feed.cjs`、`git diff --check` 通过。
- 对比目标基线：15 项原有 Content ID 全部保留；ByteDanceSDK、ADController、加载场景与 Logo 文件逐字节不变。双鸭 scene、controller、rules 和主界面与来源提交逐字节一致。
- 未把来源分支独有的 Content ID 复制到新增/修改文件，来源分支指针未改动。
- 决定：在用户指定的 kdzzz 工作区迁移，保留未提交改动；不构建、不上传、不运行旧构建的浏览器验证。

独立只读审查完成：未发现迁移问题；场景内部引用、资源 UUID 与脚本组件均可解析，无重复资源 UUID；共用依赖完整，目标分支兼容路由未变。原玩法设计及真机显示由既有实现和用户自行构建测试负责。
