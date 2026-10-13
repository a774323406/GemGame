import {ENDLESS_CHANGE_POINTS,EndlessSpeedStage} from './driftEndlessStages';
import { EndlessTrackGenerator } from "./EndlessTrackGenerator";

export type TrackSample = {
  s: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  layer?:number;
};

export type ClosestTrackPoint = TrackSample & {
  distance: number;
};

export type AnchorPoint = {
  s: number;
  /** 弯道序号在中心线上的显示/触发进度；组合弯道取两段连接处。 */
  indexS?: number;
  driftStartS: number;
  constraintStartS: number;
  releaseS: number;
  recoverS: number;
  offset: number;
  x?: number;
  y?: number;
};

type TurnPlan = {
  sign: -1 | 1;
  degrees: 90 | 180;
  radius: number;
  straight: number;
  bridgeSwitch?:boolean;
};

export type LevelRoadPiece = [number, number, number, number, number, number];

export type LevelRoadPieceSpan = {
  piece: LevelRoadPiece;
  startS: number;
  endS: number;
};

export type EndlessRoadVisual = {
  id: number;
  prefabName: "road_straight_600" | "road_left_90_r300" | "road_180_r300";
  startS: number;
  endS: number;
  x: number;
  y: number;
  heading: number;
  scaleX: -1 | 1;
  layer?:number;
};

type TurnAnchorDraft = {
  index: number;
  startS: number;
  constraintStartS: number;
  endS: number;
  cross: number;
  offset: number;
  x: number;
  y: number;
};

type PiecePort = {
  x: number;
  y: number;
  dir: string;
};

type ReviveRoadCheckpoint = {
  s: number;
  isStraight: boolean;
};

type TrackRuntimeOptions = {
  sampleStep: number;
  viewBehind: number;
  viewAhead: number;
  driftEnterLead: number;
  driftExitDelay: number;
  getRoadHalfWidth: () => number;
  /** Feed streaming: new tiles must be outside the padded viewport. */
  canCreateRoad?: (piece: EndlessRoadVisual) => boolean;
};

export class TrackRuntime {
  readonly speedStages:EndlessSpeedStage[]=[];
  private roadLayer=0;
  private nextTheme=0;
  readonly track: TrackSample[] = [];
  readonly anchors: AnchorPoint[] = [];
  private readonly fixedPieceSpans = new Map<LevelRoadPiece, LevelRoadPieceSpan>();
  private readonly reviveRoadCheckpoints: ReviveRoadCheckpoint[] = [];

  private pathX = 0;
  private pathY = 0;
  private pathHeading = 0;
  private pathS = 0;
  private planIndex = 0;
  private progress = 0;
  private fixedMap = false;
  private endlessMap = false;
  private finishS = Number.MAX_VALUE;
  private endlessSeed = 0;
  private generatedCurveCount = 0;
  private passedCurveCount = 0;
  private readonly curveCompletionPoints: number[] = [];
  private readonly endlessRoadVisuals: EndlessRoadVisual[] = [];
  private nextEndlessRoadVisualId = 1;
  private readonly endlessGenerator = new EndlessTrackGenerator();

  private readonly turnPlans: TurnPlan[] = [
    { sign: 1, degrees: 90, radius: 270, straight: 520 },
    { sign: -1, degrees: 180, radius: 250, straight: 600 },
    { sign: -1, degrees: 90, radius: 320, straight: 500 },
    { sign: 1, degrees: 180, radius: 260, straight: 620 },
    { sign: 1, degrees: 90, radius: 330, straight: 720 },
    { sign: -1, degrees: 90, radius: 285, straight: 520 },
  ];

  constructor(private readonly options: TrackRuntimeOptions) {}

  reset(initialStraight = 820): void {
    this.track.length = 0;
    this.anchors.length = 0;
    this.fixedPieceSpans.clear();
    this.reviveRoadCheckpoints.length = 0;
    this.pathX = 0;
    this.pathY = 0;
    this.pathHeading = 0;
    this.pathS = 0;
    this.planIndex = 0;
    this.progress = 0;
    this.fixedMap = false;
    this.endlessMap = false;
    this.finishS = Number.MAX_VALUE;
    this.resetCurveProgress();

    this.addSample();
    this.reviveRoadCheckpoints.push({ s: this.pathS, isStraight: true });
    this.addStraight(initialStraight);
    this.ensureTrack(this.options.viewAhead + 1600, 0);
  }

  resetEndless(seed = Date.now(), initialStraight = 1200): void {
    this.track.length = 0;
    this.anchors.length = 0;
    this.fixedPieceSpans.clear();
    this.reviveRoadCheckpoints.length = 0;
    this.pathX = 0;
    this.pathY = 0;
    this.pathHeading = 0;
    this.pathS = 0;
    this.planIndex = 0;
    this.progress = 0;
    this.fixedMap = false;
    this.endlessMap = true;
    this.finishS = Number.MAX_VALUE;
    this.resetCurveProgress();
    this.endlessSeed = Math.floor(Number(seed) || Date.now()) >>> 0;
    this.endlessGenerator.reset(this.endlessSeed);

    this.addSample();
    this.reviveRoadCheckpoints.push({ s: this.pathS, isStraight: true });
    this.addStraight(initialStraight);
    this.ensureTrack(this.options.viewAhead + 1600, 0);
  }

