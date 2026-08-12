import {
  _decorator,
  Button,
  Color,
  Component,
  director,
  Director,
  EventTouch,
  game,
  Game,
  Graphics,
  HorizontalTextAlignment,
  Node,
  Sprite,
  tween,
  Tween,
  UITransform,
  UIOpacity,
  Label,
  Vec2,
  VerticalTextAlignment,
  Widget,
} from "cc";
import { GameSceneBundle, GameSceneName } from "./framework/GameSceneBundle";
import AudioManager from "./framework/AudioManager";
import { soundName, uiName } from "./gamePrefabMgr";
import { FeedAcquisitionService, FeedAcquisitionState } from "./framework/Platform/FeedAcquisitionService";
import { FeedRevisitService } from "./framework/Platform/FeedRevisitService";
import { adc } from "./framework/Platform/ADController";
import { SdkUtils } from "./framework/Platform/sdk/SdkUtils";
import FGUIController from "./framework/tools/FGUIController";
import UIManager, { UILayer } from "./framework/ui/UIManager";
import PlayData from "./data/PlayData";
const { ccclass, property } = _decorator;

@ccclass("HairGameScene")
export class HairGameScene extends Component {
  private static readonly TOTAL_LEVELS = 10;
  private static readonly FIRST_FEMALE_LEVEL_INDEX = 5;
  private static readonly MALE_BACKGROUND_INDEX = 0;
  private static readonly FEMALE_BACKGROUND_INDEX = 2;

  @property(Button)
  tipsBtn: Button = null;
  @property(Button)
  nextBtn: Button = null;
  @property(Node)
  hairNode: Node = null;
  @property(Label)
  nextLabel: Label = null;
  @property(Button)
  settingBtn: Button = null;

  @property(Node)
  firstHairNode: Node = null;
  @property(Node)
  firstCharacterNode: Node = null;
  @property({ tooltip: "头发每秒旋转角度" })
  rotationSpeed = 252;

  @property({ tooltip: "玩家停下头发时允许的正负角度误差" })
  successAngleTolerance = 8;

  @property({ tooltip: "看完广告后自动摆正头发的动画时间" })
  autoAlignDuration = 0.45;

  private rotating = true;
  private completed = false;
  private adInFlight = false;
  private loadingNextScene = false;
  private feedVisualEnabled = true;
  private feedInteractionEnabled = true;
  private feedAudioForeground = false;
  private feedAudioGestureRecovered = false;
  private feedInterstitialScheduled = false;
  private nextOpacity: UIOpacity | null = null;
  private hairController: FGUIController | null = null;
  private characterController: FGUIController | null = null;
  private firstHairController: FGUIController | null = null;
  private firstCharacterController: FGUIController | null = null;
  private backgroundController: FGUIController | null = null;
  private titleLabel: Label | null = null;
  private instructionLabel: Label | null = null;
  private instructionGraphics: Graphics | null = null;
  private remainingLevelIndexes: number[] = [];
  private usingFirstLevel = true;
  private settingsOpen = false;
  private resumeRotationAfterSettings = false;

  private get activeHairNode(): Node | null {
    const hair = this.usingFirstLevel ? this.firstHairNode : this.hairNode;
    return hair?.isValid ? hair : null;
  }

  protected onLoad(): void {
    this.enforceCharacterLayerLayout();
    this.hairController = this.hairNode?.getComponent(FGUIController) ?? null;
    this.characterController = this.node.getChildByName("characterNode")?.getComponent(FGUIController) ?? null;
    this.firstHairController = this.firstHairNode?.getComponent(FGUIController) ?? null;
    this.firstCharacterController = this.firstCharacterNode?.getComponent(FGUIController) ?? null;
    this.backgroundController = this.node.getChildByName("bg")?.getComponent(FGUIController) ?? null;
    this.createThemedCopy();
    adc.setBannerEnabled(false);
    this.node.on(Node.EventType.TOUCH_END, this.onScreenClicked, this);
    this.tipsBtn?.node?.on(Button.EventType.CLICK, this.onTipsClicked, this);
    this.nextBtn?.node?.on(Button.EventType.CLICK, this.onNextClicked, this);
    this.settingBtn?.node?.on(Button.EventType.CLICK, this.onSettingClicked, this);
    game.on(Game.EVENT_SHOW, this.onGameShow, this);
    game.on(Game.EVENT_HIDE, this.onGameHide, this);
  }

