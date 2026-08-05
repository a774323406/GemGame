import { EnvTool } from "./framework/Platform/sdk/EnvTool";

export const GameConfig = {
  debugLogEnabled: EnvTool.isByteDanceMiniGame() ? false : true,
  showAd: EnvTool.isByteDanceMiniGame() ? true : false, // 是否显示广告
  // 抖音开放平台「分享管理」中的素材 ID。当前素材审核通过后即可直接生效。
  shareTemplateId: "82bm97b3hb7a7c1d7j",
  shareTitle: "一起来拼豆吧",
  shareDescription: "邀请好友一起挑战宝石分类",
};

/**
 * 保留原始 console.log，避免重复应用配置时把已经禁用的空函数当成原实现。
 * warn / error 不属于普通调试打印，始终保留，便于正式环境排查故障。
 */
const originalConsoleLog = console.log.bind(console);
const disabledConsoleLog: typeof console.log = () => {};

export function applyDebugLogConfig(): void {
  console.log = GameConfig.debugLogEnabled ? originalConsoleLog : disabledConsoleLog;
}

// GameConfig 会在启动场景加载 SdkUtils 时初始化，因此能统一接管后续业务日志。
applyDebugLogConfig();
