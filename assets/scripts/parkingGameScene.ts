import {
  _decorator,
  Button,
  Color,
  Component,
  game,
  Game,
  Graphics,
  Label,
  Node,
  ResolutionPolicy,
  Sprite,
  tween,
  Tween,
  UITransform,
  UIOpacity,
  Vec3,
  view,
} from "cc";
import AudioManager from "./framework/AudioManager";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
import { SdkUtils } from "./framework/Platform/sdk/SdkUtils";
import { soundName } from "./gamePrefabMgr";

const { ccclass, property } = _decorator;

type ParkingState =
  | "loading"
  | "orbiting"
  | "judging"
  | "paused"
  | "success"
  | "failed";

interface ParkingLevel {
  rotationSpeed: number;
  direction: 1 | -1;
  toleranceDegrees: number;
  bayAngle: number;
  bayX: number;
  bayY: number;
}

const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;
const BAY_WIDTH = 246;
const BAY_HEIGHT = 445;
const CAR_WIDTH = 170;
const CAR_HEIGHT = 320;
const PIVOT_LEAD = 55;
const PIVOT_DISTANCE = PIVOT_LEAD + CAR_HEIGHT * 0.5;
const DEG = 180 / Math.PI;

const LEVELS: readonly ParkingLevel[] = [
  {
    rotationSpeed: 252,
    direction: 1,
    toleranceDegrees: 1,
    bayAngle: 0,
    bayX: 0,
    bayY: 20,
  },
  {
    rotationSpeed: 270,
    direction: -1,
    toleranceDegrees: 1,
    bayAngle: 0,
    bayX: 0,
    bayY: 12,
  },
  {
    rotationSpeed: 288,
    direction: 1,
    toleranceDegrees: 1,
    bayAngle: 12,
    bayX: -16,
    bayY: 14,
  },
  {
    rotationSpeed: 306,
    direction: -1,
    toleranceDegrees: 1,
    bayAngle: -13,
    bayX: 16,
    bayY: 10,
  },
  {
    rotationSpeed: 324,
    direction: 1,
    toleranceDegrees: 1,
    bayAngle: 0,
    bayX: 0,
    bayY: 4,
  },
];

@ccclass("parkingGameScene")
export class parkingGameScene extends Component {
  @property(Node)
  sceneWorldRoot: Node | null = null;

  @property(Node)
  sceneBayRoot: Node | null = null;

  @property(Sprite)
  sceneBaySprite: Sprite | null = null;

  @property(Node)
  sceneEffectRoot: Node | null = null;

  @property(Node)
  sceneCarPivot: Node | null = null;

  @property(Node)
  sceneCarBody: Node | null = null;

  @property(Node)
  sceneWrongX: Node | null = null;

  @property(Label)
  sceneLevelLabel: Label | null = null;

  @property(Label)
  sceneInstructionLabel: Label | null = null;

  @property(Button)
  sceneSlowdownButton: Button | null = null;

  @property(Button)
  sceneStopButton: Button | null = null;

  @property(Button)
  sceneHomeButton: Button | null = null;

  @property(Node)
  sceneResultOverlay: Node | null = null;

  @property(UIOpacity)
  sceneResultOverlayOpacity: UIOpacity | null = null;

  @property(Node)
  sceneResultPanel: Node | null = null;

  @property(Label)
  sceneResultTitle: Label | null = null;

  @property(Label)
  sceneResultDetail: Label | null = null;

  @property(Button)
  sceneResultActionButton: Button | null = null;

  @property(Label)
  sceneResultActionLabel: Label | null = null;

  @property(Button)
  sceneResultHomeButton: Button | null = null;

  private state: ParkingState = "loading";
  private levelIndex = 0;
  private phase = 0;
  private currentSpeed = 0;
  private appHidden = false;
  private leaving = false;

  private bayRoot: Node | null = null;
  private effectRoot: Node | null = null;
  private carRoot: Node | null = null;
  private carBodyRoot: Node | null = null;
  private orbitCenter = new Vec3();

  private levelLabel: Label | null = null;
  private instructionLabel: Label | null = null;
  private brakeButton: Button | null = null;
  private brakeButtonNode: Node | null = null;

  private overlayRoot: Node | null = null;
  private overlayOpacity: UIOpacity | null = null;
  private resultPanel: Node | null = null;
  private resultTitle: Label | null = null;
  private resultDetail: Label | null = null;
  private resultActionLabel: Label | null = null;

