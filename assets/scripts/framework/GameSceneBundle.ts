import { director, SceneAsset } from "cc";
import { ResourceManager } from "./ResourceManager";

export const GAME_SCENE_BUNDLE = "gamescene";

export enum GameSceneName {
  Main = "MainScene",
  Game = "GameScene",
}

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
      const bundle = await ResourceManager.ins.loadBundle(GAME_SCENE_BUNDLE);
      const scene = await new Promise<SceneAsset>((resolve, reject) => {
        bundle.loadScene(sceneName, (err, sceneAsset) => {
          if (err || !sceneAsset) {
            reject(err ?? new Error(`加载场景失败: ${GAME_SCENE_BUNDLE}/${sceneName}`));
            return;
          }
          resolve(sceneAsset);
        });
      });

      director.runScene(scene);
    } finally {
      this.loadingScene = false;
    }
  }
}
