/**
 * 抖音推荐流直玩复访版配置。
 *
 * 后台路径：运营 -> 能力中心 -> 推荐流直玩游戏能力 -> 复访能力。
 * 选择「重要事件掉落」并完成方案提报后，把平台生成的 CONTENT... 填到这里。
 */
export const FEED_REVISIT_CONTENT_ID = "CONTENT14256097026";

/** 抖音固定场景：3 = 重要事件掉落。 */
export const FEED_REVISIT_SCENE = 3;

/** 每日挑战仅从当前初始时间为 2～3 分钟的正式关卡中抽取。 */
export const FEED_REVISIT_CHALLENGE_MIN_SECONDS = 120;
export const FEED_REVISIT_CHALLENGE_MAX_SECONDS = 180;

/**
 * 按当前 LevelDifficulty 公式和 Level1～Level222 数据生成。
 * 调整关卡计时后，应同步更新该候选池，避免每日挑战落到时间范围之外。
 */
export const FEED_REVISIT_CHALLENGE_LEVELS = [
  7, 8, 10, 11, 13, 15, 17, 19, 20, 25, 26, 27, 31, 33, 34, 36, 40, 42, 45, 46, 47, 51, 52,
  55, 57, 63, 64, 65, 66, 69, 77, 80, 81, 82, 89, 90, 92, 93, 94, 96, 97, 99, 101, 102,
  103, 104, 108, 109, 110, 112, 115, 118, 121, 125, 127, 128, 132, 137, 140, 141, 143, 145,
  146, 151, 153, 156, 159, 160, 162, 163, 166, 168, 172, 173, 182, 185, 186, 188, 190, 193,
  206, 213, 217,
] as const;

/** 兼容改版前已经排期、extra 中仍记录第 222/300 关的复访事件。 */
export const FEED_REVISIT_LEGACY_CHALLENGE_LEVELS = [222, 300] as const;

/** 测试/预览版便于真机验收；正式版保持每日一次。 */
export const FEED_REVISIT_TEST_DELAY_MS = 60 * 1000;
export const FEED_REVISIT_PRODUCTION_DELAY_MS = 24 * 60 * 60 * 1000;

export function isFeedRevisitChallengeLevel(level: number): boolean {
  return (FEED_REVISIT_CHALLENGE_LEVELS as readonly number[]).indexOf(level) >= 0;
}

export function pickFeedRevisitChallengeLevel(randomValue = Math.random()): number {
  const normalizedRandom = Number.isFinite(randomValue)
    ? Math.min(0.999999999, Math.max(0, randomValue))
    : 0;
  const index = Math.floor(normalizedRandom * FEED_REVISIT_CHALLENGE_LEVELS.length);
  return FEED_REVISIT_CHALLENGE_LEVELS[index];
}

/** 启动 extra 无效或来自旧排期时，也回退到当前 2～3 分钟候选池。 */
export function resolveFeedRevisitChallengeLevel(extra: string): number {
  try {
    const level = Number(JSON.parse(extra || "{}")?.level);
    if (isFeedRevisitChallengeLevel(level)) return level;
  } catch {
    // 交给随机候选兜底。
  }
  return pickFeedRevisitChallengeLevel();
}

/** extra 必须少于 100 字符；readyAt 也用作同一期挑战的唯一领奖标识。 */
export function createFeedRevisitExtra(
  readyAt: number,
  challengeLevel = pickFeedRevisitChallengeLevel(),
): string {
  const level = isFeedRevisitChallengeLevel(challengeLevel)
    ? challengeLevel
    : pickFeedRevisitChallengeLevel();
  return JSON.stringify({
    event: "daily_gem_challenge",
    level,
    readyAt,
  });
}
