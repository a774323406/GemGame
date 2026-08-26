import {
  _decorator,
  Button,
  Color,
  Component,
  EventTouch,
  game,
  Game,
  Graphics,
  HorizontalTextAlignment,
  input,
  Input,
  Label,
  Mask,
  Node,
  ResolutionPolicy,
  Sprite,
  SpriteFrame,
  tween,
  UIOpacity,
  UITransform,
  Vec3,
  VerticalTextAlignment,
  view,
} from "cc";
import AudioManager from "./framework/AudioManager";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
import {
  FeedAcquisitionService,
  FeedAcquisitionState,
} from "./framework/Platform/FeedAcquisitionService";
import { ResourceManager } from "./framework/ResourceManager";
import { soundName } from "./gamePrefabMgr";
import { adc } from "./framework/Platform/ADController";

const { ccclass, property } = _decorator;

const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;
const CUP_Y = -438;
const CUP_WIDTH = 164;
const CUP_HEIGHT = 236;
const CUP_SPACING = 252;
const CUP_WRAP_LEFT = -520;
const CUP_SPEED = 385;
const READY_STRAW_Y = 340;
const STRAW_WIDTH = 30;
const STRAW_HEIGHT = 184;
const INSERTED_STRAW_CENTER_Y = 140;
const INSERTED_STRAW_CLIP_Y = 167;
const INSERTED_STRAW_CLIP_WIDTH = 40;
const INSERTED_STRAW_CLIP_HEIGHT = 130;
const STRAW_DROP_SPEED = 1080;
const STRAW_HIT_CHECK_Y = -246;
const STRAW_CATCH_HALF_WIDTH = 24;
const STRAW_MISS_Y = -720;
const MAX_FALLING_STRAWS = 1;

/** Bundle 热刷新时路径清单可能仍是旧缓存，固定 UUID 用作可靠兜底。 */
const MILK_TEA_SPRITE_UUIDS: Record<string, string> = {
  "milkTeaFeed/back-button/spriteFrame": "8f6b54c1-3b72-4cf3-8a36-a5d9f6e4c721@f9941",
  "milkTeaFeed/milkTeaBackground/spriteFrame": "03dfd2b7-d702-498f-8ecd-279f0e489d2a@f9941",
  "milkTeaFeed/lemon-tea/spriteFrame": "d099b03d-6a8e-40ae-bda7-702f2fbee221@f9941",
  "milkTeaFeed/bubble-milk-tea/spriteFrame": "0ad4e97a-ede0-4956-9d82-9c9b11b0f851@f9941",
  "milkTeaFeed/coffee-cream/spriteFrame": "27e3a502-358a-43eb-a361-8da6e1825f9a@f9941",
  "milkTeaFeed/jasmine-tea/spriteFrame": "d3b595dd-ec04-4087-ad60-7ddb35abcb00@f9941",
};

const MILK_TEA_CUP_PATHS = [
  "milkTeaFeed/lemon-tea/spriteFrame",
  "milkTeaFeed/bubble-milk-tea/spriteFrame",
  "milkTeaFeed/coffee-cream/spriteFrame",
  "milkTeaFeed/jasmine-tea/spriteFrame",
] as const;

type MilkTeaRoundState = "playing" | "complete" | "leaving";

interface CupState {
  root: Node;
  art: Node;
  artworkPath: string;
  strawClip: Node;
  insertedStraw: Node;
  baseY: number;
  filled: boolean;
}

interface FallingStraw {
  node: Node;
  checkedForHit: boolean;
}

/**
 * 推荐流奶茶投吸管小游戏。
 *
 * 参考视频的关键节奏：杯子在推荐流预览时已经横向移动；玩家点击全屏投下一根
 * 吸管，顶部待投吸管立即补回；命中后吸管跟随杯子移动，四杯全部命中即通关。
 */
@ccclass("milkTeaFeedGameScene")
export class milkTeaFeedGameScene extends Component {
  /** 以下节点已放在场景层级中，可直接在 Creator 里调整位置、尺寸和文字。 */
  @property(Node)
  public sceneBackground: Node | null = null;

