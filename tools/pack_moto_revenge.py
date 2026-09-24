"""Pack two generated cars and palette-matched rival punch frames. No drawn artwork."""
from PIL import Image
from pathlib import Path
import colorsys,json
path=Path('assets/res/motoRace/riders-atlas.png')
base=Image.open(path).convert('RGBA')
atlas=Image.new('RGBA',(1024,2560));atlas.paste(base.crop((0,0,1024,1792)),(0,0))
for i in range(2):
 car=Image.open(f'docs/reference/moto-traffic-extra/traffic-{i+1}.png').convert('RGBA')
 box=car.getchannel('A').getbbox();cell=Image.new('RGBA',(256,256))
 cell.paste(car,(round(128-(box[0]+box[2])/2),238-box[3]))
 atlas.paste(cell,((26+i)%4*256,(26+i)//4*256))
for palette,hue in enumerate([.56,.105,.78]):
 for pose in range(4):
  cell=base.crop((pose*256,256,pose*256+256,512));pixels=cell.load()
  for y in range(256):
   for x in range(256):
    r,g,b,a=pixels[x,y]
    if a>0 and r>g*1.45 and r>b*1.2 and r>55:
     _,sat,val=colorsys.rgb_to_hsv(r/255,g/255,b/255)
     rgb=colorsys.hsv_to_rgb(hue,sat*.87,val)
     pixels[x,y]=(*[round(v*255) for v in rgb],a)
  index=28+palette*4+pose;atlas.paste(cell,(index%4*256,index//4*256))
# Indexed export keeps forty images within the overall 1 MB gameplay budget.
atlas.quantize(colors=256,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE).save(path,optimize=True)
for i in range(40):
 b=atlas.crop((i%4*256,i//4*256,i%4*256+256,i//4*256+256)).getchannel('A').getbbox()
 assert b and min(b[:2])>0 and max(b[2:])<256,(i,b)
p=Path(str(path)+'.meta');meta=json.loads(p.read_text())
for sub in meta['subMetas'].values():
 if sub['importer']=='sprite-frame':sub['userData'].update(height=2560,rawHeight=2560)
p.write_text(json.dumps(meta,indent=2)+'\n')
print('PASS 40 atlas cells, no clipping;',path.stat().st_size,'bytes')
