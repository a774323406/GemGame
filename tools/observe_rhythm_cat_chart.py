"""Record food arrivals from source-frame template matches, not a random chart."""
from PIL import Image
import numpy as np, pathlib,json
ROOT=pathlib.Path(__file__).resolve().parents[1];work=pathlib.Path('/private/tmp/gem-rhythm-cat-work');out=ROOT/'marketing/feed/rhythm-cat'
templates={}
for name in ['brown-pop','pink-pop','brown-cone','pink-cone','brown-scoop','pink-scoop','cream-scoop']:
 a=np.array(Image.open(ROOT/f'assets/res/rhythmCatFeed/{name}.png')); yy,xx=np.where(a[:,:,3]>0)
 if 'cone' in name: yy,xx=np.where(np.indices(a.shape[:2])[0]>=a.shape[0]//2)
 # Fixed evenly spaced silhouette samples, preserving exact source RGB.
 ix=np.linspace(0,len(xx)-1,min(100,len(xx))).astype(int)
 templates[name]=(a,xx[ix],yy[ix],a[yy[ix],xx[ix],:3].astype(float))
observations=[]
for fi,f in enumerate(sorted(work.glob('frame-*.png'))):
 a=np.array(Image.open(f)).astype(float); t=fi/5+2/30
 for lane,cx in enumerate([64,213,363,512]):
  candidates=[]
  names=['brown-pop','brown-cone','brown-scoop','cream-scoop'] if lane<2 else ['pink-pop','pink-cone','pink-scoop','cream-scoop']
  for name in names:
   template,xx,yy,rgb=templates[name];h,w=template.shape[:2];ys=np.arange(275,610-h)
   best=np.full(len(ys),1e6)
   for dx in [-1,0,1]:
    colors=a[ys[:,None]+yy[None,:],(cx-w//2+dx+xx)[None,:],:]
    err=np.mean(np.abs(colors-rgb[None,:,:]),axis=(1,2)); best=np.minimum(best,err)
   threshold=10 if 'cone' in name else ((9 if name=='cream-scoop' else 15) if 'scoop' in name else 19)
   for j in range(1,len(ys)-1):
    if best[j]<threshold and best[j]<=best[j-1] and best[j]<best[j+1]:candidates.append((best[j],float(ys[j]+h/2),name))
  taken=[]
  for err,y,name in sorted(candidates):
   if any(abs(y-p[1])<(14 if 'scoop' in name and 'scoop' in p[2] else 33) for p in taken):continue
   taken.append((err,y,name))
  for err,y,name in taken:
   arrival=t+(721-y)/220
   if 0<arrival<=32.666667: observations.append(dict(side=0 if lane<2 else 1,x=(cx%288)/288,hitTime=arrival,kind=name,sourceFrame=fi*6+2,sourceSample=fi+1,sourceY=y,matchError=round(float(err),2),lane=lane))
# Link repeated sightings of the same food across sampled frames.
notes=[]
for p in sorted(observations,key=lambda p:p['matchError']):
 if not any(n['lane']==p['lane'] and abs(n['hitTime']-p['hitTime'])<0.048 for n in notes):notes.append(p)
notes=[p for p in notes if 'scoop' not in p['kind'] or not any(n['lane']==p['lane'] and 'scoop' not in n['kind'] and abs(n['hitTime']-p['hitTime'])<(.1 if 'cone' in n['kind'] else .16) for n in notes)]
notes.sort(key=lambda p:p['hitTime'])
for i,p in enumerate(notes):p['id']=i;p['hitTime']=round(p['hitTime'],4);p['x']=round(p['x'],6)
(out/'chart-observations.json').write_text(json.dumps(dict(method='Source sprite RGB matching at fixed food columns; 5 FPS samples; observed descent 220 source pixels/second; arrival at mouth y=721; times approximate to recording sampling.',notes=notes),ensure_ascii=False,indent=2)+'\n')
header="export type CatSide = 0 | 1;\nexport type FoodKind = 'brown-pop' | 'pink-pop' | 'brown-cone' | 'pink-cone' | 'brown-scoop' | 'pink-scoop' | 'cream-scoop';\nexport interface CatNote { id: number; side: CatSide; x: number; hitTime: number; kind: FoodKind; }\nexport const RHYTHM_CAT_DURATION = 32.666667;\n// Observed from reference.mp4. Provenance: marketing/feed/rhythm-cat/chart-observations.json.\nexport const RHYTHM_CAT_CHART: readonly CatNote[] = "
(ROOT/'assets/scripts/rhythmCatChart.ts').write_text(header+json.dumps([{k:p[k] for k in ['id','side','x','hitTime','kind']} for p in notes],separators=(',',':'))+';\n')
print('Observed notes:',len(notes),'left:',sum(p['side']==0 for p in notes),'right:',sum(p['side']==1 for p in notes))
