"""Local weight painting for the two static-source rigs; do not alter mesh data."""
import sys,json,struct,hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from audit import read,acc,np
import os
R=Path(os.environ.get('PREACHERMAN_RIG_WORKDIR',str(Path(__file__).parent)))
def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
for id in ['nier-automata-2b','the-twins-atomic-heart']:
 p=R/'exports'/f'{id}-runtime.glb';snapshot=R/'exports'/f'{id}-motion-only.glb'
 if not snapshot.exists():snapshot.write_bytes(p.read_bytes())
 g,raw=read(snapshot);binary=bytearray(raw);names={g['nodes'][j]['name']:i for i,j in enumerate(g['skins'][0]['joints'])};stats=[]
 def accessor(values,component):
  while len(binary)%4:binary.append(0)
  vi=len(g['bufferViews']);data=values.tobytes();g['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data)});binary.extend(data)
  ai=len(g['accessors']);g['accessors'].append({'bufferView':vi,'componentType':component,'count':len(values),'type':'VEC4'});return ai
 for mi,mesh in enumerate(g['meshes']):
  for pi,pr in enumerate(mesh['primitives']):
   at=pr['attributes'];pos=acc(g,raw,at['POSITION']);j=acc(g,raw,at['JOINTS_0']).astype(int);w=acc(g,raw,at['WEIGHTS_0']);oldj=j.copy();oldw=w.copy();weights=np.zeros((len(pos),len(names)));np.add.at(weights,(np.arange(len(pos))[:,None],j),w)
   x=np.abs(pos[:,0]);y=pos[:,1]
   # Faces, hair and the Twin's metal mask must follow the head without being
   # stretched by the neck/chest across disconnected material layers.
   head=smooth(1.53 if id=='nier-automata-2b' else 1.54,1.61,y)
   weights*=1-head[:,None];weights[:,names['b_head']]+=head
   # One continuous field for fitted torso layers prevents their heat weights
   # from pulling the same anatomical surface in different directions.
   torso=(1-smooth(.115,.18,x))*smooth(1.00,1.10,y)*(1-smooth(1.44,1.53,y))
   levels=[('b_pelvis',1.01 if id=='nier-automata-2b' else 1.04),('b_spine0',1.12),('b_spine1',1.26),('b_spine3',1.44),('b_neck0',1.53)]
   field=np.zeros_like(weights)
   for (a,ya),(b,yb) in zip(levels,levels[1:]):
    rows=(y>=ya)&(y<=yb);t=smooth(ya,yb,y[rows]);field[rows,names[a]]=1-t;field[rows,names[b]]=t
   field[y<levels[0][1],names[levels[0][0]]]=1;field[y>levels[-1][1],names[levels[-1][0]]]=1
   weights=weights*(1-torso[:,None])+field*torso[:,None]
   labels=np.load(R/f'{id}-{mi}-{pi}-components.npy')
   if id=='nier-automata-2b' and mi==0 and pi==0:
    # Component 24 is the connected dress. Its skirt had wrist/leg weights
    # caused by proximity in the A pose. Anchor its hem to the pelvis while
    # blending continuously into the waist; leave boots and body untouched.
    skirt=(labels==24)*(1-smooth(.98,1.10,y));weights*=1-skirt[:,None];weights[:,names['b_pelvis']]+=skirt
    for label in np.unique(labels):
     rows=labels==label;points=pos[rows]
     if len(points)>600 or points[:,1].min()<1.08 or np.min(abs(points[:,0]))<.32:continue
     side='l' if points[:,0].mean()>0 else 'r'
     weights[rows]=0;weights[rows,names[f'b_{side}_forearm']]=1
   if id=='the-twins-atomic-heart' and mesh.get('name')=='golden':
    # Metal trim retains its shape, using the same rigid attachment for every
    # vertex of each welded part. Skin and garment vertices remain blended.
    for label in np.unique(labels):
     rows=labels==label;points=pos[rows]
     chosen=names['b_head'] if points[:,1].min()>1.57 else int(np.argmax(weights[rows].sum(0)))
     weights[rows]=0;weights[rows,chosen]=1
   if id=='the-twins-atomic-heart':
    # The Twin is built from separate mechanical shells. Heat weights were
    # bending each forearm shell across elbow and wrist. Attach every welded
    # arm part (including its trim) to the same anatomical rigid segment.
    for label in np.unique(labels):
     rows=labels==label;points=pos[rows];center=points.mean(0)
     if np.min(abs(points[:,0]))<(.10 if mi==0 else .15) or abs(center[0])<(.17 if mi==0 else .20) or center[1]<.88 or points[:,1].max()>1.51:continue
     side='l' if center[0]>0 else 'r'
     part='upperarm' if center[1]>1.285 else 'forearm' if center[1]>1.045 else 'hand'
     weights[rows]=0;weights[rows,names[f'b_{side}_{part}']]=1
   order=np.argsort(-weights,axis=1,kind='stable')[:,:4];vals=np.take_along_axis(weights,order,axis=1);vals/=vals.sum(1)[:,None]
   changed=np.max(abs(np.take_along_axis(weights,oldj,axis=1)-oldw),axis=1)>1e-5
   at['JOINTS_0']=accessor(order.astype('<u2'),5123);at['WEIGHTS_0']=accessor(vals.astype('<f4'),5126)
   stats.append({'mesh':mi,'primitive':pi,'correctedVertices':int(changed.sum()),'vertices':len(pos),'maxWeightSumError':float(abs(vals.sum(1)-1).max())})
 g['buffers'][0]['byteLength']=len(binary);doc=json.dumps(g,separators=(',',':'),ensure_ascii=False).encode();doc+=b' '*((-len(doc))%4);binary+=b'\0'*((-len(binary))%4)
 p.write_bytes(struct.pack('<III',0x46546c67,2,28+len(doc)+len(binary))+struct.pack('<II',len(doc),0x4e4f534a)+doc+struct.pack('<II',len(binary),0x004e4942)+binary)
 rp=R/'inspection'/f'{id}-retarget.json';report=json.loads(rp.read_text());report.update(runtimeSha256=hashlib.sha256(p.read_bytes()).hexdigest(),runtimeBytes=p.stat().st_size,originalMeshSkinMaterialImageBuffersUnchanged=False,originalBinaryBuffersPreserved=True,skinWeightCorrection={'purpose':'Local torso/head attachment and separate rigid accessory weights; authored positions, normals, UVs, textures and inverse bind matrices unchanged.','meshes':stats});rp.write_text(json.dumps(report,indent=2))
 print(id,stats)
