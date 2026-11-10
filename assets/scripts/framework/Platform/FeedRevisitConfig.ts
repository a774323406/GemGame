/** 爱心第 8 关获客方案。 */
export const FEED_HEART_CONTENT_ID: string = "CONTENT15319004674";
export const FEED_HEART_LEVEL = 8;

/**
 * 颠球挑战推荐流方案 ID。
 * 加载页会根据该 ID 自动路由到 JuggleBallGameScene。
 */
export const FEED_JUGGLE_CONTENT_ID = "CONTENT14893670402";

/**
 * 颠球挑战第二关推荐流方案 ID。
 * 该方案直接进入 JuggleBallGameScene 第二关。
 */
export const FEED_JUGGLE_LEVEL2_CONTENT_ID = "CONTENT14759731202";

/** 抓鸭子挑战推荐流方案，直接进入 DuckGrabFeedGameScene。 */
export const FEED_DUCK_GRAB_CONTENT_ID = "CONTENT15927307010";

/** 外卖精准投送推荐流方案，直接进入 FoodDeliveryFeedGameScene。 */
export const FEED_FOOD_DELIVERY_CONTENT_ID = "CONTENT15936572162";

/** 套大鹅推荐流方案，直接进入 WhiteGooseFeedGameScene。 */
export const FEED_WHITE_GOOSE_CONTENT_ID = "CONTENT16249041666";

/** 口算大挑战推荐流方案，直接进入 MathExamFeedGameScene。 */
export const FEED_MATH_EXAM_CONTENT_ID: string = "CONTENT15825828354";

/** 复访方案已在抖音后台下线：暂停订阅、排期上报与奖励；获客直玩不受影响。 */
export const FEED_REVISIT_ENABLED = false;

/**
 * 抖音推荐流直玩复访版配置。
 *
 * 恢复前须核对后台实际复访 Content_ID，不能直接复用获客 ID。
 * 原方案随玩法删除而清空。后台路径：运营 -> 能力中心 ->
 * 推荐流直玩游戏能力 -> 复访能力。该方案必须处于已上线状态才能承接正式流量。
 */
export const FEED_REVISIT_CONTENT_ID: string = "";

/** 抖音固定场景：3 = 重要事件掉落。 */
export const FEED_REVISIT_SCENE = 3;

/** 为后续重新配置的复访保留通用事件标识；当前复访停用。 */
export const FEED_REVISIT_EVENT = "game_challenge";

/** 以下随机关卡配置仅用于兼容改版前已经投放的复访 extra。 */
export const FEED_REVISIT_CHALLENGE_MIN_SECONDS = 120;
export const FEED_REVISIT_CHALLENGE_MAX_SECONDS = 180;

/**
 * 旧版复访的兼容候选；只保留当前 Level1～Level50 内的关卡。
 */
export const FEED_REVISIT_CHALLENGE_LEVELS = [
  7, 8, 10, 11, 13, 15, 17, 19, 20, 25, 26, 27, 31, 33, 34, 36, 40, 42, 45, 46, 47,
] as const;

/** 仅识别改版前已投放的 222/300 标识；真正进入时会映射到现有候选。 */
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

/** 仅供旧版 GameScene 入口兼容；新的推荐流入口不会调用。 */
export function resolveFeedRevisitChallengeLevel(extra: string): number {
  try {
    const level = Number(JSON.parse(extra || "{}")?.level);
    if (isFeedRevisitChallengeLevel(level)) return level;
  } catch {
    // 交给随机候选兜底。
  }
  return pickFeedRevisitChallengeLevel();
}

/** extra 必须少于 100 字符；新版挑战不再写入随机关卡编号。 */
export function createFeedRevisitExtra(readyAt: number): string {
  return JSON.stringify({
    event: FEED_REVISIT_EVENT,
    readyAt,
  });
}

/** 狂暴摩托推荐流方案。 */
export const FEED_MOTO_RACE_CONTENT_ID = "CONTENT15897954818";

/** 飞碟射击推荐流方案，直接进入 ClayPigeonGameScene。 */
export const FEED_CLAY_PIGEON_CONTENT_ID: string = "CONTENT15960888834";

/** 漂移推荐流获客方案。 */
export const FEED_DRIFT_CONTENT_ID: string = "CONTENT15927306754";

/** 劈砖挑战推荐流方案，直接进入 BrickChopFeedGameScene。 */
export const FEED_BRICK_CHOP_CONTENT_ID = "CONTENT15825829378";

/** 双鸭跳跃推荐流方案，直接进入 RopeDuckFeedGameScene。 */
export const FEED_ROPE_DUCK_CONTENT_ID = "CONTENT16072577794";