  resetFromPieces(pieces: LevelRoadPiece[]): boolean {
    this.track.length = 0;
    this.anchors.length = 0;
    this.fixedPieceSpans.clear();
    this.reviveRoadCheckpoints.length = 0;
    this.pathX = 0;
    this.pathY = 0;
    this.pathHeading = 0;
    this.pathS = 0;
    this.planIndex = 0;
    this.progress = 0;
    this.fixedMap = true;
    this.endlessMap = false;
    this.finishS = Number.MAX_VALUE;
    this.resetCurveProgress();

    const roadPieces = pieces.filter((piece) => this.isDriveRoadType(piece[0]));
    const bridgePieces = pieces.filter((piece) => this.isBridgeRoadType(piece[0]));
    const startPiece = pieces.find((piece) => piece[0] === 100);
    const finishPiece = pieces.find((piece) => piece[0] === 101);
    if (roadPieces.length === 0) {
      this.reset();
      return false;
    }

    // 终点后还需要保留一段冲线道路，因此路径不能在 101 标记处截断。
    const ordered = this.traceLevelRoadPath(roadPieces, bridgePieces, startPiece);
    if (ordered.length < 2) {
      this.reset();
      return false;
    }

    const start = this.gridToWorld(ordered[0][1], ordered[0][2]);
    const next = this.gridToWorld(ordered[1][1], ordered[1][2]);
    const startHeading = Math.atan2(next.x - start.x, next.y - start.y);
    this.pathX = start.x;
    this.pathY = start.y;
    this.pathHeading = startHeading;
    this.addSample();
    this.reviveRoadCheckpoints.push({
      s: this.pathS,
      isStraight: this.isReviveStraightRoadType(ordered[0][0]),
    });

    const turnAnchorDrafts: TurnAnchorDraft[] = [];
    for (let i = 1; i < ordered.length; i++) {
      const current = ordered[i];
      const segmentStartS = this.pathS;
      let constraintStartS = segmentStartS;
      if (this.isTurnRoadType(current[0]) && i < ordered.length - 1) {
        const entryPort = this.findConnectingPort(current, ordered[i - 1]);
        const exitPort = this.findConnectingPort(current, ordered[i + 1]);
        if (entryPort && exitPort) {
          constraintStartS = this.addFixedTurnTo(current, entryPort, exitPort);
        } else {
          const currentCenter = this.gridToWorld(current[1], current[2]);
          this.addLineTo(currentCenter.x, currentCenter.y);
        }
      } else {
        const prev = this.gridToWorld(ordered[i - 1][1], ordered[i - 1][2]);
        const currentCenter = this.gridToWorld(current[1], current[2]);
        this.pathHeading = Math.atan2(currentCenter.x - prev.x, currentCenter.y - prev.y);
        this.addLineTo(currentCenter.x, currentCenter.y);
      }
      const segmentEndS = this.pathS;
      this.recordFixedPieceSpan(current, segmentStartS, segmentEndS);
      this.reviveRoadCheckpoints.push({
        s: segmentEndS,
        isStraight: this.isReviveStraightRoadType(current[0]),
      });

      if (i < ordered.length - 1) {
        const draft = this.createTurnAnchorDraft(
          ordered,
          i,
          segmentStartS,
          constraintStartS,
          segmentEndS,
        );
        if (draft) {
          turnAnchorDrafts.push(draft);
        }
      }
    }
    this.addMergedTurnAnchors(turnAnchorDrafts);

    const finishKey = finishPiece ? this.gridKey(finishPiece[1], finishPiece[2]) : "";
    const reachedFinish =
      !!finishPiece &&
      ordered.some((piece) =>
        this.getPieceCells(piece).some((cell) => this.gridKey(cell.x, cell.y) === finishKey),
      );
    if (reachedFinish) {
      const finish = this.gridToWorld(finishPiece[1], finishPiece[2]);
      this.finishS = this.findClosestBuiltTrackPoint(finish.x, finish.y).s;
    } else {
      this.finishS = this.pathS;
    }

    return true;
  }

  isFixedMap(): boolean {
    return this.fixedMap;
  }

  isEndlessMap(): boolean {
    return this.endlessMap;
  }

  getEndlessSeed(): number {
    return this.endlessSeed;
  }

  getPassedCurveCount(): number {
    return this.passedCurveCount;
  }

  getEndlessRoadVisuals(): readonly EndlessRoadVisual[] {
    return this.endlessRoadVisuals;
  }

  getFinishS(): number {
    return this.finishS;
  }

  getPieceDriveSpan(piece: LevelRoadPiece): LevelRoadPieceSpan | null {
    return this.fixedPieceSpans.get(piece) || null;
  }

  /**
   * 固定关卡的覆盖标记（加速箭头等）只有格子坐标，不属于可行驶道路本身。
   * 对外提供一次不受 progress 搜索窗口限制的最近点查询，让覆盖标记能够
   * 精确换算成路径距离，并沿实际行驶方向旋转。
   */
  getClosestBuiltTrackPoint(x: number, y: number): ClosestTrackPoint {
    return this.findClosestBuiltTrackPoint(x, y);
  }

  /**
   * 原版 RacingManager.GetNextStraightRoad 会从车辆的 currentRoad 开始，
   * 向前寻找第一段 Straight；Car.ReviveCar 随后直接使用该道路 Transform。
   * 这里的 checkpoint 就是当前轨迹中各道路 Transform 对应的中心线位置。
   */
  getReviveTrackPoint(progress: number): TrackSample {
    if (this.reviveRoadCheckpoints.length === 0) {
      return this.getTrackPoint(Math.max(0, progress));
    }

    let currentIndex = 0;
    for (let i = 1; i < this.reviveRoadCheckpoints.length; i++) {
      if (this.reviveRoadCheckpoints[i].s > progress + 0.001) {
        break;
      }
      currentIndex = i;
    }

    let reviveIndex = currentIndex;
    while (
      reviveIndex < this.reviveRoadCheckpoints.length &&
      !this.reviveRoadCheckpoints[reviveIndex].isStraight
    ) {
      reviveIndex++;
    }
    if (reviveIndex >= this.reviveRoadCheckpoints.length) {
      reviveIndex = currentIndex;
    }

    return this.getTrackPoint(this.reviveRoadCheckpoints[reviveIndex].s);
  }

  setProgress(progress: number): void {
    this.progress = progress;
    this.updatePassedCurveCount(progress);
  }

