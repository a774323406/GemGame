"""Pack the accepted ImageGen car into unused atlas cell 25 (no new texture)."""
from PIL import Image
from pathlib import Path
source=Path('docs/reference/moto-traffic/single-1.png')
car=Image.open(source).convert('RGBA')
bbox=car.getchannel('A').getbbox()
assert bbox and bbox[0]>0 and bbox[2]<256
cell=Image.new('RGBA',(256,256))
cell.paste(car,(round(128-(bbox[0]+bbox[2])/2),238-bbox[3]))
assert cell.getchannel('A').getbbox()[3]==238
path=Path('assets/res/motoRace/riders-atlas.png')
atlas=Image.open(path).convert('RGBA')
atlas.paste(cell,(256,1536))
atlas.save(path,optimize=True)
print(path.stat().st_size)
