import {
  assetManager,
  Asset,
  AssetManager,
  AudioClip,
  ImageAsset,
  JsonAsset,
  SpriteFrame,
  Texture2D,
} from "cc";

export class ResourceManager {
  private static _ins: ResourceManager | null = null;

  public static get ins(): ResourceManager {
    if (!this._ins) {
      this._ins = new ResourceManager();
    }
    return this._ins;
  }

  /** 已加载 bundle 缓存 */
  private _bundleMap: Map<string, AssetManager.Bundle> = new Map();

  private constructor() {}

  // =========================================================
  // bundle
  // =========================================================

  /**
   * 加载 bundle
   * @param bundleName 缓存名/逻辑名
   * @param remoteUrl 远程模式下可传完整 bundle url；本地模式可不传
   * @param version 可选版本号
   */
  public async loadBundle(
    bundleName: string,
    remoteUrl?: string,
    version?: string,
  ): Promise<AssetManager.Bundle> {
    const cache = this._bundleMap.get(bundleName);
    if (cache) {
      return cache;
    }

    const target = remoteUrl || bundleName;
    const options: Record<string, any> = {};

    if (version) {
      options.version = version;
    }

    return new Promise<AssetManager.Bundle>((resolve, reject) => {
      assetManager.loadBundle(target, options, (err, bundle) => {
        if (err || !bundle) {
          reject(err ?? new Error(`loadBundle failed: ${target}`));
          return;
        }

        this._bundleMap.set(bundleName, bundle);
        resolve(bundle);
      });
    });
  }

  /**
   * 获取已缓存的 bundle
   */
  public getBundle(bundleName: string): AssetManager.Bundle | null {
    return (
      this._bundleMap.get(bundleName) || assetManager.getBundle(bundleName)
    );
  }

  /**
   * 是否已加载 bundle
   */
  public hasBundle(bundleName: string): boolean {
    return !!this.getBundle(bundleName);
  }

  /**
   * 移除 bundle 缓存
   * 注意：不会自动帮你释放所有业务引用中的资源
   */
  public removeBundle(bundleName: string): void {
    const bundle = this.getBundle(bundleName);
    if (!bundle) {
      return;
    }

    assetManager.removeBundle(bundle);
    this._bundleMap.delete(bundleName);
  }

  /**
   * 清空所有 bundle 缓存记录
   */
  public clearBundleCache(): void {
    this._bundleMap.clear();
  }

  // =========================================================
  // bundle asset load
  // =========================================================

  /**
   * 加载 bundle 内单个资源
   */
  public async loadBundleAsset<T extends Asset>(
    bundleName: string,
    path: string,
    type: new (...args: any[]) => T,
    remoteUrl?: string,
    version?: string,
  ): Promise<T> {
    const bundle = await this.loadBundle(bundleName, remoteUrl, version);

    return new Promise<T>((resolve, reject) => {
      bundle.load(path, type, (err, asset) => {
        if (err || !asset) {
          reject(err ?? new Error(`load asset failed: ${bundleName}/${path}`));
          return;
        }
        resolve(asset as T);
      });
    });
  }

