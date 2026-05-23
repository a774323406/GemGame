export default class PlayData {
  public static _instance: PlayData = null;
  public static get Instance() {
    if (this._instance == null) {
      this._instance = new PlayData();
    }
    return this._instance;
  }
  ispause = false;
}

export enum EventName {
  Video_sound_changed = "Video_sound_changed",
}
