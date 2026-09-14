import bpy, json, sys
from pathlib import Path
import os
R=Path(os.environ['PREACHERMAN_RIG_WORKDIR'])
sources={'actorcore_talk':str(R/'input/stand-talk-378997.fbx'),'zombie':'D:/开源项目/Zombie_Idle.fbx','button':'D:/开源项目/Button_Pushing.fbx','catwalk_twist':'D:/开源项目/Catwalk_Idle_To_Twist_R.fbx'}
def info(rig):
 return {'name':rig.name,'matrix':[list(r) for r in rig.matrix_world],'bones':{b.name:{'parent':b.parent.name if b.parent else None,'head':list(rig.matrix_world@b.head_local),'matrix':[list(r) for r in rig.matrix_world@b.matrix_local]} for b in rig.data.bones}}
summary=[]
for key,file in sources.items():
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.fbx(filepath=file)
 rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');scene=bpy.context.scene;action=rig.animation_data.action
 data=info(rig);data.update(source=file,action=action.name,fps=scene.render.fps,start=action.frame_range[0],end=action.frame_range[1])
 frames=[]
 for frame in range(int(action.frame_range[0]),int(action.frame_range[1])+1):
  scene.frame_set(frame);frames.append({p.name:{'rotation':list((rig.matrix_world@p.matrix).to_quaternion()),'head':list(rig.matrix_world@p.head)} for p in rig.pose.bones})
 data['frames']=frames
 (R/'inspection'/f'{key}-source.json').write_text(json.dumps(data))
 summary.append({k:data[k] for k in ['source','action','fps','start','end']});summary[-1]['bones']=list(data['bones'])
