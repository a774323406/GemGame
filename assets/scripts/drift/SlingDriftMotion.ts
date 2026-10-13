export type SlingDriftState = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  heading: number;
};

export type SlingDriftPin = {
  x: number;
  y: number;
  turnSign: -1 | 1;
  /** 原版 LastPinRoad.GetEndPoint().up，用作松手过渡方向。 */
  exitHeading: number;
};

export type SlingDriftOptions = {
  fixedStep: number;
  defaultVelocity: number;
  turnValue: number;
  radiusMin: number;
  radiusMax: number;
  radiusSpeedMax: number;
  angularDrag: number;
  attachedTurnValue: number;
  driftAngle: number;
  recoveryTurnValue: number;
  transitionAngleMax: number;
  pushbackSpeedRatio: number;
  maxSubSteps: number;
};

type ActiveJoint = {
  pinX: number;
  pinY: number;
  radius: number;
  orbitSign: -1 | 1;
  lastOutwardHeading: number;
  exitHeading: number;
};

const DEFAULT_OPTIONS: SlingDriftOptions = {
  fixedStep: 1 / 60,
  defaultVelocity: 560,
  turnValue: 3,
  radiusMin: 105,
  radiusMax: 315,
  radiusSpeedMax: 1.5,
  angularDrag: 100,
  attachedTurnValue: 5,
  driftAngle: Math.PI / 6,
  recoveryTurnValue: 8,
  transitionAngleMax: Math.PI / 4,
  pushbackSpeedRatio: 0.0025,
  maxSubSteps: 4,
};

/**
 * Sling Drift 风格的固定步长运动求解器。
 *
 * 速度计算对应原版的切线目标速度与 Vector2.Lerp；ActiveJoint 则用
 * 圆周投影模拟静态 Pin 和车辆之间的 RevoluteJoint2D 距离约束。
 */
export class SlingDriftMotion {
  private readonly options: SlingDriftOptions = { ...DEFAULT_OPTIONS };
  private accumulator = 0;
  private joint: ActiveJoint | null = null;
  private angularVelocity = 0;
  private recoveryHeading: number | null = null;

  configure(options: Partial<SlingDriftOptions>): void {
    Object.assign(this.options, options);
    this.options.fixedStep = Math.max(1 / 240, this.options.fixedStep);
    this.options.defaultVelocity = Math.max(0, this.options.defaultVelocity);
    this.options.turnValue = Math.max(0, this.options.turnValue);
    this.options.radiusMin = Math.max(0, this.options.radiusMin);
    this.options.radiusMax = Math.max(this.options.radiusMin + 0.001, this.options.radiusMax);
    this.options.radiusSpeedMax = Math.max(1, this.options.radiusSpeedMax);
    this.options.angularDrag = Math.max(0, this.options.angularDrag);
    this.options.attachedTurnValue = Math.max(0, this.options.attachedTurnValue);
    this.options.driftAngle = Math.max(0, this.options.driftAngle);
    this.options.recoveryTurnValue = Math.max(0, this.options.recoveryTurnValue);
    this.options.transitionAngleMax = Math.max(0, this.options.transitionAngleMax);
    this.options.pushbackSpeedRatio = Math.max(0, this.options.pushbackSpeedRatio);
    this.options.maxSubSteps = Math.max(1, Math.floor(this.options.maxSubSteps));
  }

  reset(): void {
    this.accumulator = 0;
    this.joint = null;
    this.angularVelocity = 0;
    this.recoveryHeading = null;
  }

  detach(): void {
    this.joint = null;
  }

  /**
   * 对应原版 Car.HandlePushback。
   *
   * 原版松手一定会销毁 joint，但只有当前速度与
   * LastPinRoad.GetEndPoint().up 的夹角不超过约 40°~45° 时，才会
   * 写入 transitionDirection 并启动 dt * 8 的回正。这个门槛尤其重要：
   * 180° 弯前半段反复松按时，出口仍在车后方，不能每次都朝出口拧车头。
   */
  release(state: SlingDriftState): boolean {
    const releasedJoint = this.joint;
    this.joint = null;
    if (!releasedJoint) {
      return false;
    }

    // 每次真正建立 joint 时原版都会结束上一次 transition；这次松手
    // 能否重新进入 transition，要由下面的角度门槛重新判定。
    this.recoveryHeading = null;

    const speed = Math.sqrt(
      state.velocityX * state.velocityX + state.velocityY * state.velocityY,
    );
    if (speed <= 1e-6) {
      return false;
    }

    const velocityHeading = Math.atan2(state.velocityX, state.velocityY);
    const exitError = this.shortAngle(releasedJoint.exitHeading - velocityHeading);
    if (Math.abs(exitError) > this.options.transitionAngleMax) {
      return false;
    }

    this.recoveryHeading = releasedJoint.exitHeading;
    this.applyOriginalPushback(state, exitError, speed);
    return true;
  }