  ensureTrack(targetS: number, progress = this.progress): void {
    this.progress = progress;
    this.updatePassedCurveCount(progress);
    if (this.fixedMap) {
      return;
    }

    while (this.pathS < targetS) {
      let plan = this.endlessMap
        ? this.pickSafeEndlessPlan()
        : this.turnPlans[this.planIndex % this.turnPlans.length];
      if (!plan) {
        // 当前方向的候选弯都会撞上仍在视野内的旧道路时，先延长直道脱离拥挤区域。
        if (!this.canCreateStraight(this.pathX,this.pathY,this.pathHeading,this.pathS,1200)) break;
        this.reviveRoadCheckpoints.push({ s: this.pathS, isStraight: true });
        this.addStraight(1200);
        continue;
      }
      this.reviveRoadCheckpoints.push({ s: this.pathS, isStraight: false });
      this.addTurn(plan);
      if (this.endlessMap) {
        this.generatedCurveCount += 1;
        this.curveCompletionPoints.push(this.pathS);
      }
      this.reviveRoadCheckpoints.push({ s: this.pathS, isStraight: true });
      if(this.endlessMap && this.nextTheme<ENDLESS_CHANGE_POINTS.length && this.generatedCurveCount>ENDLESS_CHANGE_POINTS[this.nextTheme]){
        // Original: one lead-in + 10 transition roads; begin=1, mid=7, end=10.
        const begin=this.pathS+600;
        if(this.canCreateStraight(this.pathX,this.pathY,this.pathHeading,this.pathS,6600)&&this.isStraightGeometrySafe(6600)){
          this.addStraight(6600);this.speedStages.push({startS:begin,midS:begin+3600,endS:begin+5400,theme:++this.nextTheme});
        }
      }
      this.addStraight(plan.straight);
      this.planIndex++;
    }

    // 无尽模式的赛道图会在屏幕外再回收，中心线也要保留同样的距离，
    // 否则防自交检查可能忽略仍未回收的旧赛道图。
    const retainBehind = this.endlessMap ? 4800 : this.options.viewBehind + 500;
    const minS = progress - retainBehind;
    let removeCount=0;
    while(removeCount<this.track.length-2 && this.track[removeCount+1].s<minS)removeCount++;
    if(removeCount)this.track.splice(0,removeCount);

    for (let i = this.anchors.length - 1; i >= 0; i--) {
      if (this.anchors[i].releaseS <= minS) {
        this.anchors.splice(i, 1);
      }
    }

    while (this.reviveRoadCheckpoints.length > 2 && this.reviveRoadCheckpoints[1].s < minS) {
      this.reviveRoadCheckpoints.shift();
    }

    while (this.endlessRoadVisuals.length > 0 && this.endlessRoadVisuals[0].endS < minS) {
      this.endlessRoadVisuals.shift();
    }
  }

  private resetCurveProgress(): void {
    this.roadLayer=0;this.nextTheme=0;this.speedStages.length=0;
    this.endlessSeed = 0;
    this.generatedCurveCount = 0;
    this.passedCurveCount = 0;
    this.curveCompletionPoints.length = 0;
    this.endlessRoadVisuals.length = 0;
    this.nextEndlessRoadVisualId = 1;
  }

  private updatePassedCurveCount(progress: number): void {
    if (!this.endlessMap) {
      return;
    }

    while (this.curveCompletionPoints.length > 0 && progress >= this.curveCompletionPoints[0]) {
      this.curveCompletionPoints.shift();
      this.passedCurveCount += 1;
    }
  }

  private pickSafeEndlessPlan(): TurnPlan | null {
    for (let attempt = 0; attempt < 12; attempt++) {
      const plan = this.endlessGenerator.next(this.generatedCurveCount);
      if (this.isEndlessPlanSafe(plan)) {
        return plan;
      }
    }
    // An upper/lower road crossing is preferable to a blocked unfinished tail.
    // Reuse original BackTurn layer switching when the flat route has no continuation.
    for(const sign of [-1,1] as const)for(const degrees of [180,90] as const){
      const plan={sign,degrees,radius:300,straight:1200,bridgeSwitch:true};
      if(this.isEndlessPlanSafe(plan))return plan;
    }
    return null;
  }

  /** 防止随机路径和当前保留道路自交；原版对应由高低层切换和道路候选约束共同完成。 */
  private isStraightGeometrySafe(length:number):boolean{
    const distance=this.options.getRoadHalfWidth()*2+36;
    for(let d=60;d<=length;d+=60){const x=this.pathX+Math.sin(this.pathHeading)*d,y=this.pathY+Math.cos(this.pathHeading)*d;
      for(let i=0;i<this.track.length;i+=3){const p=this.track[i];if(p.s>=this.pathS-420||(p.layer||0)!==this.roadLayer)continue;if((x-p.x)**2+(y-p.y)**2<distance*distance)return false;}
    }
    return true;
  }

  private canCreateStraight(x:number,y:number,heading:number,s:number,length:number):boolean {
    if(!this.options.canCreateRoad)return true;
    for(let d=0;d<length;d+=600)if(!this.options.canCreateRoad({id:0,prefabName:'road_straight_600',startS:s+d,endS:s+d+600,x:x+Math.sin(heading)*(d+300),y:y+Math.cos(heading)*(d+300),heading,scaleX:1}))return false;
    return true;
  }