  private stopWillSucceed = false;
  private stopError = 0;
  private slowdownMultiplier = 1;
  private slowdownInFlight = false;

  protected onLoad(): void {
    view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
    this.bindSceneNodes();
    this.sceneStopButton?.node?.on(Button.EventType.CLICK, this.onBrakePressed, this);
    this.sceneSlowdownButton?.node?.on(Button.EventType.CLICK, this.onSlowdownPressed, this);
    this.sceneHomeButton?.node?.on(Button.EventType.CLICK, this.returnToMain, this);
    this.sceneResultActionButton?.node?.on(Button.EventType.CLICK, this.onResultAction, this);
    this.sceneResultHomeButton?.node?.on(Button.EventType.CLICK, this.returnToMain, this);
    game.on(Game.EVENT_HIDE, this.onGameHide, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);
  }

  protected start(): void {
    AudioManager.setSoundEvent();
    // 停车玩法与打瓶子玩法共用同一首背景音乐。
    AudioManager.playMusic(soundName.getUserBgm);
    this.startLevel(0);
  }

  protected update(deltaTime: number): void {
    if (this.appHidden || this.state === "paused" || this.state === "loading") return;
    const dt = Math.min(0.05, Math.max(0, deltaTime));
    if (this.state === "orbiting") {
      this.updateOrbit(dt);
    }
  }

  protected onDestroy(): void {
    game.off(Game.EVENT_HIDE, this.onGameHide, this);
    game.off(Game.EVENT_SHOW, this.onGameShow, this);
    this.sceneStopButton?.node?.off(Button.EventType.CLICK, this.onBrakePressed, this);
    this.sceneSlowdownButton?.node?.off(Button.EventType.CLICK, this.onSlowdownPressed, this);
    this.sceneHomeButton?.node?.off(Button.EventType.CLICK, this.returnToMain, this);
    this.sceneResultActionButton?.node?.off(Button.EventType.CLICK, this.onResultAction, this);
    this.sceneResultHomeButton?.node?.off(Button.EventType.CLICK, this.returnToMain, this);
    this.unscheduleAllCallbacks();
    if (this.carRoot?.isValid) Tween.stopAllByTarget(this.carRoot);
    if (this.brakeButtonNode?.isValid) Tween.stopAllByTarget(this.brakeButtonNode);
    if (this.overlayRoot?.isValid) Tween.stopAllByTarget(this.overlayRoot);
    if (this.resultPanel?.isValid) Tween.stopAllByTarget(this.resultPanel);
  }

  private bindSceneNodes(): void {
    this.bayRoot = this.sceneBayRoot;
    this.effectRoot = this.sceneEffectRoot;
    this.carRoot = this.sceneCarPivot;
    this.carBodyRoot = this.sceneCarBody;
    this.levelLabel = this.sceneLevelLabel;
    this.instructionLabel = this.sceneInstructionLabel;
    this.brakeButton = this.sceneStopButton;
    this.brakeButtonNode = this.sceneStopButton?.node ?? null;
    this.overlayRoot = this.sceneResultOverlay;
    this.overlayOpacity = this.sceneResultOverlayOpacity;
    this.resultPanel = this.sceneResultPanel;
    this.resultTitle = this.sceneResultTitle;
    this.resultDetail = this.sceneResultDetail;
    this.resultActionLabel = this.sceneResultActionLabel;

    this.carRoot?.getComponent(UITransform)?.setAnchorPoint(0.5, 1);
    this.carBodyRoot?.setPosition(0, -PIVOT_DISTANCE, 0);
    if (this.sceneWrongX?.isValid) this.sceneWrongX.active = false;
    if (this.overlayRoot?.isValid) this.overlayRoot.active = false;

    if (
      !this.sceneWorldRoot ||
      !this.bayRoot ||
      !this.sceneBaySprite ||
      !this.carRoot ||
      !this.carBodyRoot ||
      !this.overlayRoot ||
      !this.resultPanel ||
      !this.resultTitle ||
      !this.resultDetail ||
      !this.sceneResultActionButton ||
      !this.resultActionLabel ||
      !this.sceneResultHomeButton
    ) {
      console.error("[parkingGameScene] 场景节点绑定不完整，请检查 ParkingGameScene");
    }
  }

