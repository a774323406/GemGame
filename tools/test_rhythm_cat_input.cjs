const assert=require('node:assert/strict');const {loadTs}=require('./rhythm_cat_test_helpers.cjs');const {RhythmCatInput}=loadTs('assets/scripts/rhythmCatInput.ts');
const c=new RhythmCatInput();assert(c.begin(1,.2,false));assert(c.begin(2,.8,false));assert.equal(c.begin(1,.1,false),false);assert.equal(c.begin(3,.1,false),false);
const white=c.positions[1];c.move(1,.9);assert.equal(c.positions[1],white);assert(c.positions[0]<=.85);c.move(2,.7);assert(c.positions[1]<white);c.end(1);assert(c.begin(1,.1,false));c.clear();assert(c.begin(2,.8,false));assert.equal(c.begin(3,.1,true),false);c.move(2,NaN);assert(Number.isFinite(c.positions[1]));console.log('rhythm cat input passed');

// Overshooting either edge must not create dead travel when reversing direction.
for(const side of [0,1]){
  const input=new RhythmCatInput();input.sensitivity=1.1;
  const start=side===0?.2:.8;input.begin(1,start,false);
  input.move(1,start+1);assert.equal(input.positions[side],.85);
  input.move(1,start+.98);assert(Math.abs(input.positions[side]-(.85-.044))<1e-9,'reverse immediately from right edge');
  input.move(1,start-1);assert.equal(input.positions[side],.15);
  input.move(1,start-.98);assert(Math.abs(input.positions[side]-(.15+.044))<1e-9,'reverse immediately from left edge');
  const before=input.positions[side];input.move(1,start-.98);assert.equal(input.positions[side],before,'duplicate move is inert');
}
console.log('rhythm cat boundary reversal and drag sensitivity passed');