  @property(Button)
  public sceneBackButton: Button | null = null;

  @property(Label)
  public sceneTitleLabel: Label | null = null;

  @property(Label)
  public sceneCounterLabel: Label | null = null;

  @property(Node)
  public sceneReadyStraw: Node | null = null;

  @property(Label)
  public sceneHintLabel: Label | null = null;

  @property([Node])
  public sceneCupRoots: Node[] = [];

  @property(Node)
  public sceneResultOverlay: Node | null = null;

  @property(Node)
  public sceneResultPanel: Node | null = null;

  @property(Button)
  public sceneNextButton: Button | null = null;

  private roundState: MilkTeaRoundState = "playing";
  private cups: CupState[] = [];
  private fallingStraws: FallingStraw[] = [];
  private throwCount = 0;
  private counterLabel: Label | null = null;
  private hintLabel: Label | null = null;
  private resultOverlay: Node | null = null;
  private resultPanel: Node | null = null;
  private nextButton: Button | null = null;
  private nextButtonOpacity: UIOpacity | null = null;
  private backButton: Button | null = null;
  private background: Node | null = null;
  private readyStraw: Node | null = null;
  private feedMode = false;
  private feedEntered = false;
  private feedExited = false;
  private feedAudioForeground = false;
  private feedInterstitialScheduled = false;
  private feedExperienceFinished = false;
  private artworkReadyPromise: Promise<void> = Promise.resolve();

  protected onLoad(): void {
    view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
    adc.cancelFeedEntryInterstitial();
    FeedAcquisitionService.init();
    this.feedMode = FeedAcquisitionService.isActive();
    const feedState = FeedAcquisitionService.getState();
    this.feedEntered = !this.feedMode || feedState.entered;
    this.feedExited = this.feedMode && feedState.exited;

    if (!this.bindSceneNodes()) {
      // 兼容还没刷新到新版场景资源的旧预览缓存。
      this.buildScene();
    }
    this.prepareSceneVisuals();
    this.bindEvents();
    this.artworkReadyPromise = this.loadArtwork();
  }

  protected start(): void {
    AudioManager.setSoundEvent();
    if (this.feedMode) {
      FeedAcquisitionService.addListener(this.onFeedStateChanged);
      void this.reportFeedSceneAfterArtworkReady();
    } else {
      AudioManager.playMusic(soundName.getUserBgm);
    }
  }

  protected update(deltaTime: number): void {
    if (this.roundState !== "playing" || this.feedExited) return;
    const dt = Math.min(0.04, Math.max(0, deltaTime));
    this.updateCups(dt);
    this.updateFallingStraws(dt);
  }

  protected onDestroy(): void {
    adc.cancelFeedEntryInterstitial();
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    if (this.feedMode && !this.feedExperienceFinished) {
      this.feedExperienceFinished = true;
      FeedAcquisitionService.completeSession();
    }
    game.off(Game.EVENT_HIDE, this.onGameHide, this);
    game.off(Game.EVENT_SHOW, this.onGameShow, this);
    input.off(Input.EventType.TOUCH_START, this.onGlobalTouchStart, this);
    input.off(Input.EventType.TOUCH_END, this.onGlobalTouchEnd, this);
    input.off(Input.EventType.TOUCH_CANCEL, this.onGlobalTouchCancel, this);
    this.unscheduleAllCallbacks();
  }

  private bindEvents(): void {
    this.backButton?.node?.on(Button.EventType.CLICK, this.returnToMain, this);
    this.nextButton?.node?.on(Button.EventType.CLICK, this.goToMainGame, this);
    game.on(Game.EVENT_HIDE, this.onGameHide, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);
    input.on(Input.EventType.TOUCH_START, this.onGlobalTouchStart, this);
    input.on(Input.EventType.TOUCH_END, this.onGlobalTouchEnd, this);
    input.on(Input.EventType.TOUCH_CANCEL, this.onGlobalTouchCancel, this);
  }

