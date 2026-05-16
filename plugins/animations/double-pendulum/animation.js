// Double Pendulum — chaotic physics simulation
// Runs in an iframe context with a <canvas id="canvas"> element.
// window.theme provides color tokens from the parent page.

(function doublePendulum() {
  var canvas = document.getElementById("canvas");
  var ctx = canvas.getContext("2d");

  // Physics parameters
  var g = 9.81;
  var L1 = 1.2;   // arm 1 length in meters
  var L2 = 1.0;   // arm 2 length in meters
  var m1 = 10;
  var m2 = 8;

  // State: angles and angular velocities
  var theta1 = Math.PI * 0.6;
  var theta2 = Math.PI * 0.9;
  var omega1 = 0;
  var omega2 = 0;

  // Trail storage
  var trail = [];
  var MAX_TRAIL = 300;

  // Time step (seconds)
  var dt = 1 / 60;

  function resize() {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
  }

  window.addEventListener("resize", resize);
  resize();

  function step() {
    // Double pendulum equations of motion (Lagrangian mechanics)
    var delta = theta2 - theta1;
    var sinD = Math.sin(delta);
    var cosD = Math.cos(delta);
    var sin1 = Math.sin(theta1);

    var denom = (2 * m1 + m2 - m2 * Math.cos(2 * delta));

    var alpha1 = (-g * (2 * m1 + m2) * sin1
                  - m2 * g * Math.sin(theta1 - 2 * theta2)
                  - 2 * sinD * m2 * (omega2 * omega2 * L2 + omega1 * omega1 * L1 * cosD))
                 / (L1 * denom);

    var alpha2 = (2 * sinD * (omega1 * omega1 * L1 * (m1 + m2)
                  + g * (m1 + m2) * Math.cos(theta1)
                  + omega2 * omega2 * L2 * m2 * cosD))
                 / (L2 * denom);

    omega1 += alpha1 * dt;
    omega2 += alpha2 * dt;
    theta1 += omega1 * dt;
    theta2 += omega2 * dt;
  }

  function draw() {
    var W = canvas.width;
    var H = canvas.height;
    var cx = W / 2;
    var cy = H * 0.35;

    // Scale physical lengths to pixels
    var scale = Math.min(W, H) * 0.32;
    var L1_px = L1 * scale;
    var L2_px = L2 * scale;

    // Clear
    ctx.fillStyle = window.theme.background;
    ctx.fillRect(0, 0, W, H);

    // Positions
    var x1 = cx + L1_px * Math.sin(theta1);
    var y1 = cy + L1_px * Math.cos(theta1);
    var x2 = x1 + L2_px * Math.sin(theta2);
    var y2 = y1 + L2_px * Math.cos(theta2);

    // Trail
    trail.push({ x: x2, y: y2 });
    if (trail.length > MAX_TRAIL) trail.shift();

    if (trail.length > 1) {
      for (var i = 1; i < trail.length; i++) {
        var alpha = i / trail.length;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.strokeStyle = window.theme.muted;
        ctx.globalAlpha = alpha * 0.6;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Arm 1
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = window.theme.primaryBtn;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Arm 2
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = window.theme.link;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Pivot
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = window.theme.foreground;
    ctx.fill();

    // Bob 1
    ctx.beginPath();
    ctx.arc(x1, y1, m1, 0, Math.PI * 2);
    ctx.fillStyle = window.theme.primaryBtn;
    ctx.fill();

    // Bob 2
    ctx.beginPath();
    ctx.arc(x2, y2, m2, 0, Math.PI * 2);
    ctx.fillStyle = window.theme.linkHover;
    ctx.fill();
  }

  function loop() {
    step();
    draw();
    requestAnimationFrame(loop);
  }

  loop();
}());