  private startLevel(index: number): void {
    this.unschedule(this.resumeAfterMiss);
    this.levelIndex = ((index % LEVELS.length) + LEVELS.length) % LEVELS.length;
    const level = LEVELS[this.levelIndex];
    this.slowdownMultiplier = 1;
    this.slowdownInFlight = false;
    this.state = "orbiting";
    this.currentSpeed = level.rotationSpeed;
    this.phase = (-level.direction * 142) / DEG;
    this.destroyChildren(this.effectRoot);
    if (this.overlayRoot) this.overlayRoot.active = false;
    if (this.brakeButton) this.brakeButton.interactable = true;
    if (this.sceneSlowdownButton) this.sceneSlowdownButton.interactable = true;
    if (this.sceneWrongX?.isValid) this.sceneWrongX.active = false;
    if (this.levelLabel) this.levelLabel.string = `第 ${this.levelIndex + 1} / ${LEVELS.length} 关`;
    if (this.instructionLabel) {
      this.instructionLabel.string = "看准车位，点击暂停按钮停车";
      this.instructionLabel.color = new Color(241, 247, 247, 255);
    }
    if (this.bayRoot) {
      this.bayRoot.setPosition(level.bayX, level.bayY, 0);
      this.bayRoot.angle = level.bayAngle;
    }
    this.drawParkingBay(false);
    this.configureOrbitPivot(level);
    this.applyOrbitPose(level);
  }

  private updateOrbit(dt: number): void {
    const level = LEVELS[this.levelIndex];
    this.currentSpeed = level.rotationSpeed * this.slowdownMultiplier;
    const angularSpeed = this.currentSpeed / DEG;
    this.phase = this.wrapRadians(this.phase + level.direction * angularSpeed * dt);
    this.applyOrbitPose(level);

    const errorDegrees = Math.abs(this.angularDifference(this.phase, 0)) * DEG;
    const isNear = errorDegrees <= level.toleranceDegrees * 1.8;
    if (isNear) this.pulseBrakeButton();
  }

  private applyOrbitPose(level: ParkingLevel): void {
    if (!this.carRoot) return;
    this.carRoot.setPosition(this.orbitCenter);
    this.carRoot.angle = level.bayAngle + this.phase * DEG;
  }

  private onBrakePressed(): void {
    if (this.state !== "orbiting" || !this.carRoot) return;
    AudioManager.playEffect(soundName.carClick);
    const level = LEVELS[this.levelIndex];
    this.stopError = this.angularDifference(this.phase, 0);
    this.stopWillSucceed = this.isCarInsideParkingArea(level);
    this.state = "judging";
    this.currentSpeed = 0;
    if (this.brakeButton) this.brakeButton.interactable = false;
    Tween.stopAllByTarget(this.carRoot);
    tween(this.carRoot)
      .to(0.1, { scale: new Vec3(1.06, 1.06, 1) })
      .to(0.1, { scale: Vec3.ONE })
      .call(() => this.finishParkingStop())
      .start();
  }

  private async onSlowdownPressed(): Promise<void> {
    if (
      this.slowdownInFlight ||
      this.state !== "orbiting" ||
      !this.sceneSlowdownButton?.interactable
    ) {
      return;
    }

    AudioManager.playEffect(soundName.carClick);
    this.slowdownInFlight = true;
    this.state = "paused";
    this.currentSpeed = 0;
    this.sceneSlowdownButton.interactable = false;

    const rewarded = await SdkUtils.showRewardedVideo();
    if (!this.node?.isValid || this.leaving) return;

    this.slowdownInFlight = false;
    if (rewarded) {
      // 每次完整观看广告都在当前速度基础上再减速，允许玩家重复使用。
      this.slowdownMultiplier *= 0.62;
      this.sceneSlowdownButton.interactable = true;
      this.showDouyinToast("转速已降低");
    } else {
      this.sceneSlowdownButton.interactable = true;
      this.showDouyinToast("完整看完广告才能减速");
    }

    this.state = "orbiting";
    this.currentSpeed = LEVELS[this.levelIndex].rotationSpeed * this.slowdownMultiplier;
  }

  private showDouyinToast(title: string): void {
    try {
      const api = typeof tt !== "undefined" ? tt : null;
      if (typeof api?.showToast === "function") {
        api.showToast({ title, icon: "none" });
      } else {
        console.log(`[parkingGameScene] ${title}`);
      }
    } catch {
      console.log(`[parkingGameScene] ${title}`);
    }
  }

  private finishParkingStop(): void {
    if (!this.carRoot) return;
    if (this.stopWillSucceed) {
      this.state = "success";
      this.drawParkingBay(true);
      this.spawnCelebration();
      this.scheduleOnce(() => this.showResult(true), 0.65);
    } else {
      this.state = "failed";
      this.spawnFailureMark();
      // 失误时短暂停顿，让玩家看清角度，然后继续旋转。
      this.scheduleOnce(this.resumeAfterMiss, 0.45);
    }
  }

