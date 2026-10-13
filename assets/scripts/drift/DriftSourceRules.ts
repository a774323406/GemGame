// Authoritative routines copied from drift/GameSceneController.ts; keep formulas unchanged.
import {TrackRuntime,AnchorPoint,TrackSample,ClosestTrackPoint} from './TrackRuntime';
import {SlingDriftState} from './SlingDriftMotion';
export class DriftSourceRules {
 readonly sampleStep=20; readonly roadHalfWidth=165; readonly carWidth=125; readonly carHeight=238;
 readonly driftEnterLead=120; readonly ropePreconnectExtraRatio=.8; readonly hookDistance=560;
 readonly carCollisionWidthRatio=.38; readonly carCollisionLengthRatio=.3;
 activeAnchor:AnchorPoint|null=null;recentAnchor:AnchorPoint|null=null;activeRecovery=null;
 constructor(readonly runtime:TrackRuntime,readonly car:SlingDriftState,public progress=0){}
 get anchors(){return this.runtime.anchors;} get track(){return this.runtime.track;}
 get carX(){return this.car.x;} get carY(){return this.car.y;}
 getActiveCarScale(){return .58;}
 getTrackPoint(s:number){return this.runtime.getTrackPoint(s);}
 pointWithOffset(s:number,offset:number){return this.runtime.pointWithOffset(s,offset);}
 ensureTrack(s:number){this.runtime.ensureTrack(s,this.progress);}
 shortAngle(a:number){return Math.atan2(Math.sin(a),Math.cos(a));}
  continuousTurnHandoffS(previous: AnchorPoint, next: AnchorPoint): number | null {
    // 同方向紧邻弯已由 TrackRuntime 合并；这里只处理 S 弯式的反向切换。
    if (Math.sign(previous.offset) === Math.sign(next.offset)) {
      return null;
    }

    // 直接相连的弯道中，下一弯入口会落在上一弯 recoverS 附近。
    // 留出两个采样步长吸收曲线采样误差，但不会把一格正常直道判成连续弯。
    if (next.constraintStartS > previous.recoverS + this.sampleStep * 2) {
      return null;
    }

    // 上一弯的理想松手点到下一弯入口之间只开放一个 Pin。
    // 取中点能给玩家留下“松开上一弯、按下下一弯”的短暂操作窗口。
    return (previous.releaseS + next.constraintStartS) * 0.5;
  }
  canSelectAnchorAtProgress(index: number, progress: number): boolean {
    const anchor = this.anchors[index];
    if (!anchor) {
      return false;
    }

    const previous = index > 0 ? this.anchors[index - 1] : null;
    if (previous) {
      const previousHandoffS = this.continuousTurnHandoffS(previous, anchor);
      if (previousHandoffS != null && progress < previousHandoffS) {
        return false;
      }
    }

    const next = index + 1 < this.anchors.length ? this.anchors[index + 1] : null;
    if (next) {
      const nextHandoffS = this.continuousTurnHandoffS(anchor, next);
      if (nextHandoffS != null && progress >= nextHandoffS) {
        return false;
      }
    }

    return true;
  }
  findAutoAnchor(): AnchorPoint | null {
    const activeAnchorIndex = this.activeAnchor ? this.anchors.indexOf(this.activeAnchor) : -1;
    if (
      this.activeAnchor
      && this.progress <= this.activeAnchor.recoverS + 18
      && this.canSelectAnchorAtProgress(activeAnchorIndex, this.progress)
    ) {
      return this.activeAnchor;
    }

    const recentAnchorIndex = this.recentAnchor ? this.anchors.indexOf(this.recentAnchor) : -1;
    if (
      this.recentAnchor &&
      this.progress >= this.recentAnchor.driftStartS - 80 &&
      this.progress <= this.recentAnchor.recoverS + 18 &&
      this.canSelectAnchorAtProgress(recentAnchorIndex, this.progress)
    ) {
      return this.recentAnchor;
    }

    let best: AnchorPoint | null = null;
    let bestScore = Number.MAX_VALUE;

    for (let anchorIndex = 0; anchorIndex < this.anchors.length; anchorIndex++) {
      const anchor = this.anchors[anchorIndex];
      // 连续反向弯的交接点两侧只开放各自对应的 Pin，避免空间距离评分
      // 在两个相邻锚点之间来回跳选。
      if (!this.canSelectAnchorAtProgress(anchorIndex, this.progress)) {
        continue;
      }

      const deltaS = anchor.s - this.progress;
      const recoverDelta = anchor.recoverS - this.progress;
      const ropeConnectStartS = anchor.driftStartS - this.driftEnterLead * this.ropePreconnectExtraRatio;
      const isCurrentAnchor = anchor === this.activeAnchor;
      const isRecentAnchor = anchor === this.recentAnchor && this.progress <= anchor.recoverS + 18;
      const isReusableAnchor = isCurrentAnchor || isRecentAnchor;
      // 原版先开放当前道路的 Pin，按下后才建立可见的 RopeConnection；
      // 车辆继续前进、越过入弯切线后，才把 Pin 挂入 Joint 开始真正漂移。
      // ropeConnectStartS 是调早 30% 后的 Pin 开放点。不能只按锚点空间距离选取，
      // 否则直道上离弯道还很远时也会出现一根完全不受力的“假拉索”。
      if (
        (!isReusableAnchor && (this.progress < ropeConnectStartS || recoverDelta < 18)) ||
        deltaS > this.hookDistance + 160
      ) {
        continue;
      }

      const p = this.anchorWorldPoint(anchor);
      const dx = p.x - this.carX;
      const dy = p.y - this.carY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const passedAnchorPenalty = deltaS >= 0 ? deltaS * 0.28 : Math.abs(deltaS) * (recoverDelta > 160 ? 0.16 : 0.42);
      const releasePenalty = Math.abs(anchor.releaseS - this.progress) * 0.08;
      const exitPenalty = recoverDelta > 0 ? 0 : Math.abs(recoverDelta) * 4;
      const currentBias = isReusableAnchor ? -120 : 0;
      const score = distance + passedAnchorPenalty + releasePenalty + exitPenalty + currentBias;
      if (distance < 720 && score < bestScore) {
        bestScore = score;
        best = anchor;
      }
    }

    return best;
  }
  canAttachSlingConstraintAt(
    anchor: AnchorPoint,
    pin: { x: number; y: number },
    carX: number,
    carY: number,
    progress: number,
  ): boolean {
    if (progress < anchor.constraintStartS) {
      return false;
    }

    // 原版 Car.Update 先显示绳子，再以道路朝向和 Pin 的夹角判断是否
    // 越过入弯切线；只有越线后才调用 Pin.AttachToJoint。这里直接用
    // 弯道入口切线做同一半平面测试，左右弯完全共用这一条规则。
    const entry = this.getTrackPoint(anchor.constraintStartS);
    const toPinX = pin.x - carX;
    const toPinY = pin.y - carY;
    return toPinX * entry.tx + toPinY * entry.ty <= 0;
  }
  carCollisionInsetWithHeading(trackPoint: TrackSample, displayHeading: number): number {
    const trackHeading = Math.atan2(trackPoint.tx, trackPoint.ty);
    const angle = Math.abs(this.shortAngle(displayHeading - trackHeading));
    const { halfWidth, halfLength } = this.carCollisionHalfSize();

    return Math.abs(Math.cos(angle)) * halfWidth * 0.82 + Math.abs(Math.sin(angle)) * halfLength * 0.18 + 2;
  }
  isCarTouchingRoadEdgeAt(
    carX: number,
    carY: number,
    progress: number,
    displayHeading: number,
    edgeGrace = this.activeRecovery ? 12 : 6,
  ): boolean {
    const trackPoint = this.findClosestTrackPointNearProgress(carX, carY, progress, 160, 260);
    const centerCrashLimit = this.roadHalfWidth - this.carCollisionInsetWithHeading(trackPoint, displayHeading);
    if (trackPoint.distance > centerCrashLimit) {
      return true;
    }

    for (const point of this.carCollisionSamplePointsAt(carX, carY, displayHeading)) {
      const pointClosest = this.findClosestTrackPointNearProgress(point.x, point.y, trackPoint.s, 220, 240);
      if (pointClosest.distance >= this.roadHalfWidth + edgeGrace) {
        return true;
      }
    }

    return false;
  }
  isCarPathTouchingRoadEdge(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    fromProgress: number,
    toProgress: number,
    displayHeading: number,
    edgeGrace?: number,
  ): boolean {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.min(8, Math.ceil(distance / 10)));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = fromX + dx * t;
      const y = fromY + dy * t;
      const progress = fromProgress + (toProgress - fromProgress) * t;
      if (this.isCarTouchingRoadEdgeAt(x, y, progress, displayHeading, edgeGrace)) {
        return true;
      }
    }

    return false;
  }
  carCollisionHalfSize(): { halfWidth: number; halfLength: number } {
    return {
      halfWidth: this.carWidth * this.getActiveCarScale() * this.carCollisionWidthRatio,
      halfLength: this.carHeight * this.getActiveCarScale() * this.carCollisionLengthRatio,
    };
  }
  carCollisionSamplePointsAt(carX: number, carY: number, displayHeading: number): { x: number; y: number }[] {
    const { halfWidth, halfLength } = this.carCollisionHalfSize();
    const forwardX = Math.sin(displayHeading);
    const forwardY = Math.cos(displayHeading);
    const rightX = Math.cos(displayHeading);
    const rightY = -Math.sin(displayHeading);
    const noseProbeLength = halfLength * 0.82;
    const sideProbeLength = halfLength * 0.42;

    return [
      {
        x: carX + forwardX * noseProbeLength,
        y: carY + forwardY * noseProbeLength,
      },
      {
        x: carX - forwardX * noseProbeLength,
        y: carY - forwardY * noseProbeLength,
      },
      {
        x: carX + rightX * halfWidth,
        y: carY + rightY * halfWidth,
      },
      {
        x: carX - rightX * halfWidth,
        y: carY - rightY * halfWidth,
      },
      {
        x: carX + forwardX * sideProbeLength + rightX * halfWidth,
        y: carY + forwardY * sideProbeLength + rightY * halfWidth,
      },
      {
        x: carX + forwardX * sideProbeLength - rightX * halfWidth,
        y: carY + forwardY * sideProbeLength - rightY * halfWidth,
      },
      {
        x: carX - forwardX * sideProbeLength + rightX * halfWidth,
        y: carY - forwardY * sideProbeLength + rightY * halfWidth,
      },
      {
        x: carX - forwardX * sideProbeLength - rightX * halfWidth,
        y: carY - forwardY * sideProbeLength - rightY * halfWidth,
      },
    ];
  }
  findClosestTrackPointNearProgress(
    x: number,
    y: number,
    progress: number,
    behind: number,
    ahead: number,
  ): ClosestTrackPoint {
    this.ensureTrack(progress + ahead + this.sampleStep * 2);
    let best: ClosestTrackPoint = {
      ...this.getTrackPoint(progress),
      distance: Number.MAX_VALUE,
    };
    const minS = progress - behind;
    const maxS = progress + ahead;

    for (let i = 1; i < this.track.length; i++) {
      const a = this.track[i - 1];
      const b = this.track[i];
      if (b.s < minS || a.s > maxS) {
        continue;
      }

      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const lengthSq = abx * abx + aby * aby || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / lengthSq));
      const px = a.x + abx * t;
      const py = a.y + aby * t;
      const dx = x - px;
      const dy = y - py;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance >= best.distance) {
        continue;
      }

      const length = Math.sqrt(lengthSq) || 1;
      const tx = abx / length;
      const ty = aby / length;
      best = {
        s: a.s + (b.s - a.s) * t,
        x: px,
        y: py,
        tx,
        ty,
        nx: -ty,
        ny: tx,
        distance,
      };
    }

    return best;
  }
  anchorWorldPoint(anchor: AnchorPoint): { x: number; y: number } {
    if (anchor.x !== undefined && anchor.y !== undefined) {
      return { x: anchor.x, y: anchor.y };
    }

    return this.pointWithOffset(anchor.s, anchor.offset);
  }
}
