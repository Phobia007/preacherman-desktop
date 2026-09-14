"""Align the static-source Twin arm pivots to the authored metal joint rings."""
import sys,struct,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from audit import *
id='the-twins-atomic-heart';g,raw=read(root/'source'/f'{id}.glb');b=bytearray(raw);ns=g['nodes'];parents={c:i for i,n in enumerate(ns) for c in n.get('children',[])};world={}
def wm(i):
 if i not in world:world[i]=(wm(parents[i]) if i in parents else np.eye(4))@mat(ns[i])
 return world[i]
for i in range(len(ns)):wm(i)
skin=g['skins'][0];oldbind=np.linalg.inv(acc(g,raw,skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1));bind={i:oldbind[k].copy() for k,i in enumerate(skin['joints'])};names={n['name']:i for i,n in enumerate(ns) if 'name' in n}
gold=acc(g,raw,g['meshes'][3]['primitives'][0]['attributes']['POSITION']);labels=np.load(root/f'{id}-3-0-components.npy');changes={}
for side,sign in [('l',1),('r',-1)]:
 for part,lo,hi in [('forearm',1.18,1.29),('hand',.97,1.04)]:
  candidates=[gold[labels==l] for l in np.unique(labels) if lo<gold[labels==l,1].mean()<hi and gold[labels==l,0].mean()*sign>.18]
  assert len(candidates)==1
  points=candidates[0];center=(points.min(0)+points.max(0))/2
  name=f'b_{side}_{part}';changes[name]=center.tolist();bind[names[name]][:3,3]=center
 # Shoulder sockets share the upper-arm shell's depth; pelvis/torso and legs
 # are untouched. Tail direction is recalibrated by the retargeting pass.
 name=f'b_{side}_upperarm';center=bind[names[name]][:3,3].copy();center[2]=-.050;changes[name]=center.tolist();bind[names[name]][:3,3]=center
for i in skin['joints']:
 parent=parents.get(i);local=np.linalg.inv(bind.get(parent,world.get(parent,np.eye(4))))@bind[i]
 scale=np.linalg.norm(local[:3,:3],axis=0);q=Rotation.from_matrix(local[:3,:3]/scale).as_quat();ns[i].pop('matrix',None);ns[i].update(translation=local[:3,3].tolist(),rotation=q.tolist(),scale=scale.tolist())
values=np.array([np.linalg.inv(bind[i]).T.reshape(16) for i in skin['joints']],dtype='<f4');data=values.tobytes()
while len(b)%4:b.append(0)
vi=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':len(b),'byteLength':len(data)});b.extend(data);ai=len(g['accessors']);g['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(values),'type':'MAT4'});skin['inverseBindMatrices']=ai
g['buffers'][0]['byteLength']=len(b);doc=json.dumps(g,separators=(',',':'),ensure_ascii=False).encode();doc+=b' '*((-len(doc))%4);b+=b'\0'*((-len(b))%4)
(root/'rig-input').mkdir(exist_ok=True);(root/'rig-input'/f'{id}.glb').write_bytes(struct.pack('<III',0x46546c67,2,28+len(doc)+len(b))+struct.pack('<II',len(doc),0x4e4f534a)+doc+struct.pack('<II',len(b),0x004e4942)+b)
(root/'inspection/twin-bind-repair.json').write_text(json.dumps({'jointPositions':changes,'purpose':'Arm pivots follow authored elbow/wrist rings; rest mesh shape is unchanged.'},indent=2));print(changes)