  private isEndlessPlanSafe(plan: TurnPlan): boolean {
    if(this.options.canCreateRoad){
      const h=this.pathHeading,endH=h+plan.sign*plan.degrees*Math.PI/180;
      const turn={id:0,prefabName:plan.degrees===180?'road_180_r300' as const:'road_left_90_r300' as const,startS:this.pathS,endS:this.pathS+plan.degrees*Math.PI*plan.radius/180,x:this.pathX+Math.sin(h)*plan.radius,y:this.pathY+Math.cos(h)*plan.radius,heading:h,scaleX:(plan.degrees===180?(plan.sign===1?1:-1):(plan.sign===-1?1:-1)) as 1|-1};
      if(!this.options.canCreateRoad(turn)||!this.canCreateStraight(this.pathX+plan.sign*plan.radius*(Math.cos(h)-Math.cos(endH)),this.pathY+plan.sign*plan.radius*(Math.sin(endH)-Math.sin(h)),endH,turn.endS,plan.straight+1800))return false;
    }

    const candidatePoints: { x: number; y: number }[] = [];
    const turnStartX = this.pathX;
    const turnStartY = this.pathY;
    let x = turnStartX;
    let y = turnStartY;
    let heading = this.pathHeading;
    const startHeading = heading;
    const turnLength = (plan.degrees * Math.PI * plan.radius) / 180;
    const checkStep = 60;
    let travelled = 0;
    while (travelled < turnLength) {
      const step = Math.min(checkStep, turnLength - travelled);
      travelled += step;
      heading = startHeading + (plan.sign * travelled) / plan.radius;
      // 使用精确圆弧位移，保证检测轨迹与 R300 赛道图完全一致。
      x = turnStartX + plan.sign * plan.radius * (Math.cos(startHeading) - Math.cos(heading));
      y = turnStartY + plan.sign * plan.radius * (Math.sin(heading) - Math.sin(startHeading));
      candidatePoints.push({ x, y });
    }

    heading = Math.round(heading / (Math.PI / 2)) * (Math.PI / 2);
    travelled = 0;
    while (travelled < plan.straight) {
      const step = Math.min(checkStep, plan.straight - travelled);
      travelled += step;
      x += Math.sin(heading) * step;
      y += Math.cos(heading) * step;
      candidatePoints.push({ x, y });
    }

    const ignoreTailBeforeS = this.pathS - 420;
    const minimumDistance = this.options.getRoadHalfWidth() * 2 + 36;
    const minimumDistanceSq = minimumDistance * minimumDistance;
    for (const candidate of candidatePoints) {
      for (let index = 0; index < this.track.length; index += 3) {
        const existing = this.track[index];
        const candidateLayer=plan.bridgeSwitch?1-this.roadLayer:this.roadLayer;
        if((existing.layer||0)!==candidateLayer)continue;
        if (existing.s >= ignoreTailBeforeS) {
          continue;
        }
        const dx = candidate.x - existing.x;
        const dy = candidate.y - existing.y;
        if (dx * dx + dy * dy < minimumDistanceSq) {
          return false;
        }
      }
    }
    return true;
  }

  getTrackPoint(s: number): TrackSample {
    this.ensureTrack(s + 100);

    if (s <= this.track[0].s) {
      return this.track[0];
    }

    let lo=1,hi=this.track.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(this.track[mid].s<s)lo=mid+1;else hi=mid;}
    if(lo<this.track.length){
      const a = this.track[lo - 1];
      const b = this.track[lo];

      const t = (s - a.s) / Math.max(1, b.s - a.s);
      const tx = a.tx + (b.tx - a.tx) * t;
      const ty = a.ty + (b.ty - a.ty) * t;
      const len = Math.sqrt(tx * tx + ty * ty) || 1;
      const ntx = tx / len;
      const nty = ty / len;
      return {
        s,layer:b.layer||0,
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        tx: ntx,
        ty: nty,
        nx: -nty,
        ny: ntx,
      };
    }

