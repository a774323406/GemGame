from pathlib import Path
import struct,re,json
p=Path(__file__).parent;m=(p/'metadata.bin').read_bytes();u=lambda o:struct.unpack_from('<I',m,o)[0]
so=u(24);st=lambda n:m[so+n:m.index(b'\0',so+n)].decode(errors='replace')
print('header',[(i,u(i),u(i+4)) for i in range(8,200,8)])
for name in ['RoadCreator','GameSettings','Car','RoadObject']:
 idx=m.find(name.encode()+b'\0',so)-so;needle=struct.pack('<I',idx)
 matches=[x.start() for x in re.finditer(re.escape(needle),m) if x.start()>so+u(28)]
 print(name,idx,[(a,struct.unpack_from('<24I',m,a)) for a in matches[:5]])
mem=(p/'memory.bin').read_bytes();asm=(p/'original.asm.js').read_text();tables={}
for mt in re.finditer(r'var (FUNCTION_TABLE_\w+)=\[([^\]]+)\]',asm):tables[mt.group(1)]=mt.group(2).split(',')
print('tables',[(k,len(v)) for k,v in tables.items()][:7])
for n in range(30931,30961):
 o=u(48)+n*56;v=struct.unpack_from('<14I',m,o);print(n,st(v[0]),v)
arrays=[]
for mt in re.finditer(r'(\w+)=\[([\w$,]+)\]',asm):
 vals=mt.group(2).split(',')
 if len(vals)>100:arrays.append((mt.group(1),vals))
print('arrays',[(k,len(v)) for k,v in arrays][-8:])
result={}
for n in list(range(30931,30961))+list(range(30126,30212))+list(range(30499,30502)):
 o=u(48)+n*56;v=struct.unpack_from('<14I',m,o);idx=v[6]
 if idx==4294967295:continue
 ptr=struct.unpack_from('<I',mem,830768+idx*4)[0]
 names=set(vals[ptr] for _,vals in arrays if ptr<len(vals));funcs=[]
 for name in names:
  mt=re.search(r'function '+re.escape(name)+r'\([^)]*\)\{',asm)
  if not mt:continue
  start=mt.start();end=asm.find('\nfunction ',start+10)
  body=asm[start:end]
  if len(body)<130:continue
  funcs.append((name,body))
 key=f'{st(v[0])}_{n}';result[key]=[(x,len(y)) for x,y in funcs]
 for name,body in funcs:
  (p/'evidence'/f'{key}_{name}.js').write_text(body)
print(json.dumps(result,indent=1))
