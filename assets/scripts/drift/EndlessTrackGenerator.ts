export type EndlessTurnPlan = {
  sign: -1 | 1;
  degrees: 90 | 180;
  radius: number;
  straight: number;
  bridgeSwitch?:boolean;
};

/**
 * 无尽道路的确定性随机生成器。
 *
 * 原版 RoadCreator 会维护左右转向趋势、连续直道、连续转弯、回头弯开关等状态，
 * 再从当前允许的 RoadTypes 中随机，而不是每次独立等概率抽取。当前项目没有原版
 * BackTurn/ScalerRoad 的独立预制体，因此把同一套约束映射到 90°、180° 和直道长度：
 * - 同方向最多连续两弯；
 * - 180° 不连续出现，且前几个弯不生成；
 * - 直道长度随机，并在 180° 后保证足够的回正距离；
 * - 使用种子随机，线上问题可以通过 seed 重放。
 */
export class EndlessTrackGenerator {
  private state = 1;
  private sameDirectionCount = 0;
  private lastSign: -1 | 0 | 1 = 0;
  private lastWasFullTurn = false;

  public reset(seed: number): void {
    const normalizedSeed = Math.floor(Number(seed) || 0) >>> 0;
    this.state = normalizedSeed || 0x6d2b79f5;
    this.sameDirectionCount = 0;
    this.lastSign = 0;
    this.lastWasFullTurn = false;
  }

  public next(curveIndex: number): EndlessTurnPlan {
    const normalizedCurveIndex = Math.max(0, Math.floor(Number(curveIndex) || 0));
    const sign = this.pickSign();
    const difficulty = this.clamp01((normalizedCurveIndex - 6) / (65 - 6));
    const fullTurnChance = 0.12 + difficulty * 0.14;
    const canUseFullTurn = normalizedCurveIndex >= 3 && !this.lastWasFullTurn;
    const degrees: 90 | 180 = canUseFullTurn && this.random() < fullTurnChance ? 180 : 90;

    // 项目现有赛道图为 R300 弯道和 600 长直道，随机轨迹必须与图片几何一致。
    // 难度增长仍交给车速倍率，不通过缩放赛道图改变半径。
    const radius = 300;

    const straightOptions = degrees === 180 ? [600, 1200] : [600, 600, 1200];
    const straight = straightOptions[this.randomInt(straightOptions.length)];

    this.lastWasFullTurn = degrees === 180;
    return { sign, degrees, radius, straight, bridgeSwitch: normalizedCurveIndex>10 && degrees===180 && this.random()<1/3 };
  }

  private pickSign(): -1 | 1 {
    let sign: -1 | 1;
    if (this.lastSign !== 0 && this.sameDirectionCount >= 2) {
      sign = this.lastSign === 1 ? -1 : 1;
    } else {
      sign = this.random() < 0.5 ? -1 : 1;
    }

    if (sign === this.lastSign) {
      this.sameDirectionCount += 1;
    } else {
      this.lastSign = sign;
      this.sameDirectionCount = 1;
    }
    return sign;
  }

  private randomInt(maxExclusive: number): number {
    return Math.min(maxExclusive - 1, Math.floor(this.random() * maxExclusive));
  }

  private random(): number {
    // xorshift32
    let value = this.state >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x100000000;
  }

  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }
}
