import bpy, json, math, struct, hashlib
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
import os
R=Path(os.environ.get('PREACHERMAN_RIG_WORKDIR',str(Path(__file__).parent)))
CONFIG=[('halloween-the-game-michael-myers-samhain', 'zombie'), ('zima', 'button'), ('nier-automata-2b', 'catwalk_twist'), ('kitana-mk11-in-mk9-suit', 'actorcore_talk'), ('stellar-blade-lily-stargazer-coat', 'actorcore_talk'), ('the-twins-atomic-heart', 'actorcore_talk')]
REPARENT={'kitana-mk11-in-mk9-suit':('spine 1','pelvis'), 'stellar-blade-lily-stargazer-coat':('Ab-PT-AXX','Bip001-Pelvis')}
BONE_MAPPINGS=json.loads((Path(__file__).parent/'bone-mappings.json').read_text())
def mixamo_mapping(names):
 m={'b_pelvis':'Hips','b_spine0':'Spine','b_spine1':'Spine1','b_spine3':'Spine2','b_neck0':'Neck','b_head':'Head'}
 for side,label in [('l','Left'),('r','Right')]:
  for part,suffix in {'thigh':'UpLeg','calf':'Leg','foot':'Foot','toe':'ToeBase','clav':'Shoulder','upperarm':'Arm','forearm':'ForeArm','hand':'Hand'}.items():m[f'b_{side}_{part}']=label+suffix
  for digit in ['thumb','index','middle','ring','pinky']:
   for n in [1,2,3]:m[f'b_{side}_{digit}{n}']=label+'Hand'+digit.capitalize()+str(n)
 return {n:'mixamorig:'+v for n,v in m.items() if 'mixamorig:'+v in names}
def actorcore_mapping(names):
 m={'b_pelvis':'CC_Base_Hip','b_spine0':'CC_Base_Waist','b_spine1':'CC_Base_Spine01','b_spine3':'CC_Base_Spine02','b_neck0':'CC_Base_NeckTwist01','b_head':'CC_Base_Head'}
 for s,side in [('l','L'),('r','R')]:
  for part,suffix in {'thigh':'Thigh','calf':'Calf','foot':'Foot','toe':'ToeBase','clav':'Clavicle','upperarm':'Upperarm','forearm':'Forearm','hand':'Hand'}.items():m[f'b_{s}_{part}']=f'CC_Base_{side}_{suffix}'
  for digit,label in [('thumb','Thumb'),('index','Index'),('middle','Mid'),('ring','Ring'),('pinky','Pinky')]:
   for n in [1,2,3]:m[f'b_{s}_{digit}{n}']=f'CC_Base_{side}_{label}{n}'
 return {s:n for s,n in m.items() if n in names}

def basis(heads,mapping):
 left=Vector(heads[mapping['b_l_upperarm']])-Vector(heads[mapping['b_r_upperarm']]);left.z=0;left.normalize()
 up=Vector((0,0,1));return Matrix((left.cross(up).normalized(),left,up)).transposed().to_quaternion()
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)

def anatomical_frame(direction,across):
 y=direction.normalized();x=(across-y*across.dot(y)).normalized();z=x.cross(y).normalized()
 return Matrix((x,y,z)).transposed().to_quaternion()

def auxiliary_plan(rig,mapping,rest):
 inverse={n:s for s,n in mapping.items()};plans={}
 for b in rig.data.bones:
  if b.name in inverse or not any(t in b.name.lower() for t in ['twist',' roll']):continue
  if 'cor' in b.name.lower():continue # Corrective children follow their driven twist parent.
  ancestor=next((p for p in b.parent_recursive if p.name in inverse),None)
  if not ancestor:continue
  semantic=inverse[ancestor.name];part=semantic.split('_')[-1];side=semantic.split('_')[1]
  nextpart={'upperarm':'forearm','forearm':'hand','thigh':'calf','calf':'foot'}.get(part)
  if not nextpart:continue
  end=mapping.get(f'b_{side}_{nextpart}')
  if not end:continue
  axis=rest[end].translation-rest[ancestor.name].translation
  fraction=(rest[b.name].translation-rest[ancestor.name].translation).dot(axis)/axis.length_squared
  plans[b.name]=(ancestor.name,end,max(.2,min(.85,fraction)))
 return plans

