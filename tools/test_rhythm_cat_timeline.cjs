const assert=require('node:assert/strict');const {loadTs}=require('./rhythm_cat_test_helpers.cjs');const {RhythmCatTimeline}=loadTs('assets/scripts/rhythmCatTimeline.ts');
let playing=false,pos=0,plays=0;const a={play(){plays++;playing=true;},pause(){playing=false},stop(){playing=false;pos=0},seek(t){pos=t},position(){return pos},playing(){return playing}};
let t=new RhythmCatTimeline(a,32);assert(t.start(true));t.tick(1);t.setPaused('background',true);t.setPaused('advert',true);t.tick(10);assert.equal(t.time,.85);t.setPaused('background',false);t.tick(10);assert.equal(t.time,.85);t.setPaused('advert',false);t.tick(.1);assert(Math.abs(t.time-.935)<1e-6);t.reset();assert.equal(t.time,0);assert(!t.started);
t.start(false);t.tick(.1);const before=t.time;pos=-10;t.tick(.1);assert(t.time>=before);pos=30;t.tick(.1);assert(t.time<1);t.tick(NaN);assert(Number.isFinite(t.time));
const bad={...a,play(){throw Error('locked')}};t=new RhythmCatTimeline(bad,32);assert(!t.start(false));t.tick(5);assert.equal(t.time,0);assert(t.awaitingGesture);
t=new RhythmCatTimeline({...a,play(){},playing(){return false}},32);t.start(false);t.tick(.6);assert.equal(t.time,0);assert(t.awaitingGesture);console.log('rhythm cat timeline passed');

// Rates are relative to the original: 85% normally, 70% after the reward.
t=new RhythmCatTimeline(a,32);t.start(true);t.tick(2);t.setPaused('reward',true);t.setRate(.7);
assert.equal(t.time,1.7);t.tick(20);assert.equal(t.time,1.7);t.setPaused('background',true);t.setPaused('reward',false);
t.tick(20);assert.equal(t.time,1.7);t.setPaused('background',false);t.tick(4);assert.equal(t.time,4.5);
t.reset();assert.equal(t.rate,.85);assert.equal(t.time,0);t.start(true);t.tick(1);assert.equal(t.time,.85);
for(const badRate of [NaN,0,-1,Infinity,2]){t.setRate(badRate);assert.equal(t.rate,.85);}
// Audio positions are expressed in chart seconds by the scene's audio adapter.
t=new RhythmCatTimeline(a,32);t.setRate(.7);t.start(false);pos=.7;t.tick(1);assert.equal(t.time,.7);
t.setPaused('reward',true);t.reset();assert(!t.paused,'replay clears an obsolete ad request');
console.log('rhythm cat slow clock, mute, nested pause and replay passed');