  private buildScene(): void {
    this.background = this.createNode("MilkTeaBackground", this.node, 0, 0, 750, 1334);
    this.background.addComponent(Sprite);

    const backNode = this.createNode("BackButton", this.node, -324, 548, 76, 76);
    backNode.addComponent(Sprite);
    this.backButton = backNode.addComponent(Button);
    this.backButton.transition = Button.Transition.SCALE;
    this.backButton.zoomScale = 1.06;

    const title = this.createLabel(
      "TitleLabel",
      this.node,
      32,
      548,
      610,
      70,
      43,
      "让所有奶茶都插上吸管",
    );
    this.applyOutlinedText(title);
    this.sceneTitleLabel = title;

    this.counterLabel = this.createLabel(
      "ThrowCounter",
      this.node,
      0,
      478,
      480,
      66,
      45,
      "一共投了0次",
    );
    this.applyOutlinedText(this.counterLabel);

    this.readyStraw = this.createStrawNode("ReadyStraw", this.node, 0, READY_STRAW_Y, STRAW_WIDTH, STRAW_HEIGHT);
    this.hintLabel = this.createLabel(
      "TapHint",
      this.node,
      0,
      214,
      420,
      48,
      27,
      "点击屏幕投下吸管",
      new Color(61, 133, 90, 220),
    );

    const startX = -360;
    for (let index = 0; index < MILK_TEA_CUP_PATHS.length; index++) {
      const root = this.createNode(`Cup${index + 1}`, this.node, startX + index * CUP_SPACING, CUP_Y, CUP_WIDTH, CUP_HEIGHT);
      const art = this.createNode(`CupArt${index + 1}`, root, 0, 0, CUP_WIDTH, CUP_HEIGHT);
      art.addComponent(Sprite);
      // 奶茶图在下，完整吸管在上；只用矩形区域裁掉吸管下端，不重新缩短绘制吸管。
      const strawClip = this.createNode(
        "InsertedStrawClip",
        root,
        0,
        INSERTED_STRAW_CLIP_Y,
        INSERTED_STRAW_CLIP_WIDTH,
        INSERTED_STRAW_CLIP_HEIGHT,
      );
      strawClip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
      const insertedStraw = this.createStrawNode(
        "InsertedStraw",
        strawClip,
        0,
        INSERTED_STRAW_CENTER_Y - INSERTED_STRAW_CLIP_Y,
        STRAW_WIDTH,
        STRAW_HEIGHT,
      );
      strawClip.active = false;
      this.cups.push({
        root,
        art,
        artworkPath: MILK_TEA_CUP_PATHS[index],
        strawClip,
        insertedStraw,
        baseY: root.position.y,
        filled: false,
      });
    }

    this.buildResultOverlay();

    this.sceneBackground = this.background;
    this.sceneBackButton = this.backButton;
    this.sceneCounterLabel = this.counterLabel;
    this.sceneReadyStraw = this.readyStraw;
    this.sceneHintLabel = this.hintLabel;
    this.sceneCupRoots = this.cups.map((cup) => cup.root);
    this.sceneResultOverlay = this.resultOverlay;
    this.sceneResultPanel = this.resultPanel;
    this.sceneNextButton = this.nextButton;
  }