def twist_about(q,axis):
 v=Vector((q.x,q.y,q.z));projected=axis*v.dot(axis);twist=Quaternion((q.w,*projected))
 if twist.magnitude<1e-8:return Quaternion()
 twist.normalize()
 if twist.w<0:twist.negate()
 return twist
def glb_read(path):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);return doc,bytearray(raw[28+n:28+n+struct.unpack_from('<I',raw,20+n)[0]])
def node_matrix(n):
 if 'matrix' in n:return Matrix([n['matrix'][i:i+4] for i in range(0,16,4)]).transposed()
 q=n.get('rotation',[0,0,0,1]);return Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((q[3],*q[:3])),Vector(n.get('scale',[1,1,1])))
def export_animation(id,key,rig,mapping,samples):
 source=R/'source'/f'{id}.glb';prepared=R/'rig-input'/f'{id}.glb';g,buffer=glb_read(prepared if prepared.exists() else source);old_binary=bytes(buffer)
 if id in REPARENT:
  child,parent=REPARENT[id];ni={n.get('name'):i for i,n in enumerate(g['nodes'])};sp=ni[child];hip=ni[parent];oldparent=next(n for n in g['nodes'] if sp in n.get('children',[]));oldparent['children'].remove(sp);g['nodes'][hip].setdefault('children',[]).append(sp)
 parents={child:i for i,node in enumerate(g['nodes']) for child in node.get('children',[])};world={}
 def worldmat(i):
  if i not in world:world[i]=(worldmat(parents[i]) if i in parents else Matrix.Identity(4))@node_matrix(g['nodes'][i])
  return world[i]
 for i in range(len(g['nodes'])):worldmat(i)
 byname={n['name']:i for i,n in enumerate(g['nodes']) if 'name' in n}
 C=Matrix.Rotation(math.pi/2,4,'X');Ci=C.inverted()
 bind={b.name:rig.matrix_world@b.matrix_local for b in rig.data.bones}
 bones={name:byname[name] for name in bind if name in byname}
 # Imported Blender rest bones follow inverse-bind matrices, while old GLB
 # node transforms may contain constants baked from the previous idle.
 bind_world={}
 for skin_index,skin in enumerate(g['skins']):
  mesh_index=next(i for i,n in enumerate(g['nodes']) if n.get('skin')==skin_index)
  acc=g['accessors'][skin['inverseBindMatrices']];view=g['bufferViews'][acc['bufferView']];off=view.get('byteOffset',0)+acc.get('byteOffset',0)
  for j,node in enumerate(skin['joints']):
   vals=struct.unpack_from('<16f',old_binary,off+j*64);ib=Matrix([vals[k:k+4] for k in range(0,16,4)]).transposed()
   bind_world[node]=ib.inverted()
 if id in REPARENT:
  child,parent=REPARENT[id];i=byname[child];p=byname[parent];loc,q,s=(bind_world[p].inverted()@bind_world[i]).decompose();g['nodes'][i].update(translation=list(loc),rotation=[q.x,q.y,q.z,q.w],scale=list(s));world.clear()
  for j in range(len(g['nodes'])):worldmat(j)
 corrections={name:bind[name].inverted()@C@bind_world.get(i,world[i]) for name,i in bones.items()}
 print('BIND_HEAD_ERROR',id,max(((C@bind_world.get(i,world[i])).translation-bind[name].translation).length for name,i in bones.items()),flush=True)
 rows={i:{'rotation':[],'translation':[]} for i in bones.values()};last={}
 for frame,time in samples:
  bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
  posed={i:Ci@rig.matrix_world@rig.pose.bones[name].matrix@corrections[name] for name,i in bones.items()}
  for name,i in bones.items():
   parent=parents.get(i);parent_world=posed.get(parent,world.get(parent,Matrix.Identity(4)))
   mat=parent_world.inverted()@posed[i];loc,q,scale=mat.decompose()
   if i in last and q.dot(last[i])<0:q.negate()
   last[i]=q.copy();rows[i]['rotation'].append([q.x,q.y,q.z,q.w]);rows[i]['translation'].append(list(loc))
 def accessor(values,kind):
  while len(buffer)%4:buffer.append(0)
  offset=len(buffer);flat=[x for row in values for x in row];buffer.extend(struct.pack('<'+'f'*len(flat),*flat));vi=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(flat)*4})
  item={'bufferView':vi,'componentType':5126,'count':len(values),'type':kind}
  if kind=='SCALAR':item.update(min=[min(flat)],max=[max(flat)])
  ai=len(g['accessors']);g['accessors'].append(item);return ai
 times=accessor([[time] for _,time in samples],'SCALAR');channels=[];samplers=[];seam=0
 for i,paths in rows.items():
  for path,values in paths.items():
   default=g['nodes'][i].get(path,[0,0,0,1] if path=='rotation' else [0,0,0])
   changed=max(abs(x-y) for v in values for x,y in zip(v,default))
   if path=='rotation':changed=min(changed,max(abs(x+y) for v in values for x,y in zip(v,default)))
   if changed<2e-5:continue
   if path=='translation' and g['nodes'][i]['name']!=mapping['b_pelvis']:
    assert changed<.002,(id,g['nodes'][i]['name'],changed)
    continue
   values[-1]=values[0][:]
   output=accessor(values,'VEC4' if path=='rotation' else 'VEC3');si=len(samplers);samplers.append({'input':times,'output':output,'interpolation':'LINEAR'});channels.append({'sampler':si,'target':{'node':i,'path':path}})
 name=f'{id}.idle.{key}.v3';g['animations']=[{'name':name,'channels':channels,'samplers':samplers}];g['buffers'][0]['byteLength']=len(buffer)
 assert bytes(buffer[:len(old_binary)])==old_binary
 doc=json.dumps(g,separators=(',',':'),ensure_ascii=False).encode();doc+=b' '*((-len(doc))%4);buffer+=b'\0'*((-len(buffer))%4)
 output=R/'exports'/f'{id}-runtime.glb';output.write_bytes(struct.pack('<III',0x46546c67,2,28+len(doc)+len(buffer))+struct.pack('<II',len(doc),0x4e4f534a)+doc+struct.pack('<II',len(buffer),0x004e4942)+buffer)
 return {'clip':name,'channels':len(channels),'duration':samples[-1][1],'runtimeSha256':hashlib.sha256(output.read_bytes()).hexdigest(),'runtimeBytes':output.stat().st_size,'originalBinarySha256':hashlib.sha256(old_binary).hexdigest(),'originalBinaryBytes':len(old_binary),'originalMeshSkinMaterialImageBuffersUnchanged':True,'loopSeam':seam}
