// Conversation owns the existing recorded speech action; no generated body curves.
export class CompanionMotion {
  constructor({player,head,onResume=()=>{}}){this.player=player;this.head=head;this.onResume=onResume;this.state='idle';this.saved=null;this.selections=0;}
  startTake(){
    const p=this.player,index=p.chooseSpeechIndex();
    p.mode='manual';p.manualIndex=index;p.talkIndex=index;p.oneShotPending=false;p.activeEventKind='talk';
    p.transitionTo(index,{duration:1.5,once:true,kind:'conversation'});this.selections++;
  }
  update(){
    const p=this.player;if(this.state!=='speaking'||p.destroyed||!p.playing||p.blend)return;
    if(p.activeAction.time>=p.clips[p.currentIndex].duration-1.6)this.startTake();
  }
  setState(next){
    if(next===this.state)return;const p=this.player;
    if(next!=='idle'&&next!=='error'&&!this.saved){
      this.saved={speech:p.speechRandomEnabled,stretch:p.stretchRandomEnabled,touch:p.touchRandomEnabled,tilt:p.tiltRandomEnabled,head:this.head.enabled};
      p.setRandomEnabled(false);p.setStretchEnabled(false);p.setTouchEnabled(false);p.setTiltEnabled(false);this.head.setEnabled(false);
      if(this.head.active){this.head.active.gesture.action.fadeOut(.7);this.head.active=null;this.head.pending=null;}else this.head.cancelForManualSelection();
      p.oneShotPending=false;p.pendingEventKind=null;
      p.select(p.continuousIndex);p.manualIndex=p.speechIndex;
    }
    if(next==='speaking'){
      this.head.cancelForManualSelection();this.startTake();
    }else if(this.state==='speaking'){
      p.activeEventKind=null;p.mode='manual';p.transitionTo(p.continuousIndex,{time:p.returnPhase,duration:1.5,kind:'conversation'});
    }
    if((next==='idle'||next==='error')&&this.saved){
      const previous=this.saved;this.saved=null;p.manualIndex=p.continuousIndex;p.mode='idle';
      p.setRandomEnabled(previous.speech);p.setStretchEnabled(previous.stretch);p.setTouchEnabled(previous.touch);p.setTiltEnabled(previous.tilt);this.head.setEnabled(previous.head);this.head.cooldown=8;this.onResume();
    }
    this.state=next;
  }
}
