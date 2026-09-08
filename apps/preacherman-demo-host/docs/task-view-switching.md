# Task index transitions

Featured and All are alternative index views, not layered project sheets. Their
route transition now uses out-in ownership: complete the old page's leave callback
synchronously before mounting the next page. This prevents the HTML timeline and
the WebGL card rail remaining visible together during quick repeated switches.

The shared authored entry timeline, card reveal, hover video, date scroll damping,
and transitions between cards and project details remain unchanged. Only the two
directions between / and /full select this policy. Both index views check disposal
after asynchronous cover loading, nextTick and renderer boot before touching the
shared renderer. Task records and preferences are not changed.

Regression coverage includes repeated 60/180/420/600ms switching in both appearance
modes, per-animation-frame exclusive page ownership, normal final content, timeline
hover and independent scroll, plus card-detail and shared desktop navigation checks.
