import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from audit import *
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
for id in ['nier-automata-2b','the-twins-atomic-heart']:
 g,b=read(root/'source'/f'{id}.glb');results=[]
 for mi,mesh in enumerate(g['meshes']):
  for pi,pr in enumerate(mesh['primitives']):
   pos=acc(g,b,pr['attributes']['POSITION']);tri=acc(g,b,pr['indices']).reshape(-1,3).astype(int)
   unique,inverse=np.unique(np.round(pos,5),axis=0,return_inverse=True);wt=inverse[tri];edges=np.concatenate([wt[:,[0,1]],wt[:,[1,2]],wt[:,[2,0]]])
   n,labels=connected_components(coo_matrix((np.ones(len(edges)),(edges[:,0],edges[:,1])),shape=(len(unique),len(unique))).tocsr(),directed=False)
   vl=labels[inverse];rows=[]
   for k in range(n):
    points=pos[vl==k]
    if len(points)<100:continue
    row={'label':int(k),'vertices':len(points),'min':points.min(0).round(4).tolist(),'max':points.max(0).round(4).tolist()};rows.append(row)
   print(id,mi,pi,'components',n,'large',rows)
   results.append({'mesh':mi,'primitive':pi,'parts':rows})
   np.save(root/f'{id}-{mi}-{pi}-components.npy',vl)
 (root/f'{id}-components.json').write_text(json.dumps(results,indent=2))
