import { assetManager, AssetManager, director, SceneAsset } from "cc";
import { ResourceManager } from "./ResourceManager";

export const GAME_SCENE_BUNDLE = "gamescene";

export enum GameSceneName {
  Main = "MainScene",
  Game = "GameScene",
}

const GAME_SCENE_UUIDS: Record<GameSceneName, string> = {
  [GameSceneName.Main]: "855395d1-7838-47e0-bb59-2ae3e155eecc",
  [GameSceneName.Game]: "f1b4dce3-df3d-4fdd-b734-66899ef83623",
};

/**
 * MainScene 和 GameScene 位于独立 Asset Bundle，不能再使用 director.loadScene。
 */
export class GameSceneBundle {
  private static loadingScene = false;

  public static async preload(): Promise<void> {
    await ResourceManager.ins.loadBundle(GAME_SCENE_BUNDLE);
  }

  public static async loadScene(sceneName: GameSceneName): Promise<void> {
    if (this.loadingScene) return;
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

      director.runScene(scene);
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
