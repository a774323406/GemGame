import type { CatSide } from './rhythmCatChart';
/** Pointer ownership persists when a finger crosses the center divider. */
export class RhythmCatInput {
  initial: [number,number] = [0.25,0.35];
  positions: [number,number] = [...this.initial];
  bounds: [[number,number],[number,number]] = [[.15,.85],[.15,.85]];
  sensitivity = 1;
  private touches = new Map<number,{side:CatSide; lastX:number}>();
  begin(id:number, screenX:number, blocked:boolean): boolean {
    if(blocked || !Number.isFinite(screenX) || this.touches.has(id)) return false;
    const side:CatSide=screenX<.5?0:1;
    if([...this.touches.values()].some(t=>t.side===side)) return false;
    this.touches.set(id,{side,lastX:screenX});return true;
  }
  move(id:number,screenX:number): void {
    const t=this.touches.get(id);if(!t || !Number.isFinite(screenX))return;
    const x=this.positions[t.side]+2*(screenX-t.lastX)*this.sensitivity;
    this.positions[t.side]=Math.max(this.bounds[t.side][0],Math.min(this.bounds[t.side][1],x));
    // Discard movement beyond the boundary so reversing the finger moves immediately.
    t.lastX=screenX;
  }
  end(id:number): void { this.touches.delete(id); }
  clear(): void { this.touches.clear(); }
  reset(): void { this.clear();this.positions=[...this.initial]; }
}