  /** 优先使用场景中已经摆好的节点，运行时不再重复生成 UI。 */
  private bindSceneNodes(): boolean {
    const root = this.node;
    this.background = this.validNode(this.sceneBackground) ?? root.getChildByName("MilkTeaBackground");
    this.backButton = this.validComponent(this.sceneBackButton) ?? root.getChildByName("BackButton")?.getComponent(Button) ?? null;
    this.sceneTitleLabel = this.validComponent(this.sceneTitleLabel) ?? root.getChildByName("TitleLabel")?.getComponent(Label) ?? null;
    this.counterLabel = this.validComponent(this.sceneCounterLabel) ?? root.getChildByName("ThrowCounter")?.getComponent(Label) ?? null;
    this.hintLabel = this.validComponent(this.sceneHintLabel) ?? root.getChildByName("TapHint")?.getComponent(Label) ?? null;
    this.readyStraw = this.validNode(this.sceneReadyStraw) ?? root.getChildByName("ReadyStraw");
    this.resultOverlay = this.validNode(this.sceneResultOverlay) ?? root.getChildByName("ResultOverlay");
    this.resultPanel = this.validNode(this.sceneResultPanel) ?? this.resultOverlay?.getChildByName("ResultPanel") ?? null;
    this.nextButton = this.validComponent(this.sceneNextButton) ?? this.resultPanel?.getChildByName("NextButton")?.getComponent(Button) ?? null;
    this.nextButtonOpacity = this.nextButton?.node?.getComponent(UIOpacity) ?? null;

    const configuredCups = this.sceneCupRoots.filter((node) => node?.isValid);
    const cupRoots = configuredCups.length === MILK_TEA_CUP_PATHS.length
      ? configuredCups
      : MILK_TEA_CUP_PATHS.map((_, index) => root.getChildByName(`Cup${index + 1}`)).filter((node): node is Node => !!node);

    this.cups = [];
    for (let index = 0; index < cupRoots.length; index++) {
      const cupRoot = cupRoots[index];
      const art = cupRoot.getChildByName(`CupArt${index + 1}`);
      const strawClip = cupRoot.getChildByName("InsertedStrawClip") ?? cupRoot.getChildByName("CupRimMask");
      const insertedStraw = strawClip?.getChildByName("InsertedStraw") ?? cupRoot.getChildByName("InsertedStraw");
      if (!art || !strawClip || !insertedStraw) continue;
      this.cups.push({
        root: cupRoot,
        art,
        artworkPath: MILK_TEA_CUP_PATHS[index],
        strawClip,
        insertedStraw,
        baseY: cupRoot.position.y,
        filled: false,
      });
    }

    return !!(
      this.background &&
      this.backButton &&
      this.counterLabel &&
      this.hintLabel &&
      this.readyStraw &&
      this.resultOverlay &&
      this.resultPanel &&
      this.nextButton &&
      this.cups.length === MILK_TEA_CUP_PATHS.length
    );
  }

  private prepareSceneVisuals(): void {
    if (this.sceneTitleLabel?.isValid) this.applyOutlinedText(this.sceneTitleLabel);
    if (this.counterLabel?.isValid) this.applyOutlinedText(this.counterLabel);
    if (this.readyStraw?.isValid) this.drawStrawGraphics(this.readyStraw);
    for (const cup of this.cups) {
      cup.strawClip.active = false;
      cup.insertedStraw.active = true;
      this.drawStrawGraphics(cup.insertedStraw);
      if (cup.strawClip?.isValid) {
        (cup.strawClip.getComponent(Mask) ?? cup.strawClip.addComponent(Mask)).type = Mask.Type.GRAPHICS_RECT;
      }
    }
    if (this.resultOverlay?.isValid) {
      this.drawOverlayGraphics(this.resultOverlay);
      this.resultOverlay.active = false;
    }
    if (this.resultPanel?.isValid) this.drawResultPanelGraphics(this.resultPanel);
    if (this.nextButton?.node?.isValid) this.drawNextButtonGraphics(this.nextButton.node);
    this.nextButtonOpacity = this.nextButton?.node?.getComponent(UIOpacity) ?? this.nextButton?.node?.addComponent(UIOpacity) ?? null;
  }