  isAttached(): boolean {
    return this.joint !== null;
  }

  /** 冲线刹停时对应原版 Rigidbody2D.angularVelocity 的当前角速度。 */
  getAngularVelocity(): number {
    return this.angularVelocity;
  }

  update(state: SlingDriftState, pin: SlingDriftPin | null, deltaTime: number): void {
    this.syncJoint(state, pin);

    const fixedStep = this.options.fixedStep;
    const maxAccumulatedTime = fixedStep * this.options.maxSubSteps;
    this.accumulator = Math.min(maxAccumulatedTime, this.accumulator + Math.max(0, deltaTime));

    let subSteps = 0;
    while (this.accumulator + 1e-8 >= fixedStep && subSteps < this.options.maxSubSteps) {
      this.fixedUpdate(state, fixedStep);
      this.accumulator -= fixedStep;
      subSteps++;
    }
  }

  private syncJoint(state: SlingDriftState, pin: SlingDriftPin | null): void {
    if (!pin) {
      this.joint = null;
      return;
    }

    if (this.joint && this.samePin(this.joint, pin)) {
      return;
    }

    const dx = pin.x - state.x;
    const dy = pin.y - state.y;
    const radius = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
    const inwardX = dx / radius;
    const inwardY = dy / radius;
    const preferredTangentX = -inwardY * pin.turnSign;
    const preferredTangentY = inwardX * pin.turnSign;
    const movingAgainstTurn =
      state.velocityX * preferredTangentX + state.velocityY * preferredTangentY < 0;

    this.joint = {
      pinX: pin.x,
      pinY: pin.y,
      radius,
      orbitSign: movingAgainstTurn ? (pin.turnSign === 1 ? -1 : 1) : pin.turnSign,
      lastOutwardHeading: Math.atan2(state.x - pin.x, state.y - pin.y),
      exitHeading: pin.exitHeading,
    };
    // 原版 AttachToJoint 成功后会把 isInTransition 设回 false。
    // 如果不清掉，上一次松手的出口方向会在快速重连期间继续生效。
    this.recoveryHeading = null;
  }

  private samePin(joint: ActiveJoint, pin: SlingDriftPin): boolean {
    return Math.abs(joint.pinX - pin.x) < 0.001 && Math.abs(joint.pinY - pin.y) < 0.001;
  }

  private fixedUpdate(state: SlingDriftState, fixedStep: number): void {
    let targetVelocityX = 0;
    let targetVelocityY = 0;

    if (this.joint) {
      const dx = this.joint.pinX - state.x;
      const dy = this.joint.pinY - state.y;
      const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
      const inwardX = dx / distance;
      const inwardY = dy / distance;
      const tangentX = -inwardY * this.joint.orbitSign;
      const tangentY = inwardX * this.joint.orbitSign;
      const radiusRatio = this.clamp01(
        (distance - this.options.radiusMin) / (this.options.radiusMax - this.options.radiusMin),
      );
      const radiusMultiplier = 1 + (this.options.radiusSpeedMax - 1) * radiusRatio;
      const targetSpeed = this.options.defaultVelocity * radiusMultiplier;

      targetVelocityX = tangentX * targetSpeed;
      targetVelocityY = tangentY * targetSpeed;
    } else {
      targetVelocityX = Math.sin(state.heading) * this.options.defaultVelocity;
      targetVelocityY = Math.cos(state.heading) * this.options.defaultVelocity;
    }

    const velocityBlend = this.clamp01(fixedStep * this.options.turnValue);
    state.velocityX += (targetVelocityX - state.velocityX) * velocityBlend;
    state.velocityY += (targetVelocityY - state.velocityY) * velocityBlend;
    state.x += state.velocityX * fixedStep;
    state.y += state.velocityY * fixedStep;

    if (this.joint) {
      this.applyJointConstraint(state, fixedStep);
    } else {
      // Unity/Box2D 先衰减松开 HingeJoint2D 时留下的角速度；随后原版
      // Car.Update 的方向误差控制和上面的速度 Lerp 一起完成回摆收敛。
      this.angularVelocity /= 1 + fixedStep * this.options.angularDrag;
      state.heading += this.angularVelocity * fixedStep;
      this.applyOriginalRecoverySteering(state, fixedStep);
    }
  }

