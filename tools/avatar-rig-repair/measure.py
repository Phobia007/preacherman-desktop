import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from audit import *
def measure(p):
 g,b=read(p);animation=g['animations'][0];ns=g['nodes'];parents={c:i for i,n in enumerate(ns) for c in n.get('children',[])};channels={};steps=[]
 for ch in animation['channels']:
  sa=animation['samplers'][ch['sampler']];v=acc(g,b,sa['output']);t=acc(g,b,sa['input']).ravel();channels[(ch['target']['node'],ch['target']['path'])]=v
  if ch['target']['path']=='rotation':
   steps.append((np.degrees(2*np.arccos(np.clip(abs(np.sum(v[1:]*v[:-1],axis=1)),0,1))),ns[ch['target']['node']]['name']))
 count=len(t);summary={'frames':count,'fps':round((count-1)/t[-1]),'maxStepDegrees':max(float(s.max()) for s,n in steps),'worstSteps':sorted([(round(float(s.max()),3),n) for s,n in steps],reverse=True)[:6], 'entryExitStepDegrees':max(float(max(s[0],s[-1])) for s,n in steps)}
 meshes=[]
 for node in ns:
  if 'mesh' not in node or 'skin' not in node:continue
  skin=g['skins'][node['skin']];ib=acc(g,b,skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
  for pr in g['meshes'][node['mesh']]['primitives']:
   at=pr['attributes'];pos=acc(g,b,at['POSITION']);j=acc(g,b,at['JOINTS_0']).astype(int);w=acc(g,b,at['WEIGHTS_0']);tri=acc(g,b,pr['indices']).reshape(-1,3).astype(int)
   edge=np.concatenate([tri[:,[0,1]],tri[:,[1,2]],tri[:,[2,0]]]);length=np.linalg.norm(pos[edge[:,0]]-pos[edge[:,1]],axis=1);mask=length>.0005;edge=edge[mask];length=length[mask];meshes.append((skin,ib,np.c_[pos,np.ones(len(pos))],j,w,edge,length,pos))
 maxp=0;maxbad=0;waist=0
 for frame in np.linspace(0,count-2,15).astype(int):
  world={}
  def wm(i):
   if i not in world:
    n=ns[i].copy()
    for path in ['rotation','translation','scale']:
     if (i,path) in channels:n[path]=channels[i,path][frame]
    world[i]=(wm(parents[i]) if i in parents else np.eye(4))@mat(n)
   return world[i]
  for i in range(len(ns)):wm(i)
  for skin,ib,pos,j,w,edge,length,rawpos in meshes:
   matrices=np.array([world[k] for k in skin['joints']])@ib;v=np.zeros((len(pos),3))
   for k in range(4):v+=np.einsum('nij,nj->ni',matrices[j[:,k],:3,:],pos)*w[:,k,None]
   ratio=np.linalg.norm(v[edge[:,0]]-v[edge[:,1]],axis=1)/length
   maxp=max(maxp,float(np.quantile(ratio,.995)));maxbad=max(maxbad,float(np.mean(ratio>1.5)))
   pp=rawpos[edge[:,0]];torso=(abs(pp[:,0])<.14)&(pp[:,1]>1.02)&(pp[:,1]<1.25)
   if torso.any():waist=max(waist,float(np.quantile(ratio[torso],.99)))
 summary.update(worstFrameEdgeStretchP995=maxp,worstFrameEdgesOver150Percent=maxbad,waistEdgeStretchP99=waist)
 return summary
if __name__=='__main__':
 reports=[]
 for id in ids[:-1]:
  row={'id':id,'before':measure(root/'source'/f'{id}.glb'),'after':measure(root/'exports'/f'{id}-runtime.glb')};reports.append(row);print(json.dumps(row),flush=True)
 (root/'measurements.json').write_text(json.dumps(reports,indent=2))
