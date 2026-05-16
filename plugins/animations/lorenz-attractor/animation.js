function LorenzAttractor() {
  var canvas = document.getElementById("canvas");
  var ctx = canvas.getContext("2d");

  function resize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }
  resize();

  // Lorenz parameters
  var sigma = 10;
  var rho = 28;
  var beta = 8 / 3;
  var dt = 0.005;

  // Initial state
  var x = 0.1, y = 0, z = 0;
  var points = [];
  var MAX_POINTS = 3000;

  // Pre-run to settle onto attractor
  for (var i = 0; i < 500; i++) {
    var dx = sigma * (y - x);
    var dy = x * (rho - z) - y;
    var dz = x * y - beta * z;
    x += dx * dt;
    y += dy * dt;
    z += dz * dt;
  }

  // Project XZ plane onto canvas
  function toCanvas(px, pz) {
    var w = canvas.width;
    var h = canvas.height;
    var cx = w / 2 + (px / 22) * (w * 0.42);
    var cy = h * 0.9 - (pz / 52) * (h * 0.82);
    return { cx: cx, cy: cy };
  }

  function draw() {
    var w = canvas.width;
    var h = canvas.height;

    // Integrate several steps per frame
    for (var s = 0; s < 4; s++) {
      var dx = sigma * (y - x);
      var dy = x * (rho - z) - y;
      var dz = x * y - beta * z;
      x += dx * dt;
      y += dy * dt;
      z += dz * dt;
      points.push({ x: x, z: z });
      if (points.length > MAX_POINTS) points.shift();
    }

    // Fade
    ctx.fillStyle = window.theme.background;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    // Draw trail
    for (var i = 1; i < points.length; i++) {
      var alpha = i / points.length;
      var p0 = toCanvas(points[i - 1].x, points[i - 1].z);
      var p1 = toCanvas(points[i].x, points[i].z);
      ctx.beginPath();
      ctx.strokeStyle = window.theme.primaryBtn;
      ctx.globalAlpha = alpha * 0.7;
      ctx.lineWidth = 1;
      ctx.moveTo(p0.cx, p0.cy);
      ctx.lineTo(p1.cx, p1.cy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Current point
    var cur = toCanvas(x, z);
    ctx.beginPath();
    ctx.arc(cur.cx, cur.cy, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = window.theme.foreground;
    ctx.fill();

    // Label
    ctx.fillStyle = window.theme.foreground;
    ctx.globalAlpha = 0.4;
    ctx.font = "11px monospace";
    ctx.fillText("σ=" + sigma + "  ρ=" + rho + "  β=" + beta.toFixed(2) + "  (XZ plane)", 10, h - 10);
    ctx.globalAlpha = 1;

    requestAnimationFrame(draw);
  }

  ctx.fillStyle = window.theme.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  draw();
}