  private buildResultOverlay(): void {
    this.resultOverlay = this.createNode("ResultOverlay", this.node, 0, 0, 750, 1334);
    const overlayGraphics = this.resultOverlay.addComponent(Graphics);
    overlayGraphics.fillColor = new Color(27, 92, 62, 145);
    overlayGraphics.rect(-375, -667, 750, 1334);
    overlayGraphics.fill();

    this.resultPanel = this.createNode("ResultPanel", this.resultOverlay, 0, 20, 540, 390);
    const panelGraphics = this.resultPanel.addComponent(Graphics);
    panelGraphics.fillColor = new Color(245, 255, 236, 255);
    panelGraphics.strokeColor = new Color(63, 166, 103, 255);
    panelGraphics.lineWidth = 6;
    panelGraphics.roundRect(-270, -195, 540, 390, 34);
    panelGraphics.fill();
    panelGraphics.stroke();

    const title = this.createLabel("ResultTitle", this.resultPanel, 0, 102, 460, 78, 55, "全部插好了！", new Color(35, 145, 86, 255));
    const detail = this.createLabel("ResultDetail", this.resultPanel, 0, 25, 460, 64, 31, "四杯奶茶全部完成", new Color(70, 119, 88, 255));
    title.isBold = true;
    detail.isBold = true;

    const buttonNode = this.createNode("NextButton", this.resultPanel, 0, -112, 300, 86);
    const buttonGraphics = buttonNode.addComponent(Graphics);
    buttonGraphics.fillColor = new Color(255, 158, 64, 255);
    buttonGraphics.strokeColor = new Color(193, 96, 36, 255);
    buttonGraphics.lineWidth = 5;
    buttonGraphics.roundRect(-150, -43, 300, 86, 42);
    buttonGraphics.fill();
    buttonGraphics.stroke();
    this.nextButton = buttonNode.addComponent(Button);
    this.nextButton.transition = Button.Transition.SCALE;
    this.nextButton.zoomScale = 1.06;
    this.nextButtonOpacity = buttonNode.addComponent(UIOpacity);
    const label = this.createLabel("Label", buttonNode, 0, -2, 270, 70, 36, "下一关");
    label.isBold = true;
    this.resultOverlay.active = false;
  }

  private async loadArtwork(): Promise<void> {
    const tasks: Promise<void>[] = [];
    tasks.push(this.loadSprite(this.background, "milkTeaFeed/milkTeaBackground/spriteFrame"));
    tasks.push(this.loadSprite(this.backButton?.node ?? null, "milkTeaFeed/back-button/spriteFrame"));
    for (const cup of this.cups) {
      tasks.push(this.loadSprite(cup.art, cup.artworkPath));
    }
    await Promise.all(tasks);
  }

  private async loadSprite(node: Node | null, path: string): Promise<void> {
    const sprite = node?.getComponent(Sprite);
    if (!node || !sprite) return;
    let lastError: unknown = null;

    try {
      const candidates = [path, path.replace(/\/spriteFrame$/, "")];
      let frame: SpriteFrame | null = null;
      for (const candidate of candidates) {
        try {
          frame = await ResourceManager.ins.loadBundleAsset("res", candidate, SpriteFrame);
          if (frame?.isValid) break;
        } catch (err) {
          lastError = err;
        }
      }

      if (!frame?.isValid) {
        const uuid = MILK_TEA_SPRITE_UUIDS[path];
        if (!uuid) throw lastError ?? new Error(`未配置图片 UUID: ${path}`);
        frame = await ResourceManager.ins.loadAssetByUuid<SpriteFrame>(uuid);
      }

      if (!node.isValid || !frame?.isValid) return;
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
    } catch (err) {
      console.warn(`[milkTeaFeedGameScene] 图片加载失败: ${path}`, err ?? lastError);
    }
  }

  private async reportFeedSceneAfterArtworkReady(): Promise<void> {
    await this.artworkReadyPromise;
    if (!this.node?.isValid || !this.feedMode || this.roundState !== "playing") return;
    await FeedAcquisitionService.reportSceneReadyAfterStableRender({
      owner: this.node,
      requiredVisibleNodes: [this.background, this.readyStraw, ...this.cups.map((cup) => cup.art)],
      isReady: () => this.roundState === "playing" && !this.feedExited,
      stableFrameCount: 3,
      surfaceDelayMs: 180,
    });
  }

  private updateCups(deltaTime: number): void {
    let furthestX = Math.max(...this.cups.map((cup) => cup.root.position.x));
    for (const cup of this.cups) {
      const nextX = cup.root.position.x - CUP_SPEED * deltaTime;
      if (nextX < CUP_WRAP_LEFT) {
        const wrappedX = furthestX + CUP_SPACING;
        cup.root.setPosition(wrappedX, cup.baseY, 0);
        furthestX = wrappedX;
      } else {
        cup.root.setPosition(nextX, cup.baseY, 0);
      }
    }
  }