    return this.track[this.track.length - 1];
  }

  findClosestTrackPoint(x: number, y: number, progress = this.progress): ClosestTrackPoint {
    let best: ClosestTrackPoint = {
      ...this.track[0],
      distance: Number.MAX_VALUE,
    };

    for (let i = 1; i < this.track.length; i++) {
      const a = this.track[i - 1];
      const b = this.track[i];
      if (b.s < progress - 520 || a.s > progress + 820) {
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

      const tx = abx / Math.sqrt(lengthSq);
      const ty = aby / Math.sqrt(lengthSq);
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

  pointWithOffset(s: number, offset: number): { x: number; y: number } {
    const p = this.getTrackPoint(s);
    return {
      x: p.x + p.nx * offset,
      y: p.y + p.ny * offset,
    };
  }

  visibleTrack(progress: number): TrackSample[] {
    const start = progress - this.options.viewBehind;
    const end = progress + this.options.viewAhead;
    const points: TrackSample[] = [];
    for (let s = start; s <= end; s += this.options.sampleStep) {
      points.push(this.getTrackPoint(s));
    }
    return points;
  }

  private addStraight(length: number): void {
    let remaining = length;
    while (remaining > 0) {
      const visualLength = this.endlessMap ? Math.min(600, remaining) : remaining;
      const startX = this.pathX;
      const startY = this.pathY;
      const startS = this.pathS;
      const heading = this.pathHeading;
      let segmentRemaining = visualLength;
      while (segmentRemaining > 0) {
        const step = Math.min(this.options.sampleStep, segmentRemaining);
        this.pathX += Math.sin(this.pathHeading) * step;
        this.pathY += Math.cos(this.pathHeading) * step;
        this.pathS += step;
        segmentRemaining -= step;
        remaining -= step;
        this.addSample();
      }

      if (this.endlessMap) {
        this.endlessRoadVisuals.push({
          id: this.nextEndlessRoadVisualId++,
          prefabName: "road_straight_600",
          startS,
          endS: this.pathS,
          x: startX + Math.sin(heading) * (visualLength * 0.5),
          y: startY + Math.cos(heading) * (visualLength * 0.5),
          heading,
          scaleX: 1,layer:this.roadLayer,
        });
      }
    }
  }

  private addTurn(plan: TurnPlan): void {
    if(plan.bridgeSwitch)this.roadLayer=1-this.roadLayer;
    const startHeading = this.pathHeading;
    const startX = this.pathX;
    const startY = this.pathY;
    const turnLength = (plan.degrees * Math.PI * plan.radius) / 180;
    const turnStartS = this.pathS;
    const anchorS = turnStartS + turnLength * 0.48;
    const releaseLead = Math.min(120, turnLength * 0.22);
    const recoverDelay = this.turnRecoverDelay(turnLength);
    const insideOffset = -plan.sign * (this.options.getRoadHalfWidth() + 58);
    this.anchors.push({
      s: anchorS,
      indexS: turnStartS + turnLength * 0.5,
      driftStartS: turnStartS - this.options.driftEnterLead,
      constraintStartS: turnStartS,
      releaseS: turnStartS + turnLength - releaseLead,
      recoverS: turnStartS + turnLength + recoverDelay,
      offset: insideOffset,
    });

    let travelled = 0;
    while (travelled < turnLength) {
      const step = Math.min(this.options.sampleStep, turnLength - travelled);
      travelled += step;
      this.pathHeading = startHeading + (plan.sign * travelled) / plan.radius;
      // 直接按圆的参数方程取点，避免逐步积分造成弯道出口偏移。
      this.pathX =
        startX + plan.sign * plan.radius * (Math.cos(startHeading) - Math.cos(this.pathHeading));
      this.pathY =
        startY + plan.sign * plan.radius * (Math.sin(this.pathHeading) - Math.sin(startHeading));
      this.pathS = turnStartS + travelled;
      this.addSample();
    }

    this.pathHeading = Math.round(this.pathHeading / (Math.PI / 2)) * (Math.PI / 2);

    if (this.endlessMap) {
      const prefabName = plan.degrees === 180 ? "road_180_r300" : "road_left_90_r300";
      // 90°图的原始方向是左弯，180°图的原始方向是右弯；反向时水平镜像复用同一资源。
      const scaleX: -1 | 1 =
        plan.degrees === 180 ? (plan.sign === 1 ? 1 : -1) : plan.sign === -1 ? 1 : -1;
      this.endlessRoadVisuals.push({
        id: this.nextEndlessRoadVisualId++,
        prefabName,
        startS: turnStartS,
        endS: this.pathS,
        x: startX + Math.sin(startHeading) * plan.radius,
        y: startY + Math.cos(startHeading) * plan.radius,
        heading: startHeading,
        scaleX,layer:this.roadLayer,
      });
    }
  }

  private addSample(): void {
    const tx = Math.sin(this.pathHeading);
    const ty = Math.cos(this.pathHeading);
    this.track.push({
      layer:this.roadLayer,
      s: this.pathS,
      x: this.pathX,
      y: this.pathY,
      tx,
      ty,
      nx: -ty,
      ny: tx,
    });
  }

  private addLineTo(x: number, y: number): void {
    const dx = x - this.pathX;
    const dy = y - this.pathY;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length <= 0.01) {
      return;
    }

    const heading = Math.atan2(dx, dy);
    let travelled = 0;
    const startX = this.pathX;
    const startY = this.pathY;
    const startS = this.pathS;
    while (travelled < length) {
      const step = Math.min(this.options.sampleStep, length - travelled);
      travelled += step;
      const ratio = travelled / length;
      this.pathX = startX + dx * ratio;
      this.pathY = startY + dy * ratio;
      this.pathHeading = heading;
      this.pathS = startS + travelled;
      this.addSample();
    }
  }

  private addFixedTurnTo(piece: LevelRoadPiece, entryPort: PiecePort, exitPort: PiecePort): number {
    const entry = this.tileBoundaryWorldAt(entryPort.x, entryPort.y, entryPort.dir);
    const exit = this.tileBoundaryWorldAt(exitPort.x, exitPort.y, exitPort.dir);
    const entryHeading = this.dirToHeading(this.oppositeDir(entryPort.dir));
    this.addLineTo(entry.x, entry.y);
    const turnStartS = this.pathS;
    this.addArcTo(this.turnCenterWorldPoint(piece, entryPort, exitPort), entry, exit, entryHeading);
    return turnStartS;
  }

  private addArcTo(
    center: { x: number; y: number },
    start: { x: number; y: number },
    end: { x: number; y: number },
    preferredStartHeading?: number,
  ): void {
    const radius = Math.sqrt((start.x - center.x) ** 2 + (start.y - center.y) ** 2);
    if (radius <= 0.01) {
      this.addLineTo(end.x, end.y);
      return;
    }

    const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
    const delta = this.arcDelta(startAngle, endAngle, preferredStartHeading);
    const length = Math.abs(delta) * radius;
    if (length <= 0.01) {
      return;
    }

    let travelled = 0;
    const startS = this.pathS;
    while (travelled < length) {
      const step = Math.min(this.options.sampleStep, length - travelled);
      travelled += step;
      const ratio = travelled / length;
      const angle = startAngle + delta * ratio;
      this.pathX = center.x + Math.cos(angle) * radius;
      this.pathY = center.y + Math.sin(angle) * radius;
      this.pathHeading = this.arcHeadingAt(angle, delta > 0 ? 1 : -1);
      this.pathS = startS + travelled;
      this.addSample();
    }
  }

  private arcDelta(startAngle: number, endAngle: number, preferredStartHeading?: number): number {
    let delta = this.shortAngle(endAngle - startAngle);
    if (Math.abs(Math.abs(delta) - Math.PI) > 0.001 || preferredStartHeading === undefined) {
      return delta;
    }

    const positiveDiff = Math.abs(this.shortAngle(this.arcHeadingAt(startAngle, 1) - preferredStartHeading));
    const negativeDiff = Math.abs(this.shortAngle(this.arcHeadingAt(startAngle, -1) - preferredStartHeading));
    delta = positiveDiff <= negativeDiff ? Math.PI : -Math.PI;
    return delta;
  }

  private arcHeadingAt(angle: number, direction: -1 | 1): number {
    return Math.atan2(-Math.sin(angle) * direction, Math.cos(angle) * direction);
  }

  private findClosestBuiltTrackPoint(x: number, y: number): ClosestTrackPoint {
    let best: ClosestTrackPoint = {
      ...this.track[0],
      distance: Number.MAX_VALUE,
    };

    for (let i = 1; i < this.track.length; i++) {
      const a = this.track[i - 1];
      const b = this.track[i];
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

      const tx = abx / Math.sqrt(lengthSq);
      const ty = aby / Math.sqrt(lengthSq);
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

  private createTurnAnchorDraft(
    ordered: LevelRoadPiece[],
    index: number,
    turnStartS: number,
    constraintStartS: number,
    turnEndS: number,
  ): TurnAnchorDraft | null {
    const currentPiece = ordered[index];
    if (!this.isTurnRoadType(currentPiece[0])) {
      return null;
    }

    const entryPort = this.findConnectingPort(currentPiece, ordered[index - 1]);
    const exitPort = this.findConnectingPort(currentPiece, ordered[index + 1]);
    if (!entryPort || !exitPort) {
      return null;
    }

    const turnSign = this.fixedTurnSign(currentPiece, entryPort, exitPort);
    if (turnSign === 0) {
      return null;
    }
    const anchor = this.turnCenterWorldPoint(currentPiece, entryPort, exitPort);

    return {
      index,
      startS: turnStartS,
      constraintStartS,
      endS: turnEndS,
      cross: turnSign,
      offset: turnSign > 0 ? this.options.getRoadHalfWidth() + 58 : -this.options.getRoadHalfWidth() - 58,
      x: anchor.x,
      y: anchor.y,
    };
  }

  private addMergedTurnAnchors(drafts: TurnAnchorDraft[]): void {
    for (let i = 0; i < drafts.length; i++) {
      const first = drafts[i];
      let last = first;
      let centerX = first.x;
      let centerY = first.y;
      let centerCount = 1;
      while (
        i + 1 < drafts.length &&
        drafts[i + 1].index === last.index + 1 &&
        Math.sign(drafts[i + 1].cross) === Math.sign(first.cross)
      ) {
        i++;
        last = drafts[i];
        centerX += last.x;
        centerY += last.y;
        centerCount++;
      }

      this.addTurnAnchor(
        first.startS,
        first.constraintStartS,
        last.endS,
        first.offset,
        centerCount > 1
          ? first.endS
          : first.constraintStartS + (first.endS - first.constraintStartS) * 0.5,
        centerX / centerCount,
        centerY / centerCount,
      );
    }
  }

  private addTurnAnchor(
    turnStartS: number,
    constraintStartS: number,
    turnEndS: number,
    offset: number,
    indexS: number,
    x?: number,
    y?: number,
  ): void {
    const turnLength = Math.max(1, turnEndS - turnStartS);
    const anchorS = turnStartS + turnLength * 0.48;
    const releaseLead = Math.min(120, turnLength * 0.22);
    const recoverDelay = this.turnRecoverDelay(turnLength);
    const anchor: AnchorPoint = {
      s: anchorS,
      indexS,
      driftStartS: turnStartS - this.options.driftEnterLead,
      constraintStartS,
      releaseS: turnEndS - releaseLead,
      recoverS: turnEndS + recoverDelay,
      offset,
    };
    if (x !== undefined && y !== undefined) {
      anchor.x = x;
      anchor.y = y;
    }

    this.anchors.push(anchor);
  }

  private turnRecoverDelay(turnLength: number): number {
    return this.options.driftExitDelay + Math.min(70, Math.max(0, turnLength - 520) * 0.1);
  }

  private recordFixedPieceSpan(piece: LevelRoadPiece, startS: number, endS: number): void {
    let spanStart = Math.min(startS, endS);
    let spanEnd = Math.max(startS, endS);
    if (piece[0] === 7) {
      const centerS = endS;
      spanStart = centerS - 300;
      spanEnd = centerS + 300;
    }

    this.fixedPieceSpans.set(piece, {
      piece,
      startS: Math.max(0, spanStart),
      endS: Math.max(0, spanEnd),
    });
  }

  private isReviveStraightRoadType(type: number): boolean {
    return type === 1 || type === 7;
  }

  private traceLevelRoadPath(
    roadPieces: LevelRoadPiece[],
    bridgePieces: LevelRoadPiece[],
    startPiece?: LevelRoadPiece,
  ): LevelRoadPiece[] {
    const roadMap = new Map<string, LevelRoadPiece[]>();
    for (const piece of roadPieces) {
      for (const cell of this.getPieceCells(piece)) {
        const key = this.gridKey(cell.x, cell.y);
        const pieces = roadMap.get(key);
        if (pieces) {
          pieces.push(piece);
        } else {
          roadMap.set(key, [piece]);
        }
      }
    }
    const bridgeMap = new Map<string, LevelRoadPiece[]>();
    for (const piece of bridgePieces) {
      for (const cell of this.getPieceCells(piece)) {
        const key = this.gridKey(cell.x, cell.y);
        const pieces = bridgeMap.get(key);
        if (pieces) {
          pieces.push(piece);
        } else {
          bridgeMap.set(key, [piece]);
        }
      }
    }

    const startCandidates = startPiece ? roadMap.get(this.gridKey(startPiece[1], startPiece[2])) || [] : roadPieces;
    const startDir = this.rotToDir(startPiece ? startPiece[4] : roadPieces[0][4]);
    const startRoad =
      startCandidates.find((piece) =>
        this.hasPortAt(piece, startPiece ? startPiece[1] : piece[1], startPiece ? startPiece[2] : piece[2], startDir),
      ) || startCandidates[0];
    if (!startRoad) {
      return [];
    }

    const ordered: LevelRoadPiece[] = [startRoad];
    const visited = new Set<string>([this.pieceKey(startRoad)]);
    let current = startRoad;
    let incomingPort: PiecePort | null = {
      x: startPiece ? startPiece[1] : current[1],
      y: startPiece ? startPiece[2] : current[2],
      dir: this.oppositeDir(this.rotToDir(startPiece ? startPiece[4] : current[4])),
    };

    for (let safe = 0; safe < roadPieces.length + 4; safe++) {
      const ports = this.getPiecePorts(current);
      const candidates = ports.filter((port) => !incomingPort || !this.samePort(port, incomingPort));
      let nextPort: PiecePort | null = null;
      let nextPiece: LevelRoadPiece | null = null;
      let nextIncomingPort: PiecePort | null = null;
      for (const port of candidates) {
        const link = this.findNextRoadThroughPort(current, port, roadMap, bridgeMap, visited);
        if (link) {
          nextPort = port;
          nextPiece = link.piece;
          nextIncomingPort = link.incomingPort;
          break;
        }
      }

      if (!nextPort || !nextPiece) {
        for (const port of ports) {
          const link = this.findNextRoadThroughPort(current, port, roadMap, bridgeMap);
          if (link) {
            nextPort = port;
            nextPiece = link.piece;
            nextIncomingPort = link.incomingPort;
            break;
          }
        }
      }
      if (!nextPort || !nextPiece || !nextIncomingPort) {
        break;
      }

      const nextKey = this.pieceKey(nextPiece);
      if (visited.has(nextKey)) {
        break;
      }

      ordered.push(nextPiece);
      visited.add(nextKey);
      incomingPort = nextIncomingPort;
      current = nextPiece;
    }

    return ordered;
  }

  private findNextRoadThroughPort(
    current: LevelRoadPiece,
    port: PiecePort,
    roadMap: Map<string, LevelRoadPiece[]>,
    bridgeMap: Map<string, LevelRoadPiece[]>,
    visited?: Set<string>,
  ): { piece: LevelRoadPiece; incomingPort: PiecePort } | null {
    const next = this.neighborOfCell(port.x, port.y, port.dir);
    const direct = this.findRoadAtPort(current, next.x, next.y, this.oppositeDir(port.dir), roadMap, visited);
    if (direct) {
      return {
        piece: direct,
        incomingPort: { x: next.x, y: next.y, dir: this.oppositeDir(port.dir) },
      };
    }

    const bridges = bridgeMap.get(this.gridKey(next.x, next.y)) || [];
    const bridge = bridges.find(
      (piece) =>
        this.hasPortAt(piece, next.x, next.y, this.oppositeDir(port.dir)) &&
        this.hasPortAt(piece, next.x, next.y, port.dir),
    );
    if (!bridge) {
      return null;
    }

    const afterBridge = this.neighborOfCell(next.x, next.y, port.dir);
    const skipped = this.findRoadAtPort(current, afterBridge.x, afterBridge.y, this.oppositeDir(port.dir), roadMap, visited);
    if (!skipped) {
      return null;
    }

    return {
      piece: skipped,
      incomingPort: { x: afterBridge.x, y: afterBridge.y, dir: this.oppositeDir(port.dir) },
    };
  }

  private findRoadAtPort(
    current: LevelRoadPiece,
    x: number,
    y: number,
    dir: string,
    roadMap: Map<string, LevelRoadPiece[]>,
    visited?: Set<string>,
  ): LevelRoadPiece | null {
    const pieces = roadMap.get(this.gridKey(x, y)) || [];
    return (
      pieces.find(
        (candidatePiece) =>
          candidatePiece !== current &&
          (!visited || !visited.has(this.pieceKey(candidatePiece))) &&
          this.hasPortAt(candidatePiece, x, y, dir),
      ) || null
    );
  }

  private getPieceDirs(piece: LevelRoadPiece): string[] {
    return this.getPiecePorts(piece).map((port) => port.dir);
  }

  private getPiecePorts(piece: LevelRoadPiece): PiecePort[] {
    const [type, gx, gy, , rot] = piece;
    const normalized = ((Math.round(rot / 90) * 90) % 360 + 360) % 360;
    if (type === 1 || type === 7) {
      const dirs = normalized % 180 === 0 ? ["N", "S"] : ["E", "W"];
      return dirs.map((dir) => ({ x: gx, y: gy, dir }));
    }

    if (this.isTurn180RoadType(type)) {
      return [
        { offsetX: 0, offsetY: 0, dir: "S" },
        { offsetX: 1, offsetY: 0, dir: "S" },
      ].map((port) => {
        const offset = this.rotateCellOffset(port.offsetX, port.offsetY, normalized);
        return {
          x: gx + offset.x,
          y: gy + offset.y,
          dir: this.rotateDir(port.dir, normalized / 90),
        };
      });
    }

    const base = this.isTurn180RoadType(type) ? ["S", "N"] : ["S", "W"];
    const rotate = normalized / 90;
    return base.map((dir) => ({ x: gx, y: gy, dir: this.rotateDir(dir, rotate) }));
  }

  private getPieceCells(piece: LevelRoadPiece): { x: number; y: number }[] {
    if (!this.isTurn180RoadType(piece[0])) {
      return [{ x: piece[1], y: piece[2] }];
    }

    return this.getPiecePorts(piece).map((port) => ({ x: port.x, y: port.y }));
  }

  private hasPortAt(piece: LevelRoadPiece, x: number, y: number, dir: string): boolean {
    return this.getPiecePorts(piece).some((port) => port.x === x && port.y === y && port.dir === dir);
  }

  private samePort(a: PiecePort, b: PiecePort): boolean {
    return a.x === b.x && a.y === b.y && a.dir === b.dir;
  }

  private pieceKey(piece: LevelRoadPiece): string {
    return `${piece[0]}_${piece[1]}_${piece[2]}_${piece[4]}`;
  }

  private rotateCellOffset(x: number, y: number, rot: number): { x: number; y: number } {
    const steps = ((Math.round(rot / 90) % 4) + 4) % 4;
    let rx = x;
    let ry = y;
    for (let i = 0; i < steps; i++) {
      const nextX = -ry;
      const nextY = rx;
      rx = nextX;
      ry = nextY;
    }
    return { x: rx, y: ry };
  }

  private rotateDir(dir: string, times: number): string {
    const dirs = ["N", "E", "S", "W"];
    const index = dirs.indexOf(dir);
    return dirs[(index + times + 4) % 4];
  }

  private oppositeDir(dir: string): string {
    if (dir === "N") {
      return "S";
    }
    if (dir === "S") {
      return "N";
    }
    if (dir === "E") {
      return "W";
    }
    return "E";
  }

  private neighborOf(piece: LevelRoadPiece, dir: string): { x: number; y: number } {
    return this.neighborOfCell(piece[1], piece[2], dir);
  }

  private neighborOfCell(x: number, y: number, dir: string): { x: number; y: number } {
    if (dir === "N") {
      return { x, y: y - 1 };
    }
    if (dir === "S") {
      return { x, y: y + 1 };
    }
    if (dir === "E") {
      return { x: x + 1, y };
    }
    return { x: x - 1, y };
  }

  private rotToDir(rot: number): string {
    const normalized = ((Math.round(rot / 90) * 90) % 360 + 360) % 360;
    if (normalized === 90) {
      return "E";
    }
    if (normalized === 180) {
      return "S";
    }
    if (normalized === 270) {
      return "W";
    }
    return "N";
  }

  private dirToHeading(dir: string): number {
    if (dir === "E") {
      return Math.PI / 2;
    }
    if (dir === "S") {
      return Math.PI;
    }
    if (dir === "W") {
      return -Math.PI / 2;
    }
    return 0;
  }

  private dirBetween(from: LevelRoadPiece, to: LevelRoadPiece): string | null {
    const dx = to[1] - from[1];
    const dy = to[2] - from[2];
    if (dx === 1 && dy === 0) {
      return "E";
    }
    if (dx === -1 && dy === 0) {
      return "W";
    }
    if (dx === 0 && dy === -1) {
      return "N";
    }
    if (dx === 0 && dy === 1) {
      return "S";
    }

    return null;
  }

  private tileBoundaryWorld(piece: LevelRoadPiece, dir: string): { x: number; y: number } {
    return this.tileBoundaryWorldAt(piece[1], piece[2], dir);
  }

  private tileBoundaryWorldAt(x: number, y: number, dir: string): { x: number; y: number } {
    const center = this.gridToWorld(x, y);
    const halfCell = 300;
    if (dir === "N") {
      return { x: center.x, y: center.y + halfCell };
    }
    if (dir === "S") {
      return { x: center.x, y: center.y - halfCell };
    }
    if (dir === "E") {
      return { x: center.x + halfCell, y: center.y };
    }

    return { x: center.x - halfCell, y: center.y };
  }

  private turnCenterWorldPoint(piece: LevelRoadPiece, entryPort?: PiecePort, exitPort?: PiecePort): { x: number; y: number } {
    const [, gx, gy, , rot] = piece;
    if (this.isTurn180RoadType(piece[0]) && entryPort && exitPort) {
      const entry = this.tileBoundaryWorldAt(entryPort.x, entryPort.y, entryPort.dir);
      const exit = this.tileBoundaryWorldAt(exitPort.x, exitPort.y, exitPort.dir);
      return {
        x: (entry.x + exit.x) / 2,
        y: (entry.y + exit.y) / 2,
      };
    }

    const center = this.gridToWorld(gx, gy);
    return this.localPointToWorld(center, rot, { x: -300, y: -300 });
  }

  private fixedTurnSign(piece: LevelRoadPiece, entryPort: PiecePort, exitPort: PiecePort): -1 | 0 | 1 {
    const center = this.turnCenterWorldPoint(piece, entryPort, exitPort);
    const entry = this.tileBoundaryWorldAt(entryPort.x, entryPort.y, entryPort.dir);
    const exit = this.tileBoundaryWorldAt(exitPort.x, exitPort.y, exitPort.dir);
    const startAngle = Math.atan2(entry.y - center.y, entry.x - center.x);
    const endAngle = Math.atan2(exit.y - center.y, exit.x - center.x);
    const delta = this.arcDelta(startAngle, endAngle, this.dirToHeading(this.oppositeDir(entryPort.dir)));
    if (Math.abs(delta) < 0.01) {
      return 0;
    }

    return delta > 0 ? 1 : -1;
  }

  private findConnectingPort(piece: LevelRoadPiece, other: LevelRoadPiece): PiecePort | null {
    return this.getPiecePorts(piece).find((port) => {
      const neighbor = this.neighborOfCell(port.x, port.y, port.dir);
      return this.getPieceCells(other).some((cell) => cell.x === neighbor.x && cell.y === neighbor.y) &&
        this.hasPortAt(other, neighbor.x, neighbor.y, this.oppositeDir(port.dir));
    }) || null;
  }

  private localPointToWorld(origin: { x: number; y: number }, rot: number, local: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    const angle = (-rot * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: origin.x + (local.x * cos - local.y * sin),
      y: origin.y + (local.x * sin + local.y * cos),
    };
  }

  private isSameContinuousTurn(ordered: LevelRoadPiece[], index: number, cross: number): boolean {
    if (index < 2 || !this.isTurnRoadType(ordered[index - 1][0]) || !this.isTurnRoadType(ordered[index][0])) {
      return false;
    }

    const beforePrev = this.gridToWorld(ordered[index - 2][1], ordered[index - 2][2]);
    const prev = this.gridToWorld(ordered[index - 1][1], ordered[index - 1][2]);
    const current = this.gridToWorld(ordered[index][1], ordered[index][2]);
    const prevAx = prev.x - beforePrev.x;
    const prevAy = prev.y - beforePrev.y;
    const prevBx = current.x - prev.x;
    const prevBy = current.y - prev.y;
    const prevCross = prevAx * prevBy - prevAy * prevBx;
    return Math.sign(prevCross) === Math.sign(cross);
  }

  private isDriveRoadType(type: number): boolean {
    return type === 1 || type === 2 || type === 3 || type === 7 || type === 9 || type === 10;
  }

  private isTurnRoadType(type: number): boolean {
    return type === 2 || type === 3 || type === 9 || type === 10;
  }

  private isTurn180RoadType(type: number): boolean {
    return type === 3 || type === 10;
  }

  private isBridgeRoadType(type: number): boolean {
    return type === 7;
  }

  private gridKey(x: number, y: number): string {
    return `${x}_${y}`;
  }

  private gridToWorld(x: number, y: number): { x: number; y: number } {
    const cell = 600;
    return { x: x * cell, y: -y * cell };
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
