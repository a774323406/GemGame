/** Reject duplicate and stale rewarded-ad completions without consuming a life. */
export class DriftReviveGate {
 private generation=0;busy=false;
 invalidate():void{this.generation++;this.busy=false;}
 async request(show:()=>Promise<boolean>,apply:()=>boolean):Promise<boolean>{
  if(this.busy)return false;this.busy=true;const token=this.generation;
  try{const success=await show();return token===this.generation&&success?apply():false;}catch{return false;}finally{if(token===this.generation)this.busy=false;}
 }
}
