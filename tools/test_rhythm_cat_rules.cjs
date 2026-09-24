const assert=require('node:assert/strict');const {loadTs}=require('./rhythm_cat_test_helpers.cjs');
const {RhythmCatRound}=loadTs('assets/scripts/rhythmCatRules.ts');
const pose=x=>[{x,radius:.13},{x:.5,radius:.13}];const note=(id,t,x=.25,side=0)=>({id,hitTime:t,x,side,kind:'brown-pop'});
let r=new RhythmCatRound([note(0,0),note(1,1),note(2,2)],2);r.start();
assert.equal(r.advance(0,pose(.25),pose(.25)).length,1);r.advance(1.1,pose(.25),pose(.25));assert.equal(r.score,2);assert.equal(r.advance(1.1,pose(.25),pose(.25)).length,0);r.advance(2,pose(.25),pose(.25));assert.equal(r.status,'success');
r=new RhythmCatRound([note(1,.1),note(2,.2),note(3,1),note(4,1.1)],1.2);r.start();r.advance(2,pose(.9),pose(.9));assert.equal(r.lives,0);assert.equal(r.status,'failed');assert.equal(r.advance(3,pose(.9),pose(.9)).length,0);
r.reset();assert.equal(r.score,0);assert.equal(r.lives,3);assert.equal(r.status,'ready');r.start();r.advance(NaN,pose(0),pose(0));assert.equal(r.time,0);
// Same linear gesture scores identically across ordinary and delayed frames.
for(const step of [1/60,1/30,.3]){const notes=[note(1,.2,.2),note(2,.5,.5),note(3,.8,.8)];r=new RhythmCatRound(notes,1);r.start();for(let t=0;t<1;t+=step)r.advance(Math.min(1,t+step),pose(t),pose(Math.min(1,t+step)));assert.equal(r.score,3);}
r=new RhythmCatRound([note(1,.2),note(2,.3),note(3,1)],1);r.start();r.advance(1,pose(.9),pose(.9));assert.equal(r.status,'failed');
console.log('rhythm cat rules passed');

r=new RhythmCatRound([note(1,1,.1),note(2,1,.5,1)],2);r.start();r.lives=1;r.advance(1,pose(.8),pose(.8));assert.equal(r.score,1,'simultaneous other-side catch must still count on final life');assert.equal(r.status,'failed');

// A slightly late swipe can rescue food; expired food still costs exactly one life.
r=new RhythmCatRound([note(1,1)],2,.1);r.start();
assert.equal(r.advance(1.04,pose(.8),pose(.8)).length,0);assert.equal(r.lives,3);
assert.equal(r.isResolved(1),false);
assert.equal(r.advance(1.09,pose(.8),pose(.25))[0].caught,true);assert.equal(r.score,1);
assert.equal(r.isResolved(1),true);assert.equal(r.advance(1.2,pose(.25),pose(.25)).length,0);
r.reset();assert.equal(r.isResolved(1),false);r.start();r.advance(1.11,pose(.8),pose(.8));
assert.equal(r.lives,2);assert.equal(r.score,0);assert.equal(r.advance(1.2,pose(.25),pose(.25)).length,0);
assert.equal(r.advance(1.1,pose(.25),pose(.25)).length,0,'backward clock ignored');

// A pending black note cannot block a newer white catch or borrow the white position.
r=new RhythmCatRound([note(1,1,.5),note(2,1.04,.5,1)],2,.1);r.start();
let judgments=r.advance(1.05,pose(.9),pose(.9));
assert.equal(judgments.length,1);assert.equal(judgments[0].note.id,2);assert.equal(r.lives,3);
r.advance(1.1,pose(.9),pose(.9));assert.equal(r.lives,2);assert.equal(r.score,1);

// Swept overlap is consistent even when a whole catch window falls in one frame.
for(const step of [1/60,1/30,.3]){
  r=new RhythmCatRound([note(1,.2,.35)],1,.1);r.start();
  for(let t=0;t<1;t+=step)r.advance(Math.min(1,t+step),pose(t),pose(Math.min(1,t+step)));
  assert.equal(r.score,1);assert.equal(r.lives,3);
}
for(const x of [.05,.6]){
  r=new RhythmCatRound([note(1,.3,x)],1,.1);r.start();
  r.advance(1,pose(0),pose(1));assert.equal(r.score,0,'crossing before/after window cannot catch');assert.equal(r.lives,2);
}

// Final-life events use judgment time, including simultaneous catches and misses.
r=new RhythmCatRound([note(1,1,.1),note(2,1.1,.5,1),note(3,1.2,.5,1)],2,.1);r.start();r.lives=1;
judgments=r.advance(1.3,pose(.9),pose(.9));assert.equal(r.status,'failed');assert.equal(r.score,1);assert.equal(judgments.length,2);
// All pending notes resolve by the end of the song, including the final heart.
r=new RhythmCatRound([note(1,.98)],1,.1);r.start();r.lives=1;
r.advance(1,pose(.9),pose(.9));assert.equal(r.status,'failed');assert(r.isResolved(1));
r=new RhythmCatRound([note(1,.98)],1,.1);r.start();
r.advance(1,pose(.25),pose(.25));assert.equal(r.status,'success');assert.equal(r.score,1);
console.log('rhythm cat late catches, independent windows, swept overlap and final-life ordering passed');
