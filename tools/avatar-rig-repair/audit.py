from pathlib import Path
import json,struct,numpy as np
from scipy.spatial.transform import Rotation
import os
root=Path(os.environ.get('PREACHERMAN_RIG_WORKDIR',str(Path(__file__).parent)))
repo=Path(r'\\?\C:\Users\Administrator\.codex\visualizations\2026\08\20\01a01e57-8912-7d31-8853-13e23af6f1d1\preacherman-integration')
ids=['halloween-the-game-michael-myers-samhain','zima','nier-automata-2b','kitana-mk11-in-mk9-suit','stellar-blade-lily-stargazer-coat','the-twins-atomic-heart','apex-legend-pathfinder']
def read(p):
 b=p.read_bytes();end=20+struct.unpack_from('<I',b,12)[0];return json.loads(b[20:end]),b[end+8:]
def acc(g,b,i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
 ar=np.ndarray((a['count'],n),dtype=dtype,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dtype).itemsize*n),np.dtype(dtype).itemsize)).copy()
 if a.get('normalized') and a['componentType']!=5126:ar=ar/np.iinfo(ar.dtype).max
 return ar
def mat(n):
 if 'matrix' in n:return np.array(n['matrix']).reshape(4,4).T
 m=np.eye(4);m[:3,:3]=Rotation.from_quat(n.get('rotation',[0,0,0,1])).as_matrix()@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m
if __name__=='__main__':
 results=[]
 for id in ids:
  p=repo/'apps/preacherman-demo-host/public/assets/avatars'/id/f'{id}-runtime.glb';g,b=read(p)
  parents={c:i for i,n in enumerate(g['nodes']) for c in n.get('children',[])};world={}
  def wm(i):
   if i not in world:world[i]=(wm(parents[i]) if i in parents else np.eye(4))@mat(g['nodes'][i])
   return world[i]
  for i in range(len(g['nodes'])):wm(i)
  skin=g['skins'][0];bind=np.linalg.inv(acc(g,b,skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1));bn={g['nodes'][j]['name']:bind[k] for k,j in enumerate(skin['joints'])}
  channelnodes={c['target']['node'] for a in g['animations'] for c in a['channels']};usage={j:0 for j in skin['joints']};meshes=[]
  for me in g['meshes']:
   for pr in me['primitives']:
    a=pr['attributes'];pos=acc(g,b,a['POSITION']);j=acc(g,b,a['JOINTS_0']);w=acc(g,b,a['WEIGHTS_0']);u,counts=np.unique(j[w>.01],return_counts=True)
    for k,c in zip(u,counts):usage[skin['joints'][int(k)]]+=int(c)
    meshes.append({'name':me.get('name'),'vertices':len(pos),'min':pos.min(0).tolist(),'max':pos.max(0).tolist(),'badWeightSum':float(abs(w.sum(1)-1).max())})
  bones=[{'name':g['nodes'][j].get('name'),'parent':g['nodes'][parents[j]].get('name') if j in parents else None,'bindHead':bind[k,:3,3].round(5).tolist(),'nodeBindOffset':round(float(np.linalg.norm(world[j][:3,3]-bind[k,:3,3])),6),'scale':g['nodes'][j].get('scale'),'animated':j in channelnodes,'weightedVertices':usage[j]} for k,j in enumerate(skin['joints'])]
  report={'id':id,'meshes':meshes,'bones':bones,'animations':[{'name':a['name'],'channels':len(a['channels'])} for a in g['animations']]};results.append(report)
  print(id,'bones',len(bones),'meshes',len(meshes),'unanimated weighted bones',[(x['name'],x['weightedVertices']) for x in bones if not x['animated'] and x['weightedVertices']>100])
 (root/'audit.json').write_text(json.dumps(results,indent=2))
