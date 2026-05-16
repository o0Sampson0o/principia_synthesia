function LissajousCurves() {
  var canvas = document.getElementById("canvas");
  var ctx = canvas.getContext("2d");

  var t = 0;
  var phase = 0;
  var trailPoints = [];
  var MAX_TRAIL = 2000;

  var A_FREQ = 3;
  var B_FREQ = 2;
  var PHASE_SPEED = 0.004;
  var FREQ_CYCLE = 0;

  function resize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resize();

  function draw() {
    var w = canvas.width;
    var h = canvas.height;
    var cx = w / 2;
    var cy = h / 2;
    var r = Math.min(w, h) * 0.38;

    // Slowly shift frequency ratio over time
    FREQ_CYCLE += 0.0005;
    A_FREQ = 3 + Math.sin(FREQ_CYCLE * 0.7) * 0.0;
    B_FREQ = 2 + Math.sin(FREQ_CYCLE * 0.5) * 0.0;
    phase += PHASE_SPEED;

    var x = cx + r * Math.sin(A_FREQ * t + phase);
    var y = cy + r * Math.sin(B_FREQ * t);

    trailPoints.push({ x: x, y: y });
    if (trailPoints.length > MAX_TRAIL) trailPoints.shift();

    // Fade background
    ctx.fillStyle = window.theme.background;
    ctx.globalAlpha = 0.15;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    // Draw trail
    for (var i = 1; i < trailPoints.length; i++) {
      var alpha = i / trailPoints.length;
      ctx.beginPath();
      ctx.strokeStyle = window.theme.primaryBtn;
      ctx.globalAlpha = alpha * 0.85;
      ctx.lineWidth = 1.5;
      ctx.moveTo(trailPoints[i - 1].x, trailPoints[i - 1].y);
      ctx.lineTo(trailPoints[i].x, trailPoints[i].y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Draw current point
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = window.theme.foreground;
    ctx.fill();

    // Label
    ctx.fillStyle = window.theme.foreground;
    ctx.globalAlpha = 0.4;
    ctx.font = "11px monospace";
    ctx.fillText("a=" + A_FREQ.toFixed(0) + "  b=" + B_FREQ.toFixed(0) + "  δ=" + phase.toFixed(2), 10, h - 10);
    ctx.globalAlpha = 1;

    t += 0.03;

    // Reset trail when phase completes a full cycle
    if (phase > Math.PI * 2) {
      phase -= Math.PI * 2;
      trailPoints = [];
    }

    requestAnimationFrame(draw);
  }

  ctx.fillStyle = window.theme.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  draw();
}
