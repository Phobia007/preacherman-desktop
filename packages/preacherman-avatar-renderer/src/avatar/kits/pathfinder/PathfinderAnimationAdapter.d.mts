import type {Group} from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import type {AvatarAnimationPort} from '../../contracts/AvatarAnimationPort';
import type {AvatarActionDescriptor,AvatarMotionState,AvatarAnimationDebugSnapshot,AvatarAnimationError} from '../../types/avatarAnimation';
export declare class PathfinderAnimationAdapter implements AvatarAnimationPort {
 constructor(options:{modelUrl:string;random?:()=>number;loadGLTF?:(url:string)=>Promise<GLTF>;onError?:(error:AvatarAnimationError)=>void});
 load():Promise<void>;listActions():AvatarActionDescriptor[];hasAction(id:string):boolean;play(id:string):Promise<void>;crossFadeTo(id:string):Promise<void>;stop():void;setState(state:AvatarMotionState):Promise<void>;dispose():void;
 update(deltaSeconds:number):void;setRandomEnabled(enabled:boolean):void;getRoot():Group|null;getDebugSnapshot():AvatarAnimationDebugSnapshot;subscribeDebug(listener:(snapshot:AvatarAnimationDebugSnapshot)=>void):()=>void;
 listExpressions():{id:string;label:string;column:number;row:number}[];setExpression(id:string):Promise<void>;setEmotion(id:string,options?:{durationSeconds?:number}):Promise<void>;clearEmotion():Promise<void>;setAutomaticExpressions(enabled:boolean):Promise<void>;setSpeechLevel(level:number):Promise<void>;
 beginAITurn():Promise<number>;applyAIReply(raw:unknown,options?:{turnId?:number}):Promise<{text:string;expression:string;expressionFallback:boolean;turnId:number;accepted:boolean}>;startAIReplySpeech(turnId?:number):Promise<boolean>;finishAIReply(turnId?:number):Promise<boolean>;cancelAITurn():Promise<number>;
}
export declare const pathfinderAIReplySchema:Record<string,unknown>;
export declare const pathfinderExpressionInstructions:string;
export declare function normalizeAIReply(raw:unknown):{text:string;expression:string;expressionFallback:boolean};
export declare const pathfinderAvatarProfile:{avatarId:string;rigId:string;modelFile:string;defaultActionId:string;jawBone:null;actions:AvatarActionDescriptor[];stateMap:Record<AvatarMotionState,string>;transform:{rotationY:number;scale:number;verticalOffset:number};};
