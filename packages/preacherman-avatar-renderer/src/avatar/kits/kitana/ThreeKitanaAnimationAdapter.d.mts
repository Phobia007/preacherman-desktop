import type {Group} from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import type {AvatarAnimationPort} from '../../contracts/AvatarAnimationPort';
import type {AvatarActionDescriptor,AvatarMotionState,PlayActionOptions,AvatarAnimationDebugSnapshot,AvatarAnimationError} from '../../types/avatarAnimation';
export interface KitanaFaceOptions {expressionId?: 'neutral'|'gentle_smile'|'friendly_smile'|'attentive'|'soft_concern'|'curious_question'|'soft_surprise';emotion?: 'neutral'|'warm'|'concerned'|'curious';intensity?:number;}
export interface KitanaRandomOptions {speech?:boolean;stretch?:boolean;hand?:boolean;headTilt?:boolean;look?:boolean;}
export declare class ThreeKitanaAnimationAdapter implements AvatarAnimationPort {
 constructor(options:{modelUrl:string;random?:()=>number;onError?:(error:AvatarAnimationError)=>void;loadGLTF?:(url:string)=>Promise<GLTF>});
 load():Promise<void>;listActions():AvatarActionDescriptor[];hasAction(id:string):boolean;play(id:string,options?:PlayActionOptions):Promise<void>;crossFadeTo(id:string,duration?:number):Promise<void>;stop(id?:string):void;
 setState(state:AvatarMotionState,face?:KitanaFaceOptions):Promise<void>;beginSpeaking(face?:KitanaFaceOptions):Promise<void>;endSpeaking():void;interrupt():void;playExpression(id:string,intensity?:number):Promise<boolean>;audioEnergy(energy:number):void;
 setRandomEvents(options:KitanaRandomOptions):void;update(deltaSeconds:number):void;getRoot():Group|null;getDebugSnapshot():AvatarAnimationDebugSnapshot;subscribeDebug(listener:(snapshot:AvatarAnimationDebugSnapshot)=>void):()=>void;dispose():void;
}
export declare const kitanaAvatarProfile:{avatarId:string;rigId:string;modelFile:string;defaultActionId:string;actions:AvatarActionDescriptor[];stateMap:Record<AvatarMotionState,string>;transform:{rotationY:number;scale:number;verticalOffset:number};jawBone:string;};
export declare const expressionCatalog:readonly {id:string;label:string;emotion:string;duration:number}[];