  public loadAssetByUuid<T extends Asset>(uuid: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      assetManager.loadAny<T>(uuid, (err, asset) => {
        if (err || !asset) {
          reject(err ?? new Error(`load asset by uuid failed: ${uuid}`));
          return;
        }
        resolve(asset);
      });
    });
  }

  /**
   * 预加载 bundle 内单个资源
   */
  public async preloadBundleAsset<T extends Asset>(
    bundleName: string,
    path: string,
    type: new (...args: any[]) => T,
    remoteUrl?: string,
    version?: string,
  ): Promise<void> {
    const bundle = await this.loadBundle(bundleName, remoteUrl, version);

    return new Promise<void>((resolve, reject) => {
      bundle.preload(path, type, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * 加载 bundle 内整个目录
   */
  public async loadBundleDir<T extends Asset>(
    bundleName: string,
    dir: string,
    type?: new (...args: any[]) => T,
    remoteUrl?: string,
    version?: string,
  ): Promise<T[]> {
    const bundle = await this.loadBundle(bundleName, remoteUrl, version);

    return new Promise<T[]>((resolve, reject) => {
      bundle.loadDir(dir, type as any, (err, assets) => {
        if (err || !assets) {
          reject(err ?? new Error(`loadDir failed: ${bundleName}/${dir}`));
          return;
        }
        resolve(assets as T[]);
      });
    });
  }

  /**
   * 预加载 bundle 内整个目录
   */
  public async preloadBundleDir<T extends Asset>(
    bundleName: string,
    dir: string,
    type?: new (...args: any[]) => T,
    remoteUrl?: string,
    version?: string,
  ): Promise<void> {
    const bundle = await this.loadBundle(bundleName, remoteUrl, version);

    return new Promise<void>((resolve, reject) => {
      bundle.preloadDir(dir, type as any, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * 加载 bundle 内 json
   * path 不带 .json
   */
  public async loadBundleJson<T = any>(
    bundleName: string,
    path: string,
    remoteUrl?: string,
    version?: string,
  ): Promise<T> {
    const jsonAsset = await this.loadBundleAsset(
      bundleName,
      path,
      JsonAsset,
      remoteUrl,
      version,
    );
    return jsonAsset.json as T;
  }

  // =========================================================
  // remote
  // =========================================================

  /**
   * 远程加载文本
   * 用 XHR，避免 loadRemote<string> 的泛型约束问题
   */
  public loadRemoteText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);

      xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4) {
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.responseText);
        } else {
          reject(new Error(`request failed: ${url}, status=${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error(`request error: ${url}`));
      };

      xhr.send();
    });
  }

  /**
   * 远程加载 json
   */
  public async loadRemoteJson<T = any>(url: string): Promise<T> {
    const text = await this.loadRemoteText(url);
    return JSON.parse(text) as T;
  }

  /**
   * 远程加载图片并转 SpriteFrame
   * @param url 完整图片地址
   * @param ext 如果 url 没后缀，可手动传，比如 ".png"
   */
  public loadRemoteSpriteFrame(
    url: string,
    ext?: string,
  ): Promise<SpriteFrame> {
    return new Promise((resolve, reject) => {
      const options = ext ? { ext } : undefined;

      assetManager.loadRemote<ImageAsset>(
        url,
        options as any,
        (err, imageAsset) => {
          if (err || !imageAsset) {
            reject(err ?? new Error(`load remote image failed: ${url}`));
            return;
          }

          const texture = new Texture2D();
          texture.image = imageAsset;

          const spriteFrame = new SpriteFrame();
          spriteFrame.texture = texture;

          resolve(spriteFrame);
        },
      );
    });
  }

  /**
   * 远程加载 Texture2D
   */
  public loadRemoteTexture(url: string, ext?: string): Promise<Texture2D> {
    return new Promise((resolve, reject) => {
      const options = ext ? { ext } : undefined;

      assetManager.loadRemote<ImageAsset>(
        url,
        options as any,
        (err, imageAsset) => {
          if (err || !imageAsset) {
            reject(err ?? new Error(`load remote texture failed: ${url}`));
            return;
          }

          const texture = new Texture2D();
          texture.image = imageAsset;
          resolve(texture);
        },
      );
    });
  }

  /**
   * 远程加载音频
   */
  public loadRemoteAudio(url: string): Promise<AudioClip> {
    return new Promise((resolve, reject) => {
      assetManager.loadRemote<AudioClip>(url, (err, clip) => {
        if (err || !clip) {
          reject(err ?? new Error(`load remote audio failed: ${url}`));
          return;
        }
        resolve(clip);
      });
    });
  }

  // =========================================================
  // release
  // =========================================================

  /**
   * 释放单个资源实例
   */
  public releaseAsset(asset: Asset | null | undefined): void {
    if (!asset) {
      return;
    }
    assetManager.releaseAsset(asset);
  }

  /**
   * 按 bundle 路径释放资源
   */
  public releaseBundleAsset<T extends Asset>(
    bundleName: string,
    path: string,
    type?: new (...args: any[]) => T,
  ): void {
    const bundle = this.getBundle(bundleName);
    if (!bundle) {
      return;
    }
    bundle.release(path, type as any);
  }
}