  private resumeAfterMiss = (): void => {
    if (this.state !== "failed" || this.leaving) return;
    this.state = "orbiting";
    this.currentSpeed =
      LEVELS[this.levelIndex].rotationSpeed * this.slowdownMultiplier;
    if (this.brakeButton) this.brakeButton.interactable = true;
    if (this.sceneWrongX?.isValid) this.sceneWrongX.active = false;
  };

  private showResult(success: boolean): void {
    if (!this.overlayRoot?.isValid || this.leaving) return;
    this.overlayRoot.active = true;
    if (this.overlayOpacity) {
      Tween.stopAllByTarget(this.overlayOpacity);
      this.overlayOpacity.opacity = 0;
      tween(this.overlayOpacity).to(0.16, { opacity: 255 }).start();
    }
    if (this.resultPanel?.isValid) {
      Tween.stopAllByTarget(this.resultPanel);
      this.resultPanel.setScale(0.68, 0.68, 1);
      tween(this.resultPanel)
        .to(0.22, { scale: new Vec3(1.06, 1.06, 1) }, { easing: "backOut" })
        .to(0.1, { scale: Vec3.ONE })
        .start();
    }
    const accuracy = Math.max(
      0,
      Math.round(
        100 -
          (Math.abs(this.stopError) /
            (LEVELS[this.levelIndex].toleranceDegrees / DEG)) *
            38,
      ),
    );
    if (this.resultTitle) {
      this.resultTitle.string = success ? "停车成功" : "停车失败";
      this.resultTitle.color = Color.WHITE;
    }
    if (this.resultDetail) {
      this.resultDetail.string = success
        ? `停车评分：${accuracy}\n${accuracy >= 92 ? "时机完美！" : "稳稳停进区域"}`
        : "停车时机偏差太大\n等车辆经过车位时再点击";
    }
    if (this.resultActionLabel) {
      this.resultActionLabel.string = success
        ? this.levelIndex >= LEVELS.length - 1
          ? "再玩一次"
          : "下一关"
        : "重新挑战";
    }
  }

  private onResultAction(): void {
    AudioManager.playEffect(soundName.carClick);
    this.startLevel(this.state === "success" ? this.levelIndex + 1 : this.levelIndex);
  }

  private returnToMain(): void {
    if (this.leaving) return;
    this.leaving = true;
    AudioManager.playEffect(soundName.carClick);
    if (this.brakeButton) this.brakeButton.interactable = false;
    void GameSceneBundle.loadScene(GameSceneName.Main).catch((err) => {
      console.error("[parkingGameScene] 返回主页失败", err);
      this.leaving = false;
      if (this.brakeButton?.node?.isValid) this.brakeButton.interactable = true;
    });
  }

  private drawParkingBay(success: boolean): void {
    if (!this.sceneBaySprite?.isValid) return;
    this.sceneBaySprite.color = success
      ? new Color(151, 255, 170, 255)
      : Color.WHITE;
  }

  private configureOrbitPivot(level: ParkingLevel): void {
    const pivotOffset = this.rotatePoint(0, PIVOT_DISTANCE, level.bayAngle);
    this.orbitCenter.set(level.bayX + pivotOffset.x, level.bayY + pivotOffset.y, 0);
  }

  private spawnCelebration(): void {
    if (!this.effectRoot || !this.carRoot) return;
    const carCenter = this.getCarBodyPosition();
    const colors = [
      new Color(255, 210, 58, 255),
      new Color(80, 224, 132, 255),
      new Color(255, 101, 111, 255),
      new Color(94, 194, 255, 255),
    ];
    for (let index = 0; index < 16; index++) {
      const angle = (Math.PI * 2 * index) / 16;
      const particle = this.createNode(
        `Confetti${index}`,
        this.effectRoot,
        18,
        18,
        carCenter.x,
        carCenter.y,
      );
      const graphics = particle.addComponent(Graphics);
      graphics.fillColor = colors[index % colors.length];
      graphics.roundRect(-7, -7, 14, 14, 4);
      graphics.fill();
      const opacity = particle.addComponent(UIOpacity);
      const distance = 120 + (index % 4) * 22;
      tween(particle)
        .to(
          0.62,
          {
            position: new Vec3(
              carCenter.x + Math.cos(angle) * distance,
              carCenter.y + Math.sin(angle) * distance,
              0,
            ),
            angle: index * 53,
            scale: new Vec3(0.5, 0.5, 1),
          },
          { easing: "quadOut" },
        )
        .call(() => particle.destroy())
        .start();
      tween(opacity).delay(0.28).to(0.34, { opacity: 0 }).start();
    }
  }

