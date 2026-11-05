/** Visual timing shared with the round, so every counted brick has time to visibly split. */
export const CHOP_CONTACT_TIME = .25;
export const CHOP_HIT_STOP = .045;
export const CHOP_LAYER_TIME = .045;
export function brickSplitTime(order: number): number {
  return CHOP_CONTACT_TIME + (order > 0 ? CHOP_HIT_STOP + order * CHOP_LAYER_TIME : 0);
}
export function chopEndTime(hit: number): number {
  return brickSplitTime(Math.max(0, hit - 1)) + .38;
}
export function visibleSplitCount(age: number, hit: number): number {
  let count = 0;
  for (let i = 0; i < hit; i++) if (age + 1e-8 >= brickSplitTime(i)) count++;
  return count;
}
export function chopHandPose(age: number, hit: number, homeY: number, contactY: number) {
  const last = brickSplitTime(Math.max(0, hit - 1));
  const depth = Math.max(0, hit - 1) * 34;
  let y = homeY, angle = 0, x = 420;
  if (age < .1) {
    const t = age / .1; y += 42 * Math.sin(t * Math.PI / 2); angle = 12 * t; x += 10 * t;
  } else if (age < CHOP_CONTACT_TIME) {
    const t = (age - .1) / (CHOP_CONTACT_TIME - .1), eased = t * t * t;
    y = homeY + 42 + (contactY - homeY - 42) * eased;
    angle = 12 - 20 * eased; x = 430 - 60 * eased;
  } else if (age < last + .08) {
    const t = Math.max(0, Math.min(1, (age - CHOP_CONTACT_TIME - CHOP_HIT_STOP) / Math.max(CHOP_LAYER_TIME, last - CHOP_CONTACT_TIME - CHOP_HIT_STOP)));
    y = contactY - depth * t; x = 370; angle = -8;
  } else {
    const t = Math.min(1, (age - last - .08) / .3), eased = 1 - Math.pow(1 - t, 3);
    y = contactY - depth + (homeY - contactY + depth) * eased;
    x = 370 + 50 * eased; angle = -8 * (1 - eased);
  }
  return {x,y,angle};
}
