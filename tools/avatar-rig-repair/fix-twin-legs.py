"""Repair Twin leg pivots, rigid shell weights and anatomical knee tracking.

Usage: python fix-twin-legs.py INPUT.glb OUTPUT.glb COMPONENT_DIRECTORY
The original vertex/material/image data and all upper-body tracks are retained.
"""
import sys, json, struct, hashlib
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation

def read(path):
 raw=path.read_bytes();end=20+struct.unpack_from('<I',raw,12)[0]
 return json.loads(raw[20:end]),raw[end+8:]

def acc(g,b,i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];dt=np.dtype({5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']])
 values=np.ndarray((a['count'],size),dtype=dt,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dt.itemsize*size),dt.itemsize)).copy()
 return values/np.iinfo(dt).max if a.get('normalized') and dt.kind!='f' else values

def mat(n):
 if 'matrix' in n:return np.array(n['matrix']).reshape(4,4).T
 m=np.eye(4);m[:3,:3]=Rotation.from_quat(n.get('rotation',[0,0,0,1])).as_matrix()@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);return m

def unit(v):return v/np.linalg.norm(v)
def frame(direction,across):
 y=unit(direction);x=unit(across-y*np.dot(across,y));return np.column_stack((x,y,np.cross(x,y)))

def repair(src,dest,components):
 assert hashlib.sha256(src.read_bytes()).hexdigest()=='3e87dbefd09ceb644ef3462fd8be3800294ec33cee9ba8dfc76301e0b611759d', 'Expected the pre-repair Twin v3 input; do not apply twice'
 g,raw=read(src);binary=bytearray(raw);nodes=g['nodes'];parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])};names={n['name']:i for i,n in enumerate(nodes) if 'name' in n}
 def worlds(overrides=None):
  out={}
  def wm(i):
   if i not in out:out[i]=(wm(parents[i]) if i in parents else np.eye(4))@(overrides.get(i,mat(nodes[i])) if overrides else mat(nodes[i]))
   return out[i]
  for i in range(len(nodes)):wm(i)
  return out
 oldrest=worlds();skin=g['skins'][0];bind=np.linalg.inv(acc(g,raw,skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1));rest={j:bind[k].astype(float).copy() for k,j in enumerate(skin['joints'])}
 oldbind={i:m.copy() for i,m in rest.items()};pivots={}
 for side,sign in [('l',1),('r',-1)]:
  for part,pos in [('calf',[.0765,.535,-.0575]),('foot',[.067,.074,-.066]),('toe',[.066,.024,.076])]:
   pos[0]*=sign;n=names[f'b_{side}_{part}'];pivots[nodes[n]['name']]={'before':rest[n][:3,3].tolist(),'after':pos};rest[n][:3,3]=pos
 # Capture the existing animation before changing bind transforms.
 anim=g['animations'][0];tracks={};times=None
 for ch in anim['channels']:
  s=anim['samplers'][ch['sampler']];tracks[ch['target']['node'],ch['target']['path']]=acc(g,raw,s['output']);times=acc(g,raw,s['input']).ravel()
 originalposes=[]
 for k in range(len(times)):
  overrides={}
  for i in range(len(nodes)):
   n=nodes[i].copy()
   for prop in ['rotation','translation','scale']:
    if (i,prop) in tracks:n[prop]=tracks[i,prop][k]
   overrides[i]=mat(n)
  originalposes.append(worlds(overrides))
 for i in skin['joints']:
  local=np.linalg.inv(rest.get(parents.get(i),oldrest.get(parents.get(i),np.eye(4))))@rest[i]
  scale=np.linalg.norm(local[:3,:3],axis=0);nodes[i].pop('matrix',None);nodes[i].update(translation=local[:3,3].tolist(),rotation=Rotation.from_matrix(local[:3,:3]/scale).as_quat().tolist(),scale=scale.tolist())
 def append(values,kind='VEC4',component=5126):
  values=np.asarray(values,dtype='<u2' if component==5123 else '<f4');data=values.tobytes()
  while len(binary)%4:binary.append(0)
  vi=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data)});binary.extend(data)
  ai=len(g['accessors']);g['accessors'].append({'bufferView':vi,'componentType':component,'count':len(values),'type':kind});return ai
 skin['inverseBindMatrices']=append([np.linalg.inv(rest[i]).T.reshape(16) for i in skin['joints']],'MAT4')
 lower=[names[f'b_{s}_{p}'] for s in ['l','r'] for p in ['thigh','calf','foot','toe']];rotations={i:[] for i in lower};metrics=[]
 bodyPositions=acc(g,raw,g['meshes'][0]['primitives'][0]['attributes']['POSITION'])
 for k,old in enumerate(originalposes):
  solved={};row={}
  for side,sign in [('l',1),('r',-1)]:
   thigh,calf,foot,toe=[names[f'b_{side}_{p}'] for p in ['thigh','calf','foot','toe']]
   h=old[thigh][:3,3];foot_delta=old[foot][:3,:3]@oldbind[foot][:3,:3].T
   goal=rest[foot][:3,3]+old[foot][:3,3]-oldbind[foot][:3,3]+np.array([sign*.035,0,0])
   shoe=bodyPositions[(bodyPositions[:,1]<.08)&(bodyPositions[:,0]*sign>0)]
   soleHeight=((shoe-rest[foot][:3,3])@foot_delta.T)[:,1].min()
   goal[1]=max(goal[1],.001-soleHeight)
   l1=np.linalg.norm(rest[calf][:3,3]-rest[thigh][:3,3]);l2=np.linalg.norm(rest[foot][:3,3]-rest[calf][:3,3]);axis=unit(goal-h);distance=np.linalg.norm(goal-h)
   reachError=max(0,distance-(l1+l2)*.998)
   if reachError:distance=(l1+l2)*.998;goal=h+axis*distance
   along=(l1*l1-l2*l2+distance*distance)/(2*distance)
   # A shared hinge plane follows toe heading; donor roll cannot turn the knee inward.
   forward=foot_delta@np.array([0.,0.,1.]);forward[1]=0;forward=unit(forward)
   pole=unit(forward-axis*np.dot(forward,axis));knee=h+axis*along+pole*np.sqrt(max(0,l1*l1-along*along));hinge=unit(np.cross(pole,axis))
   for bone,child,start,end in [(thigh,calf,h,knee),(calf,foot,knee,goal)]:
    delta=frame(end-start,hinge)@frame(rest[child][:3,3]-rest[bone][:3,3],np.array([1.,0.,0.])).T
    m=np.eye(4);m[:3,:3]=delta@rest[bone][:3,:3];m[:3,3]=start;solved[bone]=m
   m=old[foot].copy();m[:3,3]=goal;solved[foot]=m
   local=np.linalg.inv(rest[foot])@rest[toe];local[:3,:3]=old[foot][:3,:3].T@old[toe][:3,:3];solved[toe]=m@local
   row[side]={'hip':h.tolist(),'knee':knee.tolist(),'ankle':goal.tolist(),'reachCorrection':reachError,'bendDegrees':float(np.degrees(np.arccos(np.clip(np.dot(unit(knee-h),unit(goal-knee)),-1,1))))}
  row['kneeSeparation']=row['l']['knee'][0]-row['r']['knee'][0];metrics.append(row)
  for bone in lower:
   parent=parents[bone];local=np.linalg.inv(solved.get(parent,old[parent]))@solved[bone];q=Rotation.from_matrix(local[:3,:3]).as_quat()
   if rotations[bone] and np.dot(rotations[bone][-1],q)<0:q=-q
   rotations[bone].append(q)
 for ch in anim['channels']:
  bone=ch['target']['node']
  if bone not in rotations:continue
  assert ch['target']['path']=='rotation'
  rotations[bone][-1]=rotations[bone][0];anim['samplers'][ch['sampler']]['output']=append(rotations[bone])
 # Welded mechanical shells retain their shape. Soft hip panels keep existing weights.
 boneindices={nodes[n]['name']:i for i,n in enumerate(skin['joints'])};painted=[]
 for mi,mesh in enumerate(g['meshes']):
  for pi,pr in enumerate(mesh['primitives']):
   at=pr['attributes'];pos=acc(g,raw,at['POSITION']);j=acc(g,raw,at['JOINTS_0']).astype('<u2');w=acc(g,raw,at['WEIGHTS_0']).astype('<f4');labels=np.load(components/f'the-twins-atomic-heart-{mi}-{pi}-components.npy');changed=0
   for label in np.unique(labels):
    rows=labels==label;pts=pos[rows];c=pts.mean(0)
    if pts[:,1].max()>.85 or abs(c[0])>.18:continue
    side='l' if c[0]>0 else 'r';part='foot' if c[1]<.12 else 'calf' if c[1]<.60 else 'thigh'
    if mi!=0 and mesh.get('name')!='golden':continue
    j[rows]=0;j[rows,0]=boneindices[f'b_{side}_{part}'];w[rows]=0;w[rows,0]=1;changed+=int(rows.sum())
   if changed:at['JOINTS_0']=append(j,component=5123);at['WEIGHTS_0']=append(w);painted.append({'mesh':mi,'vertices':changed})
 g['buffers'][0]['byteLength']=len(binary);doc=json.dumps(g,separators=(',',':'),ensure_ascii=False).encode();doc+=b' '*((-len(doc))%4);binary+=b'\0'*((-len(binary))%4)
 dest.write_bytes(struct.pack('<III',0x46546c67,2,28+len(doc)+len(binary))+struct.pack('<II',len(doc),0x4e4f534a)+doc+struct.pack('<II',len(binary),0x004e4942)+binary)
 report={'sourceSha256':hashlib.sha256(src.read_bytes()).hexdigest(),'runtimeSha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'runtimeBytes':dest.stat().st_size,'clip':anim['name'],'duration':float(times[-1]),'frames':len(times),'pivots':pivots,'paintedShells':painted,'minKneeSeparation':min(m['kneeSeparation'] for m in metrics),'maxKneeFlexion':max(m[s]['bendDegrees'] for m in metrics for s in ['l','r']),'upperBodyTracksUnchanged':True}
 dest.with_suffix('.json').write_text(json.dumps(report,indent=2));dest.with_suffix('.joints.json').write_text(json.dumps(metrics));print(json.dumps(report))

if __name__=='__main__':repair(*map(Path,sys.argv[1:4]))