  private spawnFailureMark(): void {
    if (this.sceneWrongX?.isValid) {
      const mark = this.sceneWrongX;
      const level = LEVELS[this.levelIndex];
      Tween.stopAllByTarget(mark);
      mark.active = true;
      mark.setPosition(level.bayX, level.bayY, 0);
      mark.setScale(0.35, 0.35, 1);
      tween(mark)
        .to(0.18, { scale: new Vec3(1.08, 1.08, 1) }, { easing: "backOut" })
        .to(0.1, { scale: Vec3.ONE })
        .start();
      return;
    }
    if (!this.effectRoot || !this.carRoot) return;
    const carCenter = this.getCarBodyPosition();
    const mark = this.createNode(
      "FailureMark",
      this.effectRoot,
      170,
      170,
      carCenter.x,
      carCenter.y,
    );
    const graphics = mark.addComponent(Graphics);
    graphics.lineWidth = 22;
    graphics.lineCap = Graphics.LineCap.ROUND;
    graphics.strokeColor = new Color(239, 69, 62, 245);
    graphics.moveTo(-48, -48);
    graphics.lineTo(48, 48);
    graphics.moveTo(-48, 48);
    graphics.lineTo(48, -48);
    graphics.stroke();
    mark.setScale(0.3, 0.3, 1);
    tween(mark)
      .to(0.2, { scale: new Vec3(1.12, 1.12, 1) }, { easing: "backOut" })
      .to(0.12, { scale: Vec3.ONE })
      .delay(0.4)
      .call(() => mark.destroy())
      .start();
  }

  private pulseBrakeButton(): void {
    const node = this.brakeButtonNode;
    if (!node?.isValid || Tween.getRunningCount(node) > 0) return;
    tween(node)
      .to(0.12, { scale: new Vec3(1.07, 1.07, 1) })
      .to(0.14, { scale: Vec3.ONE })
      .start();
  }

  private onGameHide = (): void => {
    this.appHidden = true;
  };

  private onGameShow = (): void => {
    this.appHidden = false;
  };

  private createNode(
    name: string,
    parent: Node,
    width: number,
    height: number,
    x = 0,
    y = 0,
  ): Node {
    const node = new Node(name);
    node.layer = this.node.layer;
    node.parent = parent;
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(width, height);
    return node;
  }

  private destroyChildren(parent: Node | null): void {
    if (!parent?.isValid) return;
    for (const child of [...parent.children]) {
      child.destroy();
    }
  }

  private rotatePoint(x: number, y: number, angleDegrees: number): Vec3 {
    const radians = (angleDegrees / DEG);
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    return new Vec3(x * cosine - y * sine, x * sine + y * cosine, 0);
  }

  private isCarInsideParkingArea(level: ParkingLevel): boolean {
    if (!this.carRoot) return false;
    const carCenter = this.getCarBodyPosition();
    const relativeX = carCenter.x - level.bayX;
    const relativeY = carCenter.y - level.bayY;
    const localPosition = this.rotatePoint(relativeX, relativeY, -level.bayAngle);
    const maxX = (BAY_WIDTH - CAR_WIDTH) * 0.5 + 10;
    const maxY = (BAY_HEIGHT - CAR_HEIGHT) * 0.5 + 10;
    const angleError = Math.abs(
      ((this.carRoot.angle - level.bayAngle + 180) % 360 + 360) % 360 - 180,
    );
    return (
      Math.abs(localPosition.x) <= maxX &&
      Math.abs(localPosition.y) <= maxY &&
      angleError <= level.toleranceDegrees
    );
  }

  private getCarBodyPosition(): Vec3 {
    if (!this.carRoot) return new Vec3();
    const offset = this.rotatePoint(0, -PIVOT_DISTANCE, this.carRoot.angle);
    return new Vec3(
      this.carRoot.position.x + offset.x,
      this.carRoot.position.y + offset.y,
      0,
    );
  }

  private angularDifference(value: number, target: number): number {
    let difference = this.wrapRadians(value - target);
    if (difference > Math.PI) difference -= Math.PI * 2;
    return difference;
  }

  private wrapRadians(value: number): number {
    const circle = Math.PI * 2;
    return ((value % circle) + circle) % circle;
  }

}