  private updateFallingStraws(deltaTime: number): void {
    for (let index = this.fallingStraws.length - 1; index >= 0; index--) {
      const falling = this.fallingStraws[index];
      if (!falling.node?.isValid) {
        this.fallingStraws.splice(index, 1);
        continue;
      }

      const nextY = falling.node.position.y - STRAW_DROP_SPEED * deltaTime;
      falling.node.setPosition(0, nextY, 0);
      if (!falling.checkedForHit && nextY <= this.getStrawHitCheckY()) {
        falling.checkedForHit = true;
        const hitCup = this.findCatchableCup();
        if (hitCup) {
          this.completeCupHit(hitCup, falling.node);
          this.fallingStraws.splice(index, 1);
          continue;
        }
      }
      if (nextY <= STRAW_MISS_Y) {
        falling.node.destroy();
        this.fallingStraws.splice(index, 1);
      }
    }
  }

  private findCatchableCup(): CupState | null {
    let best: CupState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const cup of this.cups) {
      if (cup.filled) continue;
      const distance = Math.abs(cup.root.position.x);
      if (distance <= STRAW_CATCH_HALF_WIDTH && distance < bestDistance) {
        best = cup;
        bestDistance = distance;
      }
    }
    return best;
  }

  private completeCupHit(cup: CupState, projectile: Node): void {
    projectile.destroy();
    cup.filled = true;
    cup.strawClip.active = true;
    AudioManager.playEffect(soundName.down);
    cup.root.setScale(0.92, 0.92, 1);
    tween(cup.root)
      .to(0.18, { scale: new Vec3(1.08, 1.08, 1) }, { easing: "backOut" })
      .to(0.1, { scale: Vec3.ONE })
      .start();

    const completedCount = this.cups.filter((item) => item.filled).length;
    if (this.hintLabel) this.hintLabel.string = `已插好 ${completedCount}/4 杯`;
    if (completedCount >= this.cups.length) {
      this.roundState = "complete";
      this.scheduleOnce(this.showResult, 0.55);
    }
  }

  private onGlobalTouchStart = (): void => {
    if (this.roundState !== "playing") return;
    if (FeedAcquisitionService.isActive()) FeedAcquisitionService.activateFromFirstTouch();
  };

  private onGlobalTouchEnd = (event: EventTouch): void => {
    if (this.roundState !== "playing" || !this.isInteractionEnabled()) return;
    const target = event.target as Node | null;
    if (
      this.isNodeInside(target, this.backButton?.node) ||
      this.isTouchInsideNode(event, this.backButton?.node)
    ) {
      return;
    }
    if (this.fallingStraws.length >= MAX_FALLING_STRAWS) return;

    this.throwCount += 1;
    if (this.counterLabel) this.counterLabel.string = `一共投了${this.throwCount}次`;
    if (this.hintLabel && this.throwCount === 1) this.hintLabel.string = "对准移动中的杯口";
    AudioManager.playEffect(soundName.up);
    const readyTransform = this.readyStraw?.getComponent(UITransform);
    const straw = this.createStrawNode(
      `FallingStraw${this.throwCount}`,
      this.node,
      this.readyStraw?.position.x ?? 0,
      this.readyStraw?.position.y ?? READY_STRAW_Y,
      readyTransform?.width ?? STRAW_WIDTH,
      readyTransform?.height ?? STRAW_HEIGHT,
    );
    // 投下的吸管放在待投吸管下层，让顶部始终保持“还有一根”的参考视频效果。
    if (this.readyStraw?.isValid) straw.setSiblingIndex(Math.max(1, this.readyStraw.getSiblingIndex()));
    this.fallingStraws.push({ node: straw, checkedForHit: false });
  };

  private onGlobalTouchCancel = (): void => {};

  private readonly showResult = (): void => {
    if (!this.resultOverlay?.isValid || this.roundState !== "complete") return;
    this.resultOverlay.active = true;
    if (this.resultPanel?.isValid) {
      this.resultPanel.setScale(0.72, 0.72, 1);
      tween(this.resultPanel)
        .to(0.24, { scale: new Vec3(1.06, 1.06, 1) }, { easing: "backOut" })
        .to(0.1, { scale: Vec3.ONE })
        .start();
    }
    if (this.nextButtonOpacity?.isValid) {
      this.nextButtonOpacity.opacity = 0;
      tween(this.nextButtonOpacity)
        .to(0.3, { opacity: 255 }, { easing: "quadOut" })
        .repeatForever(
          tween(this.nextButtonOpacity)
            .to(0.65, { opacity: 185 }, { easing: "sineInOut" })
            .to(0.65, { opacity: 255 }, { easing: "sineInOut" }),
        )
        .start();
    }
  };

  private goToMainGame = (): void => {
    if (this.roundState !== "complete") return;
    this.roundState = "leaving";
    if (this.nextButton) this.nextButton.interactable = false;
    this.finishFeedExperience();
    AudioManager.playDefaultBgm();
    void GameSceneBundle.loadScene(GameSceneName.Game).catch((err) => {
      console.error("[milkTeaFeedGameScene] 下一关加载失败", err);
      this.roundState = "complete";
      if (this.nextButton?.node?.isValid) this.nextButton.interactable = true;
    });
  };

  private returnToMain = (): void => {
    if (this.roundState === "leaving") return;
    this.roundState = "leaving";
    this.finishFeedExperience();
    AudioManager.playDefaultBgm();
    AudioManager.playEffect(soundName.buttonClick);
    void GameSceneBundle.loadScene(GameSceneName.Main).catch((err) => {
      console.error("[milkTeaFeedGameScene] 返回主页失败", err);
      this.roundState = "playing";
    });
  };

  private readonly onFeedStateChanged = (state: FeedAcquisitionState): void => {
    this.feedMode = state.active;
    this.feedEntered = !state.active || (state.entered && !state.exited);
    this.feedExited = state.active && state.exited;
    if (this.feedExited) {
      adc.cancelFeedEntryInterstitial();
      this.feedInterstitialScheduled = false;
      this.feedAudioForeground = false;
      AudioManager.pauseBgmForVideo();
    } else if (!state.active) {
      AudioManager.playMusic(soundName.getUserBgm);
    } else if (state.entered) {
      if (!this.feedInterstitialScheduled) {
        this.feedInterstitialScheduled = true;
        adc.scheduleFeedEntryInterstitial(() => {
          const current = FeedAcquisitionService.getState();
          return !!this.node?.isValid && current.active && current.entered && !current.exited;
        });
      }
      if (!this.feedAudioForeground) {
        this.feedAudioForeground = true;
        AudioManager.restartMusic(soundName.getUserBgm);
      }
    }
  };

  private readonly onGameShow = (): void => {
    if (!this.feedMode || this.feedExited) return;
    this.feedAudioForeground = true;
    AudioManager.restartMusic(soundName.getUserBgm);
  };

  private readonly onGameHide = (): void => {
    if (!this.feedMode) return;
    this.feedAudioForeground = false;
    AudioManager.pauseBgmForVideo();
  };

  private isInteractionEnabled(): boolean {
    return !this.feedMode || (this.feedEntered && !this.feedExited);
  }

  private finishFeedExperience(): void {
    if (!this.feedMode || this.feedExperienceFinished) return;
    this.feedExperienceFinished = true;
    adc.cancelFeedEntryInterstitial();
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    FeedAcquisitionService.completeSession();
  }

  private createNode(name: string, parent: Node, x: number, y: number, width: number, height: number): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    node.parent = parent;
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(width, height);
    return node;
  }

  private createLabel(
    name: string,
    parent: Node,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize: number,
    text: string,
    color = Color.WHITE,
  ): Label {
    const node = this.createNode(name, parent, x, y, width, height);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.round(fontSize * 1.12);
    label.color = color;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    return label;
  }

  private applyOutlinedText(label: Label): void {
    label.isBold = true;
    label.enableOutline = true;
    label.outlineColor = new Color(33, 52, 38, 255);
    label.outlineWidth = 4;
  }

  private createStrawNode(name: string, parent: Node, x: number, y: number, width: number, height: number): Node {
    const node = this.createNode(name, parent, x, y, width, height);
    node.addComponent(Graphics);
    this.drawStrawGraphics(node);
    return node;
  }

  private drawStrawGraphics(node: Node): void {
    const transform = node.getComponent(UITransform);
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    const width = transform?.width || STRAW_WIDTH;
    const height = transform?.height || STRAW_HEIGHT;
    graphics.clear();
    const halfWidth = width * 0.34;
    const halfHeight = height * 0.48;
    graphics.fillColor = new Color(255, 213, 163, 255);
    graphics.strokeColor = new Color(136, 72, 40, 255);
    graphics.lineWidth = Math.max(2.5, width * 0.1);
    graphics.moveTo(-halfWidth, halfHeight - 2);
    graphics.lineTo(halfWidth, halfHeight - 2);
    graphics.lineTo(halfWidth, -halfHeight + 18);
    graphics.lineTo(-halfWidth, -halfHeight);
    graphics.close();
    graphics.fill();
    graphics.stroke();
    graphics.fillColor = new Color(255, 240, 202, 255);
    graphics.ellipse(0, halfHeight - 2, halfWidth, Math.max(3, width * 0.12));
    graphics.fill();
    graphics.stroke();
    graphics.fillColor = new Color(255, 243, 218, 220);
    graphics.roundRect(-halfWidth * 0.52, -halfHeight * 0.72, Math.max(3, width * 0.16), height * 0.72, 3);
    graphics.fill();
  }

  private drawOverlayGraphics(node: Node): void {
    const transform = node.getComponent(UITransform);
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    const width = transform?.width || DESIGN_WIDTH;
    const height = transform?.height || DESIGN_HEIGHT;
    graphics.clear();
    graphics.fillColor = new Color(27, 92, 62, 145);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
  }

  private drawResultPanelGraphics(node: Node): void {
    const transform = node.getComponent(UITransform);
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    const width = transform?.width || 540;
    const height = transform?.height || 390;
    graphics.clear();
    graphics.fillColor = new Color(245, 255, 236, 255);
    graphics.strokeColor = new Color(63, 166, 103, 255);
    graphics.lineWidth = 6;
    graphics.roundRect(-width / 2, -height / 2, width, height, 34);
    graphics.fill();
    graphics.stroke();
  }

  private drawNextButtonGraphics(node: Node): void {
    const transform = node.getComponent(UITransform);
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    const width = transform?.width || 300;
    const height = transform?.height || 86;
    graphics.clear();
    graphics.fillColor = new Color(255, 158, 64, 255);
    graphics.strokeColor = new Color(193, 96, 36, 255);
    graphics.lineWidth = 5;
    graphics.roundRect(-width / 2, -height / 2, width, height, height / 2);
    graphics.fill();
    graphics.stroke();
  }

  private getStrawHitCheckY(): number {
    if (this.cups.length === 0) return STRAW_HIT_CHECK_Y;
    return Math.max(...this.cups.map((cup) => cup.baseY)) + (STRAW_HIT_CHECK_Y - CUP_Y);
  }

  private validNode(node: Node | null): Node | null {
    return node?.isValid ? node : null;
  }

  private validComponent<T extends Component>(component: T | null): T | null {
    return component?.isValid && component.node?.isValid ? component : null;
  }

  private isNodeInside(target: Node | null, root: Node | null | undefined): boolean {
    if (!target || !root) return false;
    let current: Node | null = target;
    while (current) {
      if (current === root) return true;
      current = current.parent;
    }
    return false;
  }

  private isTouchInsideNode(event: EventTouch, node: Node | null | undefined): boolean {
    if (!node?.isValid || !node.activeInHierarchy) return false;
    return node.getComponent(UITransform)?.hitTest(event.getUILocation()) ?? false;
  }
}
