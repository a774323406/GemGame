import { EnvTool } from "./framework/Platform/sdk/EnvTool";

export const GameConfig = {
  showAd: EnvTool.isWeChat() ? true : false, // 是否显示广告
};
