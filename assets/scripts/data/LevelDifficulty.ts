export interface LevelTimingData {
  rows: number;
  cols: number;
  complete: number[][];
  shuffle: number[][];
}

export interface LevelTimingResult {
  initialSeconds: number;
  reviveSeconds: number;
  baseSeconds: number;
  isPressureLevel: boolean;
  tileCount: number;
  misplacedCount: number;
  misplacedGroupCount: number;
  transferBatchCount: number;
}

const TRAY_BATCH_SIZE = 12;
const MIN_LEVEL_SECONDS = 60;
const MAX_LEVEL_SECONDS = 600;
const MIN_REVIVE_SECONDS = 30;
const DEFAULT_MAX_REVIVE_SECONDS = 180;
const LEVEL_TIME_BUFFER_FACTOR = 1.5;
const PRESSURE_TIME_FACTOR = 1.2;
const PRESSURE_LEVEL_MAX_SECONDS = 300;

/**
 * 这些关卡本身就是数据中的难度尖峰，因此在基础时间上额外增加 20%。
 * 为避免单关过长，压力关初始时间最多为 5 分钟。
 */
const PRESSURE_LEVELS = new Set([
  10, 21, 30, 37, 50,
]);

const CONNECTED_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];

function roundToFive(seconds: number): number {
  return Math.max(5, Math.round(seconds / 5) * 5);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 根据真实棋盘计算关卡时间：
 * - 错位连通组越多，玩家需要识别和选择的次数越多；
 * - 单组超过 12 个时，受托盘容量限制，需要拆成多批搬运；
 * - 颜色数和棋盘规模用于补偿观察、查找时间。
 */
export function calculateLevelTiming(
  levelIndex: number,
  data: LevelTimingData,
  fallbackSeconds = 300,
  maxReviveSeconds = DEFAULT_MAX_REVIVE_SECONDS,
): LevelTimingResult {
  if (!data?.complete?.length || !data?.shuffle?.length) {
    const initialSeconds = roundToFive(clamp(fallbackSeconds, MIN_LEVEL_SECONDS, MAX_LEVEL_SECONDS));
    return {
      initialSeconds,
      reviveSeconds: roundToFive(
        clamp(initialSeconds * 0.3, MIN_REVIVE_SECONDS, maxReviveSeconds || DEFAULT_MAX_REVIVE_SECONDS),
      ),
      baseSeconds: initialSeconds,
      isPressureLevel: false,
      tileCount: 0,
      misplacedCount: 0,
      misplacedGroupCount: 0,
      transferBatchCount: 0,
    };
  }

  const rows = data.rows || data.complete.length;
  const cols = data.cols || Math.max(...data.complete.map((row) => row.length));
  const colors = new Set<number>();
  const visited = new Set<string>();
  const misplacedGroupSizes: number[] = [];
  let tileCount = 0;
  let misplacedCount = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const targetColor = data.complete[row]?.[col] || 0;
      const blockColor = data.shuffle[row]?.[col] || 0;
      if (targetColor > 0) {
        tileCount++;
        colors.add(targetColor);
      }
      if (targetColor !== blockColor) misplacedCount++;

      const startKey = `${row},${col}`;
      if (blockColor <= 0 || targetColor === blockColor || visited.has(startKey)) continue;

      const queue: Array<[number, number]> = [[row, col]];
      visited.add(startKey);
      let queueIndex = 0;
      let groupSize = 0;

      while (queueIndex < queue.length) {
        const [currentRow, currentCol] = queue[queueIndex++];
        groupSize++;

        for (const [deltaRow, deltaCol] of CONNECTED_DIRECTIONS) {
          const nextRow = currentRow + deltaRow;
          const nextCol = currentCol + deltaCol;
          const nextKey = `${nextRow},${nextCol}`;
          if (nextRow < 0 || nextRow >= rows || nextCol < 0 || nextCol >= cols || visited.has(nextKey)) {
            continue;
          }

          const nextBlockColor = data.shuffle[nextRow]?.[nextCol] || 0;
          const nextTargetColor = data.complete[nextRow]?.[nextCol] || 0;
          if (nextBlockColor !== blockColor || nextTargetColor === blockColor) continue;

          visited.add(nextKey);
          queue.push([nextRow, nextCol]);
        }
      }

      misplacedGroupSizes.push(groupSize);
    }
  }

  const transferBatchCount = misplacedGroupSizes.reduce(
    (total, groupSize) => total + Math.ceil(groupSize / TRAY_BATCH_SIZE),
    0,
  );
  const misplacedGroupCount = misplacedGroupSizes.length;

  const estimatedSeconds =
    25 +
    transferBatchCount * 2.4 +
    misplacedGroupCount * 1.2 +
    colors.size * 2 +
    Math.sqrt(tileCount) * 0.6;
  const baseSeconds = roundToFive(
    clamp(
      estimatedSeconds * LEVEL_TIME_BUFFER_FACTOR,
      MIN_LEVEL_SECONDS,
      MAX_LEVEL_SECONDS,
    ),
  );
  const isPressureLevel = PRESSURE_LEVELS.has(levelIndex);
  const initialSeconds = isPressureLevel
    ? roundToFive(
        clamp(
          baseSeconds * PRESSURE_TIME_FACTOR,
          MIN_LEVEL_SECONDS,
          PRESSURE_LEVEL_MAX_SECONDS,
        ),
      )
    : baseSeconds;
  const configuredMaxRevive = Math.max(
    MIN_REVIVE_SECONDS,
    Number(maxReviveSeconds) || DEFAULT_MAX_REVIVE_SECONDS,
  );
  const reviveRatio = isPressureLevel ? 0.35 : 0.3;
  const reviveSeconds = roundToFive(
    clamp(initialSeconds * reviveRatio, MIN_REVIVE_SECONDS, configuredMaxRevive),
  );

  return {
    initialSeconds,
    reviveSeconds,
    baseSeconds,
    isPressureLevel,
    tileCount,
    misplacedCount,
    misplacedGroupCount,
    transferBatchCount,
  };
}
