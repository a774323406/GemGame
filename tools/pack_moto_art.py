"""Pack accepted, keyed ImageGen frames. Only alignment, palette variants and compression."""
from PIL import Image
from pathlib import Path
import argparse, colorsys, json
p=argparse.ArgumentParser();p.add_argument('--processed-dir',required=True);args=p.parse_args()
source=Path(args.processed_dir);dest=Path('assets/res/motoRace');dest.mkdir(exist_ok=True)
def align_contact(im):
    im=im.convert('RGBA');alpha=im.getchannel('A');bbox=alpha.getbbox()
    if not bbox: raise ValueError('Empty sprite')
    points=[x for y in range(max(0,bbox[3]-7),bbox[3]) for x in range(im.width) if alpha.getpixel((x,y))>96]
    cx=sum(points)/len(points) if points else (bbox[0]+bbox[2])/2
    offset=(round(128-cx),238-bbox[3])
    result=Image.new('RGBA',(256,256));result.paste(im,offset)
    bounds=result.getchannel('A').getbbox()
    if bounds[0]<=0 or bounds[1]<=0 or bounds[2]>=256 or bounds[3]>=256:raise ValueError('Sprite touches atlas cell edge')
    return result
frames=[];qc={}
for action in ['driving','punch','kick']:
    meta=json.load(open(source/action/'pipeline-meta.json'));qc[action]=meta['qc_summary']
    # Generated bank poses are named from the rider's camera convention; normalize to screen-left/right.
    order=[1,3,2,4] if action=='driving' else [1,2,3,4]
    for i in order:frames.append(align_contact(Image.open(source/action/f'{action}-{i}.png')))
# Only shift red painted surfaces, retaining helmet/skin/tire/metal colours.
for hue in [.56,.105,.78]:
    for original in frames[:4]:
        copy=original.copy();pixels=copy.load()
        for y in range(256):
            for x in range(256):
                r,g,b,a=pixels[x,y]
                if a>0 and r>g*1.45 and r>b*1.2 and r>55:
                    h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
                    rr,gg,bb=colorsys.hsv_to_rgb(hue,s*.87,v)
                    pixels[x,y]=(round(rr*255),round(gg*255),round(bb*255),a)
        frames.append(copy)
frames.append(align_contact(Image.open(source/'pine'/'pine-1.png')))
atlas=Image.new('RGBA',(1024,1792))
for i,im in enumerate(frames):atlas.paste(im,((i%4)*256,(i//4)*256))
atlas.quantize(colors=256,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE).save(dest/'riders-atlas.png',optimize=True)
frames[0].quantize(colors=128,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE).save(dest/'rider-preview.png',optimize=True)
report={'atlasSize':[1024,1792],'cellSize':256,'cells':25,'contactPoint':[128,237], 'playerActions':['driving','punch','kick'],'opponentPalettes':['blue','gold','violet'],'qc':qc,'bytes':{f.name:f.stat().st_size for f in dest.glob('*.png')}}
Path('docs/reference/moto-art-v2').mkdir(parents=True,exist_ok=True)
Path('docs/reference/moto-art-v2/asset-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
