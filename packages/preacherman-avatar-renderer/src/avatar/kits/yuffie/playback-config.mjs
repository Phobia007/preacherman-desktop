export const playbackConfig = Object.freeze({
  "schemaVersion": 1,
  "clips": {
    "idle": "yuffie.idle.feri.standing.v1",
    "in_the_balance": "yuffie.gesture.feri.in_the_balance.v1",
    "small_swing": "yuffie.gesture.feri.small_swing.v1",
    "hand_on_hip": "yuffie.gesture.feri.hand_on_hip.v1"
  },
  "labels": {
    "idle": "自然站立",
    "in_the_balance": "平衡小动作",
    "small_swing": "轻轻摆动",
    "hand_on_hip": "单手扶腰"
  },
  "autoEventKeys": [
    "small_swing",
    "hand_on_hip"
  ],
  "randomGapPlaybackSeconds": 10,
  "transitionSeconds": 1.5
});
