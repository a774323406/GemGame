import crypto from 'node:crypto';
export const uuid=name=>{const h=crypto.createHash('sha256').update('GemGame/ropeDuck/'+name).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export const SCENE_UUID=uuid('RopeDuckFeedGameScene');
