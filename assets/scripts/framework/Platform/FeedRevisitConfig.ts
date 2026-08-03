/**
 * 抖音推荐流直玩复访版配置。
 *
 * 后台路径：运营 -> 能力中心 -> 推荐流直玩游戏能力 -> 复访能力。
 * 选择「重要事件掉落」并完成方案提报后，把平台生成的 CONTENT... 填到这里。
 */
export const FEED_REVISIT_CONTENT_ID = "CONTENT14256097026";

/** 抖音固定场景：3 = 重要事件掉落。 */
export const FEED_REVISIT_SCENE = 3;

/** 每日挑战复用正式关卡中难度最高的第 222 关。 */
export const FEED_REVISIT_CHALLENGE_LEVEL = 222;
/** 与第 222 关的压力难度曲线一致，难度来自棋盘本身，而不是不可完成的超短倒计时。 */
export const FEED_REVISIT_CHALLENGE_SECONDS = 425;
export const FEED_REVISIT_REVIVE_SECONDS = 150;

/** 兼容改版前已经排期、extra 中仍记录第 300 关的复访事件。 */
export const FEED_REVISIT_LEGACY_CHALLENGE_LEVELS = [300] as const;

/** 测试/预览版便于真机验收；正式版保持每日一次。 */
export const FEED_REVISIT_TEST_DELAY_MS = 60 * 1000;
export const FEED_REVISIT_PRODUCTION_DELAY_MS = 24 * 60 * 60 * 1000;

/** extra 必须少于 100 字符；readyAt 也用作同一期挑战的唯一领奖标识。 */
export function createFeedRevisitExtra(readyAt: number): string {
  return JSON.stringify({
    event: "daily_gem_challenge",
    level: FEED_REVISIT_CHALLENGE_LEVEL,
    readyAt,
  });
}
