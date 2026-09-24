import { assetManager, AssetManager, director, SceneAsset } from "cc";
import { ResourceManager } from "./ResourceManager";

export const GAME_SCENE_BUNDLE = "gamescene";

export enum GameSceneName {
  /** 当前正式主界面。 */
  Main = "NewMainScene",
  Game = "GameScene",
  ShootingGlassBottles = "ShootingGlassBottlesGame",
  JuggleBallGame = "JuggleBallGameScene",
  PenguinStackFeedGame = "PenguinStackFeedGameScene",
  FoodDeliveryFeedGame = "FoodDeliveryFeedGameScene",
  WhiteGooseFeedGame = "WhiteGooseFeedGameScene",
  RhythmCatFeedGame = "RhythmCatFeedGameScene",
  MathExamFeedGame = "MathExamFeedGameScene",
  MotoRaceGame = "MotoRaceGameScene",
}

const GAME_SCENE_UUIDS: Record<GameSceneName, string> = {
  [GameSceneName.Main]: "e2f66be5-60ce-4ebc-90a4-d99841dd2b9a",
  [GameSceneName.Game]: "f1b4dce3-df3d-4fdd-b734-66899ef83623",
  [GameSceneName.ShootingGlassBottles]: "5b031fbc-c698-4add-ae79-f39a1cfa3b8c",
  [GameSceneName.JuggleBallGame]: "222c590e-82b2-4778-b62d-acf4b3829c0b",
  [GameSceneName.PenguinStackFeedGame]: "85cdd217-919a-5695-a19b-1a2d0618addf",
  [GameSceneName.FoodDeliveryFeedGame]: "fccc8a6c-9bab-5757-a411-a8bf4c40935b",
  [GameSceneName.WhiteGooseFeedGame]: "ba4c8390-ece1-56f3-ae54-585950e78599",
  [GameSceneName.RhythmCatFeedGame]: "e7a3d090-ab08-59ac-a467-33ebbc65a924",
  [GameSceneName.MathExamFeedGame]: "16cb5b67-1cc4-5e8f-a42e-1af87bf65a0e",
  [GameSceneName.MotoRaceGame]: "5191a270-00d4-5c42-a314-03ba4068deda",
};

/**
 * 主界面和玩法场景位于独立 Asset Bundle，不能再使用 director.loadScene。
 */
export class GameSceneBundle {
  private static loadingScene = false;
  private static sceneLaunchPending = false;

  public static get isLoadingScene(): boolean {
    return this.loadingScene || this.sceneLaunchPending;
  }

  public static async preload(): Promise<void> {
    await ResourceManager.ins.loadBundle(GAME_SCENE_BUNDLE);
  }

  public static async loadScene(sceneName: GameSceneName): Promise<void> {
    if (this.isLoadingScene) return;
    this.loadingScene = true;

    try {
      let bundle = await ResourceManager.ins.loadBundle(GAME_SCENE_BUNDLE);
      let hasReloadedBundle = false;

      if (!bundle.getSceneInfo(sceneName)) {
        bundle = await this.reloadBundle();
        hasReloadedBundle = true;
      }

      let scene: SceneAsset;
      if (!bundle.getSceneInfo(sceneName)) {
        scene = await this.loadSceneByUuid(sceneName);
      } else {
        try {
          scene = await this.loadSceneFromBundle(bundle, sceneName);
        } catch (err) {
          if (!this.isMissingSceneError(err)) throw err;

          if (!hasReloadedBundle) {
            bundle = await this.reloadBundle();
            hasReloadedBundle = true;
          }

          if (!bundle.getSceneInfo(sceneName)) {
            scene = await this.loadSceneByUuid(sceneName);
          } else {
            try {
              scene = await this.loadSceneFromBundle(bundle, sceneName);
            } catch (retryErr) {
              if (!this.isMissingSceneError(retryErr)) throw retryErr;
              scene = await this.loadSceneByUuid(sceneName);
            }
          }
        }
      }

      // 仅标记下一帧的场景提交，不等待场景回调、不暂停引擎。
      this.sceneLaunchPending = true;
      try {
        director.runScene(scene, undefined, () => { this.sceneLaunchPending = false; });
      } catch (err) {
        this.sceneLaunchPending = false;
        throw err;
      }
    } finally {
      this.loadingScene = false;
    }
  }

  private static loadSceneFromBundle(
    bundle: AssetManager.Bundle,
    sceneName: GameSceneName,
  ): Promise<SceneAsset> {
    return new Promise<SceneAsset>((resolve, reject) => {
      bundle.loadScene(sceneName, (err, sceneAsset) => {
        if (err || !sceneAsset) {
          reject(
            err ??
              new Error(
                `加载场景失败: ${GAME_SCENE_BUNDLE}/${sceneName}`,
              ),
          );
          return;
        }
        resolve(sceneAsset);
      });
    });
  }

  private static async reloadBundle(): Promise<AssetManager.Bundle> {
    ResourceManager.ins.removeBundle(GAME_SCENE_BUNDLE);

    // ResourceManager normally removes this instance too. Clear any remaining
    // AssetManager copy so a fresh bundle config is fetched on the retry.
    const staleBundle = assetManager.getBundle(GAME_SCENE_BUNDLE);
    if (staleBundle) {
      assetManager.removeBundle(staleBundle);
    }

    return ResourceManager.ins.loadBundle(GAME_SCENE_BUNDLE);
  }

  private static loadSceneByUuid(
    sceneName: GameSceneName,
  ): Promise<SceneAsset> {
    const uuid = GAME_SCENE_UUIDS[sceneName];

    return new Promise<SceneAsset>((resolve, reject) => {
      assetManager.loadAny(
        { uuid, bundle: GAME_SCENE_BUNDLE },
        { preset: "scene" },
        (err, asset) => {
          const sceneAsset = asset as SceneAsset | null;
          if (err || !sceneAsset) {
            reject(
              err ??
                new Error(
                  `加载场景失败: ${GAME_SCENE_BUNDLE}/${sceneName} (${uuid})`,
                ),
            );
            return;
          }

          if (!sceneAsset.scene) {
            reject(new Error(`The asset ${uuid} is not a scene`));
            return;
          }

          // Match the scene metadata initialization performed by Bundle.loadScene.
          // Scene.id exists at runtime (Bundle.loadScene writes it as well), but
          // Creator 3.8.5 does not expose that internal field in the public type.
          (sceneAsset.scene as any).id = sceneAsset.uuid;
          sceneAsset.scene.name = sceneAsset.name;
          resolve(sceneAsset);
        },
      );
    });
  }

  private static isMissingSceneError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err ?? "");
    return message.includes("doesn't contain scene");
  }
}
