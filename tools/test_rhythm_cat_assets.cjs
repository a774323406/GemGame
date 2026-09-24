const {execFileSync}=require('node:child_process');
execFileSync('python3',['-c',`
import json,pathlib,subprocess
from PIL import Image
import numpy as np
root=pathlib.Path('.');work=pathlib.Path('/private/tmp/gem-rhythm-cat-work');work.mkdir(exist_ok=True)
if not (work/'frame-163.png').exists():subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i','marketing/feed/rhythm-cat/reference.mp4','-vf','fps=5',str(work/'frame-%03d.png')],check=True)
d=root/'assets/res/rhythmCatFeed';prov=json.loads((root/'marketing/feed/rhythm-cat/asset-provenance.json').read_text());memory=0
for p in prov:
 im=Image.open(d/p['file']);memory+=im.width*im.height*4
 assert p['sourceType']=='video-frame'
 if p['crop']:
  assert im.mode=='RGBA';a=np.array(im);assert a[:,:,3].min()==0 and a[:,:,3].max()==255
  source=Image.open('/private/tmp/gem-rhythm-cat-work/frame-%03d.png'%p['sampleIndex']).convert('RGB').crop(p['crop'])
  assert np.array_equal(a[:,:,:3],np.array(source)),p['file']+' RGB changed'
  if p['file'].startswith(('black-','white-')):
   assert (a[-1,:,3]==0).all(),'floor contamination'
 assert (d/(p['file']+'.meta')).exists()
duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(d/'track.mp3')]))
assert abs(duration-32.666667)<.05
audio_ids=[json.loads((d/'track.mp3.meta').read_text())['uuid']]
for name,rate in [('track-normal.mp3',.85),('track-slow.mp3',.70)]:
 tempo_duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(d/name)]))
 assert abs(tempo_duration-32.666667/rate)<.1,name+' must cover its full-speed chart'
 audio_ids.append(json.loads((d/(name+'.meta')).read_text())['uuid'])
 print('%s %.3fs matches %.0f%% speed'%(name,tempo_duration,rate*100))
assert len(set(audio_ids))==3
print('Original RGB verified for every extracted sprite; audio %.3fs; images %.2f MiB decoded; resources %.2f MiB on disk'%(duration,memory/1048576,sum(p.stat().st_size for p in d.iterdir() if p.suffix!='.meta')/1048576))
`],{stdio:'inherit'});
