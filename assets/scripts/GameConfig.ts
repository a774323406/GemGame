import { EnvTool } from "./framework/Platform/sdk/EnvTool";

export const GameConfig = {
  showAd: EnvTool.isByteDanceMiniGame() ? true : false, // 是否显示广告
};
