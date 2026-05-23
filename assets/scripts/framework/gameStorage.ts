// /**
//  * 游戏存档 和storage一样 存储数据
//  */

import { sys } from 'cc';
export default class gameStorage{
//    /**
//     * 离线时间
//     */
     static setoffLineTime(){
        const _time = new Date().getTime()
        sys.localStorage.setItem('logintime', String(_time))
    }
    static getoffLineTime(){
        const v = sys.localStorage.getItem('logintime')
        return v ? Number(v) : 0
    }



//    /**
//     * 音乐
//     * @param t 
//     */
    static setMusic(t:number) {
        sys.localStorage.setItem("music", String(t))
    }
    static getMusic() {
        const v = sys.localStorage.getItem("music")
        return v ? Number(v) : 0
    }
//    /**
//     * 音效
//     * @param t 
//     */
    static setSound(t:number) {
        sys.localStorage.setItem("sound", String(t))
    }
    static getSound() {
        const v = sys.localStorage.getItem("sound")
        return v ? Number(v) : 0
    }
    static setzhendong(t:number) {
        sys.localStorage.setItem("zhendong", String(t))
    }
    static getzhendong() {
        const v = sys.localStorage.getItem("zhendong")
        if(!v){
            this.setzhendong(0)
            return 0
        }
        return Number(v)
    }
}



