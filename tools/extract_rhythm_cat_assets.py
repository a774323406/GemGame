"""Deterministic extraction of original recording pixels; no generated/redrawn artwork."""
from PIL import Image, ImageDraw
import numpy as np, json, hashlib, pathlib, subprocess
from collections import deque
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/res/rhythmCatFeed'; OUT.mkdir(exist_ok=True)
REF=ROOT/'marketing/feed/rhythm-cat'; WORK=pathlib.Path('/private/tmp/gem-rhythm-cat-work')
if not (WORK/'frame-163.png').exists():
 WORK.mkdir(parents=True,exist_ok=True)
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(REF/'reference.mp4'),'-vf','fps=5',str(WORK/'frame-%03d.png')],check=True)
def frame(n): return Image.open(WORK/f'frame-{n:03}.png').convert('RGB')
def uuid(s):
 h=hashlib.sha256(('GemGame/rhythmCatFeed/'+s).encode()).hexdigest(); return f'{h[:8]}-{h[8:12]}-5{h[13:16]}-a{h[17:20]}-{h[20:32]}'
prov=[]
def meta(name,im):
 template=json.loads((ROOT/'assets/res/penguinStackFeed/heart.png.meta').read_text()); u=uuid(name); old=template['uuid']; template=json.loads(json.dumps(template).replace(old,u)); w,h=im.size
 template['userData']['hasAlpha']=im.mode=='RGBA'; template['files']=['.json',pathlib.Path(name).suffix]
 for v in template['subMetas'].values(): v['displayName']=pathlib.Path(name).stem
 d=template['subMetas']['f9941']['userData']; d.update(width=w,height=h,rawWidth=w,rawHeight=h)
 d['vertices'].update(rawPosition=[-w/2,-h/2,0,w/2,-h/2,0,-w/2,h/2,0,w/2,h/2,0],uv=[0,h,w,h,0,0,w,0],minPos=[-w/2,-h/2,0],maxPos=[w/2,h/2,0])
 (OUT/(name+'.meta')).write_text(json.dumps(template,indent=2)+'\n')
def save(name,im,n,box,processing):
 im.save(OUT/name); meta(name,im); prov.append(dict(file=name,sourceType='video-frame',sourceFile='reference.mp4',sourceFrames=[(n-1)*6+2],sampleIndex=n,sampleTime=(n-1)/5+2/30,crop=box,processing=processing,gaps=[]))
def extract(name,n,box,threshold=160):
 im=frame(n).crop(box); a=np.array(im); h,w=a.shape[:2]; barrier=a.min(2)<threshold
 if name.startswith(("black-","white-")): barrier &= a[:,:,0]<180
 # Find exterior background without punching out enclosed white fur or mouth.
 seen=np.zeros((h,w),bool); q=deque([(x,y) for x in range(w) for y in [0,h-1]]+[(x,y) for y in range(h) for x in [0,w-1]])
 while q:
  x,y=q.popleft()
  if x<0 or y<0 or x>=w or y>=h or seen[y,x] or barrier[y,x]: continue
  seen[y,x]=True; q.extend(((x-1,y),(x+1,y),(x,y-1),(x,y+1)))
 mask=~seen; visited=np.zeros_like(mask); groups=[]
 for y,x in zip(*np.where(mask)):
  if visited[y,x]:continue
  q=deque([(x,y)]); points=[]; visited[y,x]=True
  while q:
   xx,yy=q.popleft();points.append((xx,yy))
   for nx,ny in [(xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1)]:
    if 0<=nx<w and 0<=ny<h and mask[ny,nx] and not visited[ny,nx]:visited[ny,nx]=True;q.append((nx,ny))
  groups.append(points)
 alpha=np.zeros((h,w),np.uint8)
 for x,y in max(groups,key=len):alpha[y,x]=255
 rgba=np.dstack([a,alpha]);result=Image.fromarray(rgba,'RGBA');save(name,result,n,list(box),'Source RGB unchanged; exterior flood-fill and largest silhouette alpha mask')
 return result
# Consistent canvas and feet y=810; original posture and outlines retained.
extract('black-idle.png',116,(76,636,208,812),145)
extract('black-open.png',16,(166,636,298,812),145)
extract('white-idle.png',116,(328,636,460,812),145)
extract('white-open.png',66,(326,636,458,812),145)
extract('brown-pop.png',16,(41,299,87,373),200)
extract('pink-pop.png',116,(340,351,386,425),200)
extract('brown-cone.png',16,(194,260,233,317),200)
extract('pink-cone.png',116,(493,303,532,359),200)
extract('brown-scoop.png',16,(45,118,82,156),200)
extract('cream-scoop.png',16,(45,140,82,159),200)
extract('pink-scoop.png',16,(343,30,381,68),200)
extract('crumb-brown.png',16,(89,674,102,690),190)
extract('crumb-pink.png',1,(315,663,329,678),205)
extract('heart-full.png',116,(459,237,495,270),207)
extract('heart-empty.png',116,(414,237,451,270),207)
# Preserve video wall, center divider, guide and floor pixels, taking clean patches.
src=frame(116); bg=src.copy()
for x in range(0,576,40):bg.paste(src.crop((240,0,280,810)),(x,0))
bg.paste(src.crop((286,0,291,1136)),(286,0))
# Promo area removed using the unobstructed neighboring floor at the same height.
bg.paste(src.crop((360,993,442,1083)),(494,993))
save('background.jpg',bg,116,None,'Unobstructed source wall strip repeated; original floor and divider; gift overlay replaced with adjacent original floor')
# Contact sheet remains outside shipped resources.
sheet=Image.new('RGB',(700,480),(255,233,213));d=ImageDraw.Draw(sheet)
for i,p in enumerate(prov[:-1]):
 im=Image.open(OUT/p['file']).convert('RGBA');x=(i%5)*140;y=(i//5)*160
 im.thumbnail((130,130));sheet.paste(im,(x+5,y+18),im);d.text((x+2,y+145),p['file'],fill=(70,50,50))
sheet.save(REF/'extracted-assets.png')
(REF/'asset-provenance.json').write_text(json.dumps(prov,ensure_ascii=False,indent=2)+'\n')
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(REF/'reference.mp4'),'-vn','-t','32.666667','-ac','2','-ar','44100','-codec:a','libmp3lame','-b:a','128k',str(OUT/'track.mp3')],check=True)
(OUT/'track.mp3.meta').write_text(json.dumps(dict(ver='1.0.0',importer='audio-clip',imported=True,uuid=uuid('track.mp3'),files=['.json','.mp3'],subMetas={},userData=dict(downloadMode=0)),indent=2)+'\n')
print('Extracted',len(prov),'source images and track')