  /**
   * 对应原版 Car.Update 的松手回正：
   *
   * angle = SignedAngle(rigidbody.velocity.normalized, savedPinUp)
   * rotation = Lerp(rotation, rotation * Euler(0, 0, angle), dt * 8)
   *
   * 注意目标不是直接把车头插值到道路方向，而是用“速度到出口方向”的
   * 误差继续修正车身。它和 FixedUpdate 中 turnValue=3 的速度追车头共同
   * 组成欠阻尼闭环，因此才会出现先甩出、再摆回并收稳的动作。
   */
  private applyOriginalRecoverySteering(state: SlingDriftState, fixedStep: number): void {
    if (this.recoveryHeading === null || this.options.recoveryTurnValue <= 0) {
      return;
    }

    const speedSq = state.velocityX * state.velocityX + state.velocityY * state.velocityY;
    if (speedSq <= 1e-8) {
      return;
    }

    const velocityHeading = Math.atan2(state.velocityX, state.velocityY);
    const velocityToExitError = this.shortAngle(this.recoveryHeading - velocityHeading);
    const rotationBlend = this.clamp01(fixedStep * this.options.recoveryTurnValue);
    state.heading += velocityToExitError * rotationBlend;
  }

  /**
   * HandlePushback 在通过角度门槛后，会沿车身局部左右方向给速度一个
   * 0.015~0.025（原版默认速度为 8）的微调。这里按速度比例换算到当前
   * 世界单位，并朝缩小出口夹角的方向施加同等量级的修正。
   */
  private applyOriginalPushback(
    state: SlingDriftState,
    exitError: number,
    speed: number,
  ): void {
    if (Math.abs(exitError) <= 1e-6 || this.options.pushbackSpeedRatio <= 0) {
      return;
    }

    const rightX = Math.cos(state.heading);
    const rightY = -Math.sin(state.heading);
    const push = Math.max(this.options.defaultVelocity, speed) * this.options.pushbackSpeedRatio;
    const sign = exitError > 0 ? 1 : -1;
    state.velocityX += rightX * push * sign;
    state.velocityY += rightY * push * sign;
  }

  private applyJointConstraint(state: SlingDriftState, fixedStep: number): void {
    if (!this.joint) {
      return;
    }

    let outwardX = state.x - this.joint.pinX;
    let outwardY = state.y - this.joint.pinY;
    const distance = Math.sqrt(outwardX * outwardX + outwardY * outwardY);
    if (distance <= 1e-6) {
      outwardX = 1;
      outwardY = 0;
    } else {
      outwardX /= distance;
      outwardY /= distance;
    }

    state.x = this.joint.pinX + outwardX * this.joint.radius;
    state.y = this.joint.pinY + outwardY * this.joint.radius;

    const radialVelocity = state.velocityX * outwardX + state.velocityY * outwardY;
    state.velocityX -= outwardX * radialVelocity;
    state.velocityY -= outwardY * radialVelocity;

    const headingBeforeConstraint = state.heading;
    const outwardHeading = Math.atan2(outwardX, outwardY);
    const orbitalHeadingDelta = this.shortAngle(outwardHeading - this.joint.lastOutwardHeading);
    const hingeHeading = state.heading + orbitalHeadingDelta;

    // 原版 Car.Update 在拉住时还会把车身插值到漂移目标角，常量为
    // deltaTime * 5，目标相对运动切线偏 30°。仅跟随铰链圆周角会让
    // 车头和速度保持任意的初始夹角，无法稳定复现原版松手时约 30°
    // 的侧滑储量。
    const speedSq = state.velocityX * state.velocityX + state.velocityY * state.velocityY;
    if (speedSq > 1e-8) {
      const velocityHeading = Math.atan2(state.velocityX, state.velocityY);
      const targetDriftHeading =
        velocityHeading + this.joint.orbitSign * this.options.driftAngle;
      const attachedBlend = this.clamp01(fixedStep * this.options.attachedTurnValue);
      state.heading =
        hingeHeading + this.shortAngle(targetDriftHeading - hingeHeading) * attachedBlend;
    } else {
      state.heading = hingeHeading;
    }

    this.angularVelocity =
      this.shortAngle(state.heading - headingBeforeConstraint) / fixedStep;
    this.joint.lastOutwardHeading = outwardHeading;
  }

  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private shortAngle(angle: number): number {
    while (angle > Math.PI) {
      angle -= Math.PI * 2;
    }
    while (angle < -Math.PI) {
      angle += Math.PI * 2;
    }
    return angle;
  }
}