  /**
   * 人物纹理为了控制包体使用了较低的实际像素尺寸，因此固定人物的显示尺寸。
   * 头发的位置、缩放和 SpriteFrame 已交给 FGUIController 的各状态管理，
   * 这里不能再重置 hairNode，否则会覆盖编辑器中逐关调好的状态。
   */
  private enforceCharacterLayerLayout(): void {
    const character = this.node.getChildByName("characterNode");
    if (!character?.isValid) return;
    const characterSprite = character.getComponent(Sprite);
    if (characterSprite) characterSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    character.getComponent(UITransform)?.setContentSize(750, 1250);
    character.setPosition(0, -187, character.position.z);
    character.setScale(1, 1, 1);

    const background = this.node.getChildByName("bg");
    const backgroundSprite = background?.getComponent(Sprite) ?? null;
    if (backgroundSprite) {
      backgroundSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    }
  }

  protected start(): void {
    if (!SdkUtils.sdk) SdkUtils.requireSDK();
    AudioManager.setSoundEvent();
    FeedAcquisitionService.init();
    const isFeedDirectPlay = FeedAcquisitionService.isActive();
    // 普通入口可立即播放；推荐流处于隐藏预启动时不能提前 play，
    // 否则底层 onPlay 不回调会把后续音频操作队列卡住。
    if (!isFeedDirectPlay) {
      AudioManager.playMusic(soundName.getUserBgm);
    }

    if (this.nextBtn?.node) {
      this.nextBtn.node.active = false;
      this.nextBtn.interactable = false;
      this.nextOpacity = this.nextBtn.node.getComponent(UIOpacity) ?? this.nextBtn.node.addComponent(UIOpacity);
      this.nextOpacity.opacity = 0;
    }

    this.initializeLevelOrder();

    if (isFeedDirectPlay) {
      FeedAcquisitionService.addListener(this.onFeedStateChanged);
      this.node.on(Node.EventType.TOUCH_START, this.onFeedFallbackTouch, this, true);
      director.once(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
    }
  }

  protected update(deltaTime: number): void {
    const hair = this.activeHairNode;
    if (
      !hair ||
      !this.rotating ||
      this.completed ||
      this.adInFlight ||
      this.settingsOpen ||
      !this.feedVisualEnabled
    ) {
      return;
    }

    hair.angle = this.normalizeAngle(hair.angle - Math.max(0, this.rotationSpeed) * deltaTime);
  }

  private onScreenClicked(event: EventTouch): void {
    const target = event.target as Node | null;
    if (
      this.isNodeInside(target, this.tipsBtn?.node) ||
      this.isNodeInside(target, this.nextBtn?.node) ||
      this.isNodeInside(target, this.settingBtn?.node)
    ) {
      return;
    }

    this.activateFeedFromGesture();
    const hair = this.activeHairNode;
    if (
      !hair ||
      !this.feedInteractionEnabled ||
      !this.rotating ||
      this.completed ||
      this.adInFlight ||
      this.settingsOpen
    ) {
      return;
    }

    AudioManager.playEffect(soundName.getUserClick);
    this.rotating = false;
    const angleError = Math.abs(this.normalizeAngle(hair.angle));
    if (angleError <= Math.max(0, this.successAngleTolerance)) {
      this.alignHairAndComplete(0.18);
      return;
    }

    // 停顿一下让玩家看清当前角度，未命中时继续旋转，可立即再次尝试。
    this.scheduleOnce(this.resumeAfterMiss, 0.22);
  }

  private async onTipsClicked(): Promise<void> {
    this.activateFeedFromGesture();
    const feedState = FeedAcquisitionService.getState();
    this.feedInteractionEnabled = !feedState.active || (feedState.entered && !feedState.exited);
    if (
      !this.feedInteractionEnabled ||
      this.completed ||
      this.adInFlight ||
      this.settingsOpen ||
      !this.tipsBtn?.interactable
    ) {
      if (feedState.active && !this.feedInteractionEnabled) {
        this.showToast("请先点击继续游戏，再使用提示");
      }
      return;
    }

    this.adInFlight = true;
    this.rotating = false;
    this.tipsBtn.interactable = false;

    const rewarded = await SdkUtils.showRewardedVideo();
    if (!this.node?.isValid) return;

    this.adInFlight = false;
    if (!rewarded) {
      this.tipsBtn.interactable = true;
      this.rotating = true;
      this.showToast("完整看完视频即可自动摆正");
      return;
    }

    this.alignHairAndComplete(Math.max(0.1, this.autoAlignDuration));
  }

  private alignHairAndComplete(duration: number): void {
    const hair = this.activeHairNode;
    if (!hair || this.completed) return;

    this.rotating = false;
    this.unschedule(this.resumeAfterMiss);
    Tween.stopAllByTarget(hair);
    hair.angle = this.normalizeAngle(hair.angle);

    tween(hair)
      .to(duration, { angle: 0 }, { easing: "quadOut" })
      .call(() => {
        if (!hair.isValid || this.completed) return;
        hair.angle = 0;
        AudioManager.playEffect(soundName.hairSuccess);
        this.completeChallenge();
      })
      .start();
  }

  private completeChallenge(): void {
    if (this.completed) return;
    this.completed = true;
    this.rotating = false;

    if (this.tipsBtn?.node?.isValid) {
      // 通关后提示按钮仍保留；completed 会阻止它再次拉起广告。
      this.tipsBtn.node.active = true;
      this.tipsBtn.interactable = true;
    }

    const allLevelsCompleted = this.remainingLevelIndexes.length === 0;
    if (this.nextLabel?.node?.isValid) {
      this.nextLabel.string = allLevelsCompleted ? "返回主页" : "下一关";
    }

    // 十关全部完成后，才更新复访挑战的下一次就绪时间。
    if (allLevelsCompleted && FeedAcquisitionService.isRevisit()) {
      FeedRevisitService.scheduleNextImportantEvent(FeedAcquisitionService.getContentId());
    }

    this.showNextButton();
    this.requestNormalEntryInterstitial();
  }

  /**
   * 主页入口的 HairGame 在发型完成时尝试一次结果插屏。
   * 具体是否满 60 秒仍由 ADController 统一判断；推荐流入口完全跳过，
   * 延迟展示前也会再次校验，避免入口状态切换后误弹。
   */
  private requestNormalEntryInterstitial(): void {
    if (FeedAcquisitionService.isActive()) return;

    const completedLevel = HairGameScene.TOTAL_LEVELS - this.remainingLevelIndexes.length;
    adc.onLevelResult(completedLevel, "pass", {
      eligible: true,
      isStillValid: () =>
        !!this.node?.isValid && this.node.activeInHierarchy && !this.settingsOpen && !FeedAcquisitionService.isActive(),
    });
  }

  private showNextButton(): void {
    const node = this.nextBtn?.node;
    if (!node?.isValid) return;

    node.active = true;
    this.nextBtn.interactable = true;
    const opacity = this.nextOpacity ?? node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    this.nextOpacity = opacity;
    Tween.stopAllByTarget(opacity);
    opacity.opacity = 0;

    tween(opacity)
      .to(0.35, { opacity: 255 }, { easing: "quadOut" })
      .call(() => {
        if (!opacity.node?.isValid || this.loadingNextScene) return;
        tween(opacity)
          .repeatForever(
            tween(opacity)
              .to(0.65, { opacity: 185 }, { easing: "sineInOut" })
              .to(0.65, { opacity: 255 }, { easing: "sineInOut" }),
          )
          .start();
      })
      .start();
  }

  private onNextClicked(): void {
    if (!this.completed || this.loadingNextScene) return;

    if (this.remainingLevelIndexes.length > 0) {
      this.startNextLevel();
      return;
    }

    this.returnToMainScene();
  }

  private initializeLevelOrder(): void {
    const controller = this.hairController;
    if (!controller) {
      console.error("[HairGameScene] hairNode 缺少 FGUIController，无法切换头发关卡");
      this.remainingLevelIndexes = [];
      return;
    }

    const levelCount = Math.min(HairGameScene.TOTAL_LEVELS, controller.pages.length);
    // selectedIndex 0 已由 firstHair/firstCharacter 这组固定首关替代。
    this.remainingLevelIndexes = Array.from({ length: Math.max(0, levelCount - 1) }, (_, index) => index + 1);

    // Fisher-Yates 洗牌，固定首关完成后再随机玩 1～9，且不重复。
    for (let index = this.remainingLevelIndexes.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [this.remainingLevelIndexes[index], this.remainingLevelIndexes[randomIndex]] = [
        this.remainingLevelIndexes[randomIndex],
        this.remainingLevelIndexes[index],
      ];
    }

    this.startFirstLevel();
  }

  private startFirstLevel(): void {
    this.resetLevelPresentation();
    this.usingFirstLevel = true;

    this.firstHairController?.setSelectedIndex(0);
    this.firstCharacterController?.setSelectedIndex(0);
    this.backgroundController?.setSelectedIndex(HairGameScene.MALE_BACKGROUND_INDEX);
    this.applyCopyTheme(false);
    this.setThemedCopyVisible(false);

    if (this.hairNode?.isValid) this.hairNode.active = false;
    if (this.characterController?.node?.isValid) this.characterController.node.active = false;
    if (this.firstCharacterNode?.isValid) this.firstCharacterNode.active = true;
    if (this.firstHairNode?.isValid) {
      this.firstHairNode.active = true;
      this.firstHairNode.angle = this.normalizeAngle(this.firstHairNode.angle);
    }

    if (!this.firstHairNode?.isValid || !this.firstCharacterNode?.isValid) {
      console.error("[HairGameScene] 固定首关缺少 firstHairNode 或 firstCharacterNode 绑定");
      this.rotating = false;
      return;
    }

    this.rotating = true;
  }

  private startNextLevel(): void {
    const nextIndex = this.remainingLevelIndexes.pop();
    if (nextIndex === undefined) return;

    this.resetLevelPresentation();
    this.usingFirstLevel = false;
    if (this.firstHairNode?.isValid) this.firstHairNode.active = false;
    if (this.firstCharacterNode?.isValid) this.firstCharacterNode.active = false;

    this.applyLevelVisuals(nextIndex);
    this.setThemedCopyVisible(true);
    if (this.characterController?.node?.isValid) this.characterController.node.active = true;
    if (this.hairNode?.isValid) {
      this.hairNode.active = true;
      this.hairNode.angle = this.normalizeAngle(this.hairNode.angle);
    }
    this.rotating = true;
  }

  private resetLevelPresentation(): void {
    this.unschedule(this.resumeAfterMiss);
    if (this.hairNode?.isValid) Tween.stopAllByTarget(this.hairNode);
    if (this.firstHairNode?.isValid) Tween.stopAllByTarget(this.firstHairNode);
    if (this.nextOpacity?.isValid) {
      Tween.stopAllByTarget(this.nextOpacity);
      this.nextOpacity.opacity = 0;
    }

    if (this.nextBtn?.node?.isValid) {
      this.nextBtn.node.active = false;
      this.nextBtn.interactable = false;
    }
    if (this.tipsBtn?.node?.isValid) {
      this.tipsBtn.node.active = true;
      this.tipsBtn.interactable = true;
    }
    if (this.nextLabel?.node?.isValid) {
      this.nextLabel.string = "下一关";
    }

    this.completed = false;
    this.adInFlight = false;
    this.rotating = false;
  }

  private applyLevelVisuals(levelIndex: number): void {
    // hairNode 与 characterNode 共用同一个 selectedIndex。
    this.hairController?.setSelectedIndex(levelIndex);
    this.characterController?.setSelectedIndex(levelIndex);

    // 男性 0～4 使用 bg 状态 0；女性 5～9 使用 bg 状态 2。
    const backgroundIndex =
      levelIndex < HairGameScene.FIRST_FEMALE_LEVEL_INDEX
        ? HairGameScene.MALE_BACKGROUND_INDEX
        : HairGameScene.FEMALE_BACKGROUND_INDEX;
    this.backgroundController?.setSelectedIndex(backgroundIndex);
    this.applyCopyTheme(levelIndex >= HairGameScene.FIRST_FEMALE_LEVEL_INDEX);
  }

  private setThemedCopyVisible(visible: boolean): void {
    if (this.titleLabel?.node?.isValid) this.titleLabel.node.active = visible;
    if (this.instructionGraphics?.node?.isValid) this.instructionGraphics.node.active = visible;
  }

  private createThemedCopy(): void {
    const titleNode = new Node("HairGameTitle");
    titleNode.layer = this.node.layer;
    titleNode.parent = this.node;
    titleNode.addComponent(UITransform).setContentSize(590, 82);

    const titleLabel = titleNode.addComponent(Label);
    titleLabel.string = "99%的人都对不准";
    titleLabel.fontSize = 50;
    titleLabel.lineHeight = 62;
    titleLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
    titleLabel.verticalAlign = VerticalTextAlignment.CENTER;
    titleLabel.overflow = Label.Overflow.SHRINK;
    titleLabel.enableOutline = true;
    titleLabel.outlineWidth = 5;
    titleLabel.enableShadow = true;
    titleLabel.shadowOffset = new Vec2(3, -5);
    titleLabel.shadowBlur = 1;
    this.titleLabel = titleLabel;

    const titleWidget = titleNode.addComponent(Widget);
    titleWidget.isAlignTop = true;
    titleWidget.top = 88;
    titleWidget.isAlignHorizontalCenter = true;
    titleWidget.horizontalCenter = 0;
    titleWidget.updateAlignment();

    const instructionNode = new Node("HairGameInstruction");
    instructionNode.layer = this.node.layer;
    instructionNode.parent = this.node;
    instructionNode.addComponent(UITransform).setContentSize(510, 116);
    this.instructionGraphics = instructionNode.addComponent(Graphics);

    const instructionLabelNode = new Node("Label");
    instructionLabelNode.layer = this.node.layer;
    instructionLabelNode.parent = instructionNode;
    instructionLabelNode.addComponent(UITransform).setContentSize(460, 86);
    const instructionLabel = instructionLabelNode.addComponent(Label);
    instructionLabel.string = "点击发片，调整方向";
    instructionLabel.fontSize = 35;
    instructionLabel.lineHeight = 44;
    instructionLabel.color = Color.WHITE;
    instructionLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
    instructionLabel.verticalAlign = VerticalTextAlignment.CENTER;
    instructionLabel.overflow = Label.Overflow.SHRINK;
    instructionLabel.enableOutline = true;
    instructionLabel.outlineWidth = 2;
    instructionLabel.enableShadow = true;
    instructionLabel.shadowOffset = new Vec2(2, -3);
    instructionLabel.shadowBlur = 1;
    this.instructionLabel = instructionLabel;

    const instructionWidget = instructionNode.addComponent(Widget);
    instructionWidget.isAlignBottom = true;
    instructionWidget.bottom = 76;
    instructionWidget.isAlignHorizontalCenter = true;
    instructionWidget.horizontalCenter = 0;
    instructionWidget.updateAlignment();

    const initialIndex = this.characterController?.selectedIndex ?? 0;
    this.applyCopyTheme(initialIndex >= HairGameScene.FIRST_FEMALE_LEVEL_INDEX);
  }

  private applyCopyTheme(isFemale: boolean): void {
    const titleColor = isFemale ? new Color(255, 246, 251, 255) : new Color(240, 252, 255, 255);
    const mainColor = isFemale ? new Color(239, 126, 178, 248) : new Color(49, 146, 204, 248);
    const outlineColor = isFemale ? new Color(176, 62, 119, 255) : new Color(24, 103, 166, 255);
    const lightBorder = isFemale ? new Color(255, 210, 231, 255) : new Color(164, 226, 247, 255);
    const shadowColor = isFemale ? new Color(120, 40, 82, 210) : new Color(14, 63, 112, 210);

    if (this.titleLabel?.node?.isValid) {
      this.titleLabel.color = titleColor;
      this.titleLabel.outlineColor = outlineColor;
      this.titleLabel.shadowColor = shadowColor;
    }
    if (this.instructionLabel?.node?.isValid) {
      this.instructionLabel.outlineColor = outlineColor;
      this.instructionLabel.shadowColor = shadowColor;
    }

    const graphics = this.instructionGraphics;
    if (!graphics?.node?.isValid) return;
    graphics.clear();

    graphics.fillColor = shadowColor;
    graphics.roundRect(-245, -57, 490, 106, 38);
    graphics.fill();

    graphics.fillColor = mainColor;
    graphics.strokeColor = lightBorder;
    graphics.lineWidth = 3;
    graphics.roundRect(-245, -51, 490, 106, 38);
    graphics.fill();
    graphics.stroke();
  }

  private onSettingClicked(): void {
    if (this.settingsOpen || this.loadingNextScene || this.adInFlight) return;

    this.activateFeedFromGesture();
    const feedState = FeedAcquisitionService.getState();
    this.feedInteractionEnabled = !feedState.active || (feedState.entered && !feedState.exited);
    if (!this.feedInteractionEnabled) return;

    const manager = UIManager.instance;
    if (!manager) return;

    this.settingsOpen = true;
    this.resumeRotationAfterSettings = !this.completed;
    this.rotating = false;
    this.unschedule(this.resumeAfterMiss);

    const panel = manager.open(
      uiName.settingPanel,
      {
        enterType: 1,
        showBack: true,
        showRetry: false,
        onClose: () => this.finishSettingsPause(),
        onBack: () => {
          this.finishSettingsPause(false);
          this.returnToMainScene();
        },
        onMusicEnabled: () => AudioManager.playMusic(soundName.getUserBgm),
      },
      UILayer.Popup,
    );

    if (!panel) {
      this.finishSettingsPause();
    }
  }

  private finishSettingsPause(restoreGameState = true): void {
    if (!this.settingsOpen) return;

    this.settingsOpen = false;
    const shouldResume = restoreGameState && this.resumeRotationAfterSettings && !this.completed && !this.adInFlight;
    this.rotating = shouldResume;
    this.resumeRotationAfterSettings = false;
    PlayData.Instance.ispause = false;
  }

  private returnToMainScene(): void {
    if (this.loadingNextScene) return;
    this.loadingNextScene = true;
    if (this.nextBtn) this.nextBtn.interactable = false;
    if (this.settingBtn) this.settingBtn.interactable = false;

    if (this.nextOpacity?.isValid) Tween.stopAllByTarget(this.nextOpacity);
    this.finishFeedExperience();
    AudioManager.playDefaultBgm();
    void GameSceneBundle.loadScene(GameSceneName.Main).catch((err) => {
      console.error("[HairGameScene] 返回主页失败", err);
      this.loadingNextScene = false;
      if (this.nextBtn?.node?.isValid) this.nextBtn.interactable = true;
      if (this.settingBtn?.node?.isValid) this.settingBtn.interactable = true;
      if (!this.completed && this.feedVisualEnabled) this.rotating = true;
    });
  }

  private resumeAfterMiss(): void {
    if (!this.completed && !this.adInFlight && !this.settingsOpen) this.rotating = true;
  }

  private activateFeedFromGesture(): void {
    this.unschedule(this.retryFeedPreviewAudio);
    if (FeedAcquisitionService.isActive()) {
      FeedAcquisitionService.activateFromFirstTouch();
    }

    const state = FeedAcquisitionService.getState();
    if (!state.active || (state.entered && !state.exited)) {
      if (state.active && !this.feedAudioGestureRecovered) {
        this.feedAudioGestureRecovered = true;
        AudioManager.restartMusic(soundName.getUserBgm);
      } else {
        AudioManager.playMusic(soundName.getUserBgm);
      }
    }
  }

  private onFeedFallbackTouch(): void {
    this.activateFeedFromGesture();
  }

  private onFeedStateChanged = (state: FeedAcquisitionState): void => {
    // 推荐流预览态 entered=false、exited=false，此时也要让画面持续转动。
    // 只有真正滑出推荐流后才暂停视觉动画；点击和广告仍由下面的交互状态控制。
    this.feedVisualEnabled = !state.active || !state.exited;
    this.feedInteractionEnabled = !state.active || (state.entered && !state.exited);
    // entered=false/exited=false 是推荐流卡片预览态，此时也要播放音乐。
    // 隐藏预启动阶段先不调用 play；收到前台 show、feedEnter 或真实触摸后再启动。
    if (state.active && state.exited) {
      adc.cancelFeedEntryInterstitial();
      this.feedInterstitialScheduled = false;
      this.feedAudioForeground = false;
      this.feedAudioGestureRecovered = false;
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
      } else {
        AudioManager.playMusic(soundName.getUserBgm);
      }
    }
  };

