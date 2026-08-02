/**
 * 抖音推荐流直玩复访版配置。
 *
 * 后台路径：运营 -> 能力中心 -> 推荐流直玩游戏能力 -> 复访能力。
 * 选择「重要事件掉落」并完成方案提报后，把平台生成的 CONTENT... 填到这里。
 */
export const FEED_REVISIT_CONTENT_ID = "CONTENT14256097026";

/** 抖音固定场景：3 = 重要事件掉落。 */
export const FEED_REVISIT_SCENE = 3;

/** 项目中独立于正式 1～222 关的每日挑战关。 */
export const FEED_REVISIT_CHALLENGE_LEVEL = 300;
export const FEED_REVISIT_CHALLENGE_SECONDS = 60;
export const FEED_REVISIT_REVIVE_SECONDS = 45;

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