def run(id,key):
 bpy.ops.wm.read_factory_settings(use_empty=True);prepared=R/'rig-input'/f'{id}.glb';bpy.ops.import_scene.gltf(filepath=str(prepared if prepared.exists() else R/'source'/f'{id}.glb'))
 rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');rig.animation_data_clear()
 if id in REPARENT:
  child,parent=REPARENT[id];bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT');rig.data.edit_bones[child].parent=rig.data.edit_bones[parent];bpy.ops.object.mode_set(mode='OBJECT')
 for b in rig.pose.bones:b.matrix_basis.identity();b.rotation_mode='QUATERNION'
 bpy.context.view_layer.update();mapping=dict(BONE_MAPPINGS[id])
 data=json.loads((R/'inspection'/f'{key}-source.json').read_text());sm=(actorcore_mapping if key=='actorcore_talk' else mixamo_mapping)(data['bones']);mapping={s:t for s,t in mapping.items() if s in sm}
 src_heads={s:data['bones'][n]['head'] for s,n in sm.items()};heads={b.name:rig.matrix_world@b.head_local for b in rig.data.bones}
 align=basis(heads,mapping)@basis(src_heads,{s:s for s in src_heads}).inverted();wr=rig.matrix_world.to_quaternion();wi=rig.matrix_world.inverted();rest={b.name:b.matrix_local.copy() for b in rig.data.bones}
 sr={s:Matrix(data['bones'][n]['matrix']).to_quaternion() for s,n in sm.items()};correction={t:(rig.matrix_world@rest[t]).to_quaternion() for t in mapping.values()}
 for side in ['l','r']:
  for a,b in [('upperarm','forearm'),('forearm','hand'),('thigh','calf'),('calf','foot'),('hand','middle1')]:
   sn=f'b_{side}_{a}';child=f'b_{side}_{b}'
   if child not in mapping:continue
   tn=mapping[sn];td=(heads[mapping[child]]-heads[tn]).normalized();sd=align@(Vector(src_heads[child])-Vector(src_heads[sn])).normalized();correction[tn]=td.rotation_difference(sd)@correction[tn]
  hand=mapping[f'b_{side}_hand'];swing=correction[hand]@(rig.matrix_world@rest[hand]).to_quaternion().inverted()
  for digit in ['thumb','index','middle','ring','pinky']:
   for n in [1,2,3]:
    name=mapping.get(f'b_{side}_{digit}{n}')
    if name:correction[name]=swing@correction[name]
  for part in ['foot','toe']:
   sn=f'b_{side}_{part}';tn=mapping[sn];sr[sn]=Quaternion(data['frames'][0][sm[sn]]['rotation']);correction[tn]=(rig.matrix_world@rest[tn]).to_quaternion()
 # Match palm orientation as well as its pointing direction. A direction-only
 # match leaves wrist roll and pre-bent fingers in the donor's coordinate frame.
 for side in ['l','r']:
  keys=[f'b_{side}_{p}' for p in ['hand','middle1','index1','pinky1']]
  if not all(s in mapping for s in keys):continue
  hand,mid,index,pinky=keys
  tf=anatomical_frame(heads[mapping[mid]]-heads[mapping[hand]],heads[mapping[index]]-heads[mapping[pinky]])
  sf=anatomical_frame(align@(Vector(src_heads[mid])-Vector(src_heads[hand])),align@(Vector(src_heads[index])-Vector(src_heads[pinky])))
  palm=sf@tf.inverted();correction[mapping[hand]]=palm@(rig.matrix_world@rest[mapping[hand]]).to_quaternion()
  across_t=heads[mapping[index]]-heads[mapping[pinky]];across_s=align@(Vector(src_heads[index])-Vector(src_heads[pinky]))
  for digit in ['thumb','index','middle','ring','pinky']:
   for n in [1,2,3]:
    sn=f'b_{side}_{digit}{n}';child=f'b_{side}_{digit}{n+1}'
    if sn not in mapping:continue
    tn=mapping[sn]
    if child in mapping:
     td=heads[mapping[child]]-heads[tn];sd=align@(Vector(src_heads[child])-Vector(src_heads[sn]))
     finger=anatomical_frame(sd,across_s)@anatomical_frame(td,across_t).inverted()
    else:finger=palm
    correction[tn]=finger@(rig.matrix_world@rest[tn]).to_quaternion()
 ordered=sorted(rig.data.bones,key=lambda b:len(b.parent_recursive));inverse={t:s for s,t in mapping.items()}
 aux=auxiliary_plan(rig,mapping,rest)
 # Intermediate spine/neck joints share the bending between mapped anchors.
 gaps={}
 for start,end in [('b_spine1','b_spine3'),('b_neck0','b_head')]:
  chain=[];b=rig.data.bones[mapping[end]].parent
  while b and b.name!=mapping[start]:chain.append(b.name);b=b.parent
  if b:
   a=rest[mapping[start]].translation;z=rest[mapping[end]].translation
   for name in chain:
    if name not in inverse:gaps[name]=(mapping[start],mapping[end],max(0,min(1,(rest[name].translation-a).length/(z-a).length)))
 origin=heads[mapping['b_pelvis']];src_rest=Vector(src_heads['b_pelvis']);src_first=Vector(data['frames'][0][sm['b_pelvis']]['head'])
 length=lambda h,m:sum((Vector(h[m['b_l_'+a]])-Vector(h[m['b_l_'+b]])).length for a,b in [('thigh','calf'),('calf','foot')])
 ratio=length(heads,mapping)/length(src_heads,{s:s for s in src_heads})
 feet={side:wi@heads[mapping[f'b_{side}_foot']] for side in ['l','r']};errors=[]
 def make_poses(qs,pelvis):
  poses={}
  for b in ordered:
   args={'parent_matrix':poses[b.parent.name],'parent_matrix_local':rest[b.parent.name]} if b.parent else {}
   mat=b.convert_local_to_pose(Matrix.Identity(4),rest[b.name],**args)
   if b.name in qs:mat=Matrix.LocRotScale(mat.translation,qs[b.name],mat.to_scale())
   if b.name==mapping['b_pelvis']:mat.translation=pelvis
   poses[b.name]=mat
  return poses
 duration=(len(data['frames'])-1)/data['fps'];cycle=duration if key in ['zombie','actorcore_talk'] else (duration*2+1.2 if key=='catwalk_twist' else duration+1.4)
 scene=bpy.context.scene;scene.render.fps=60;scene.frame_start=1;scene.frame_end=round(cycle*60)+1
 rig.animation_data_create();act=bpy.data.actions.new(f'{id}.idle.{key}.v3');rig.animation_data.action=act;last={};samples=[]
 for frame in range(1,scene.frame_end+1):
  time=(frame-1)/60;t=min(time,duration);back=0
  if key in ['zombie','actorcore_talk']:back=smooth((time-duration+.3)/.3)
  elif key=='catwalk_twist':
   # Ease speed to zero before reversing this one-way source transition.
   t=min(duration,max(0,2*duration+.4-time)) if time>duration else time
   edge=.3
   if t<edge:t=edge*((t/edge)**2*(2-t/edge))
   elif t>duration-edge:t=duration-edge*((duration-t)/edge)**2*(2-(duration-t)/edge)
  elif time>duration:back=smooth((time-duration)/.65)
  idx=min(len(data['frames'])-1,round(t*data['fps']));sample=data['frames'][idx];qs={}
  for tn,sn in inverse.items():
   q=Quaternion(sample[sm[sn]]['rotation']).slerp(Quaternion(data['frames'][0][sm[sn]]['rotation']),back)
   qs[tn]=wr.inverted()@align@q@sr[sn].inverted()@align.inverted()@correction[tn]
  shift=Vector(sample[sm['b_pelvis']]['head']).lerp(src_first,back)-src_rest;shift.x-=src_first.x-src_rest.x;shift.y-=src_first.y-src_rest.y
  pelvis=wi@(origin+(align@shift)*ratio);poses=make_poses(qs,pelvis);goals={}
  for side in ['l','r']:
   sn=f'b_{side}_foot';motion=Vector(sample[sm[sn]]['head']).lerp(Vector(data['frames'][0][sm[sn]]['head']),back)-Vector(data['frames'][0][sm[sn]]['head'])
   goals[side]=feet[side]+wi.to_3x3()@(align@motion*ratio)
  # Keep both legs reachable without allowing a raised pelvis to pull the feet up.
  up=(wi.to_3x3()@Vector((0,0,1))).normalized();lower=0
  for side in ['l','r']:
   thigh,calf,foot=[mapping[f'b_{side}_{p}'] for p in ['thigh','calf','foot']];h,k,a=[poses[n].translation for n in [thigh,calf,foot]]
   reach=((k-h).length+(a-k).length)*.999;offset=h-goals[side];vertical=offset.dot(up);horizontal=(offset-up*vertical).length
   lower=max(lower,vertical-math.sqrt(max(0,reach*reach-horizontal*horizontal)))
  pelvis-=up*max(0,lower);poses=make_poses(qs,pelvis)
  # Solve against each character's own limb lengths, never source translations on limbs.
  for side in ['l','r']:
   thigh,calf,foot=[mapping[f'b_{side}_{p}'] for p in ['thigh','calf','foot']];h,k,a=[poses[n].translation for n in [thigh,calf,foot]];goal=goals[side]
   l1=(k-h).length;l2=(a-k).length;axis=(goal-h).normalized();dist=min((goal-h).length,l1+l2-1e-6);dist=max(abs(l1-l2)+1e-6,dist);along=(l1*l1-l2*l2+dist*dist)/(2*dist)
   pole=(k-h)-axis*(k-h).dot(axis)
   forward=wr.inverted()@(basis(heads,mapping)@Vector((1,0,0)));forward-=axis*forward.dot(axis)
   if pole.length<.015*l1:
    pole=forward.normalized().lerp(pole.normalized() if pole.length>1e-8 else forward.normalized(),smooth(pole.length/(.015*l1)))
   new_k=h+axis*along+pole.normalized()*math.sqrt(max(0,l1*l1-along*along));qs[thigh]=(k-h).rotation_difference(new_k-h)@qs[thigh];qs[calf]=(a-k).rotation_difference(goal-new_k)@qs[calf]
   poses=make_poses(qs,pelvis);errors.append((rig.matrix_world.to_3x3()@(poses[foot].translation-goal)).length)
  for name,(a,b,f) in gaps.items():
   da=qs[a]@rest[a].to_quaternion().inverted();db=qs[b]@rest[b].to_quaternion().inverted()
   qs[name]=da.slerp(db,f)@rest[name].to_quaternion()
  poses=make_poses(qs,pelvis)
  for name,(a,b,f) in aux.items():
   da=poses[a].to_quaternion()@rest[a].to_quaternion().inverted();db=poses[b].to_quaternion()@rest[b].to_quaternion().inverted()
   axis=(poses[b].translation-poses[a].translation).normalized()
   q=Quaternion().slerp(twist_about(db@da.inverted(),axis),f)@da
   qs[name]=q@rest[name].to_quaternion()
  poses=make_poses(qs,pelvis)
  for b in ordered:
   if b.name not in qs:continue
   pb=rig.pose.bones[b.name];args={'parent_matrix':poses[b.parent.name],'parent_matrix_local':rest[b.parent.name]} if b.parent else {}
   pb.matrix_basis=b.convert_local_to_pose(poses[b.name],rest[b.name],invert=True,**args);pb.scale=(1,1,1)
   if b.name!=mapping['b_pelvis']:pb.location=(0,0,0)
   q=pb.rotation_quaternion.copy()
   if b.name in last and q.dot(last[b.name])<0:q.negate();pb.rotation_quaternion=q
   last[b.name]=q;pb.keyframe_insert('rotation_quaternion',frame=frame,group=b.name)
   if b.name==mapping['b_pelvis']:pb.keyframe_insert('location',frame=frame,group=b.name)
  samples.append((frame,time))
 scene.frame_set(1);bpy.context.view_layer.update();bpy.ops.wm.save_as_mainfile(filepath=str(R/'ready'/f'{id}.blend'),compress=True)
 report=export_animation(id,key,rig,mapping,samples);report.update(id=id,source=data['source'],sourceSha256=hashlib.sha256(Path(data['source']).read_bytes()).hexdigest(),sourceDuration=duration,sourceFps=data['fps'],sampleFps=60,boneMapping=mapping,auxiliaryBones=list(aux),distributedSpineBones=list(gaps),hierarchyRepair=' follows '.join(REPARENT[id]) if id in REPARENT else None,footGoalMaxError=max(errors),originalGLBSha256=hashlib.sha256((R/'source'/f'{id}.glb').read_bytes()).hexdigest(),loopMode='preserve source with eased return and matched seam')
 if prepared.exists():
  _,original=glb_read(R/'source'/f'{id}.glb');report.update(originalBinarySha256=hashlib.sha256(original).hexdigest(),originalBinaryBytes=len(original),bindRepair=json.loads((R/'inspection/twin-bind-repair.json').read_text()))
 (R/'inspection'/f'{id}-retarget.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='boneMapping'}),flush=True)
if __name__=='__main__':
 import sys
 selected=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
 for id,key in CONFIG:
  if not selected or id in selected:run(id,key)