  private onGameShow = (): void => {
    this.unschedule(this.retryFeedPreviewAudio);
    const state = FeedAcquisitionService.getState();
    if (!state.active) {
      AudioManager.playMusic(soundName.getUserBgm);
      return;
    }
    if (state.exited) return;

    // 推荐流卡片从后台预启动切到前台展示时，强制绕过可能卡住的旧播放器。
    this.feedAudioForeground = true;
    AudioManager.restartMusic(soundName.getUserBgm);
  };

  private onGameHide = (): void => {
    if (!FeedAcquisitionService.isActive()) return;
    this.feedAudioForeground = false;
    AudioManager.pauseBgmForVideo();
  };

  private reportFeedSceneReady(): void {
    if (this.node?.isValid && FeedAcquisitionService.isActive()) {
      FeedAcquisitionService.reportSceneReady();
      // 测试容器有时先展示卡片、后派发 show。场景上报后补一次干净播放器启动；
      // 若此时仍在后台，后续 show/首次触摸还会再次重建，不会继续卡在旧队列。
      this.unschedule(this.retryFeedPreviewAudio);
      this.scheduleOnce(this.retryFeedPreviewAudio, 0.35);
    }
  }

  private retryFeedPreviewAudio(): void {
    const state = FeedAcquisitionService.getState();
    if (!this.node?.isValid || !state.active || state.exited) return;
    AudioManager.restartMusic(soundName.getUserBgm);
  }

