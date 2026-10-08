export const profile={
  "avatarId": "apex-legend-pathfinder",
  "rigId": "apex-legend-pathfinder",
  "modelFile": "apex-legend-pathfinder-runtime.glb",
  "defaultActionId": "idle.default",
  "jawBone": null,
  "actions": [
    {
      "id": "idle.default",
      "clipName": "pathfinder.idle.male.complete.v1",
      "category": "idle",
      "loop": "repeat",
      "fadeIn": 0.55,
      "fadeOut": 0.55,
      "timeScale": 1,
      "priority": 10,
      "interruptible": true
    },
    {
      "id": "idle.stand",
      "clipName": "pathfinder.idle.male.stand.v1",
      "category": "idle",
      "loop": "repeat",
      "fadeIn": 0.55,
      "fadeOut": 0.55,
      "timeScale": 1,
      "priority": 10,
      "interruptible": true
    },
    {
      "id": "idle.sway",
      "clipName": "pathfinder.idle.male.sway.v1",
      "category": "idle",
      "loop": "repeat",
      "fadeIn": 0.55,
      "fadeOut": 0.55,
      "timeScale": 1,
      "priority": 10,
      "interruptible": true
    },
    {
      "id": "gesture.swing",
      "clipName": "pathfinder.gesture.male.swing.v1",
      "category": "gesture",
      "loop": "once",
      "fadeIn": 1,
      "fadeOut": 1,
      "timeScale": 1,
      "priority": 20,
      "interruptible": true,
      "fallback": "idle.default"
    },
    {
      "id": "gesture.look",
      "clipName": "pathfinder.gesture.male.look.v1",
      "category": "gesture",
      "loop": "once",
      "fadeIn": 1,
      "fadeOut": 1,
      "timeScale": 0.65,
      "priority": 20,
      "interruptible": true,
      "fallback": "idle.default"
    },
    {
      "id": "idle.original",
      "clipName": "apex-legend-pathfinder.idle.happy.v2",
      "category": "gesture",
      "loop": "once",
      "fadeIn": 0.65,
      "fadeOut": 0.65,
      "timeScale": 1,
      "priority": 20,
      "interruptible": true,
      "fallback": "idle.default"
    },
    {
      "id": "talk.conversation",
      "clipName": "pathfinder.talk.rokoko.conversation.v1",
      "category": "talk",
      "loop": "once",
      "fadeIn": 1.3,
      "fadeOut": 1.3,
      "timeScale": 1,
      "priority": 30,
      "interruptible": true,
      "fallback": "idle.default"
    },
    {
      "id": "talk.chatting",
      "clipName": "pathfinder.talk.rokoko.chatting.v1",
      "category": "talk",
      "loop": "once",
      "fadeIn": 1.3,
      "fadeOut": 1.3,
      "timeScale": 1,
      "priority": 30,
      "interruptible": true,
      "fallback": "idle.default"
    },
    {
      "id": "talk.chatting02",
      "clipName": "pathfinder.talk.rokoko.chatting02.v1",
      "category": "talk",
      "loop": "once",
      "fadeIn": 1.3,
      "fadeOut": 1.3,
      "timeScale": 1,
      "priority": 30,
      "interruptible": true,
      "fallback": "idle.default"
    }
  ],
  "stateMap": {
    "idle": "idle.default",
    "listening": "idle.default",
    "thinking": "idle.default",
    "speaking": "talk.conversation",
    "success": "idle.default",
    "error": "idle.default",
    "sleeping": "idle.default",
    "wakeup": "idle.default"
  },
  "transform": {
    "rotationY": 0,
    "scale": 1,
    "verticalOffset": 0
  }
};
export const modelSHA256="50c081c9f40fee69ae2deb48060a73720f8874b1a150332c28768005d112a50f";