  private finishFeedExperience(): void {
    adc.cancelFeedEntryInterstitial();
    director.off(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
    if (this.node?.isValid) {
      this.node.off(Node.EventType.TOUCH_START, this.onFeedFallbackTouch, this, true);
    }
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    FeedAcquisitionService.completeSession();
  }

  private normalizeAngle(angle: number): number {
    const normalized = ((((angle + 180) % 360) + 360) % 360) - 180;
    return normalized === -180 ? 180 : normalized;
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

  private showToast(title: string): void {
    try {
      const api = typeof tt !== "undefined" ? tt : null;
      if (typeof api?.showToast === "function") {
        api.showToast({ title, icon: "none" });
      } else {
        console.log(`[HairGameScene] ${title}`);
      }
    } catch {
      console.log(`[HairGameScene] ${title}`);
    }
  }

  protected onDestroy(): void {
    adc.cancelFeedEntryInterstitial();
    this.unschedule(this.resumeAfterMiss);
    this.unschedule(this.retryFeedPreviewAudio);
    game.off(Game.EVENT_SHOW, this.onGameShow, this);
    game.off(Game.EVENT_HIDE, this.onGameHide, this);

    // 不要在 onDestroy 中对场景节点调用 off。Cocos 销毁场景时可能已经
    // 清空 Node 内部的 EventProcessor，此时即使 node.isValid 仍然为 true，
    // Node.off 也会因内部对象为 null 而报错。节点销毁会自动清理这些监听。
    director.off(Director.EVENT_END_FRAME, this.reportFeedSceneReady, this);
    FeedAcquisitionService.removeListener(this.onFeedStateChanged);
    if (this.hairNode?.isValid) Tween.stopAllByTarget(this.hairNode);
    if (this.firstHairNode?.isValid) Tween.stopAllByTarget(this.firstHairNode);
    if (this.nextOpacity?.isValid) Tween.stopAllByTarget(this.nextOpacity);
  }
}
