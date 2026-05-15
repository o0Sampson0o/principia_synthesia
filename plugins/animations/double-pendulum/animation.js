// Double Pendulum — chaotic physics simulation
// Runs in an iframe context with a <canvas id="canvas"> element.
// window.theme provides color tokens from the parent page.

(function doublePendulum() {
  var canvas = document.getElementById("canvas");
  var ctx = canvas.getContext("2d");

  // Physics parameters
  var g = 9.81;      // gravitational acceleration (m/s^2)
  var L1 = 120;      // length of first arm (px)
  var L2 = 100;      // length of second arm (px)
  var m1 = 10;       // mass of bob 1
  var m2 = 8;        // mass of bob 2

  // State: angles and angular velocities
  var theta1 = Math.PI * 0.6;
  var theta2 = Math.PI * 0.9;
  var omega1 = 0;
  var omega2 = 0;

  // Trail storage
  var trail = [];
  var MAX_TRAIL = 300;

  // Time step
  var dt = 0.05;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  window.addEventListener("resize", resize);
  resize();

  function step() {
    // Double pendulum equations of motion (Lagrangian mechanics)
    var delta = theta2 - theta1;
    var sinD = Math.sin(delta);
    var cosD = Math.cos(delta);
    var sin1 = Math.sin(theta1);
    var sin2 = Math.sin(theta2);

    var denom1 = (2 * m1 + m2 - m2 * Math.cos(2 * delta));
    var denom2 = denom1;

    var alpha1 = (-g * (2 * m1 + m2) * sin1
                  - m2 * g * Math.sin(theta1 - 2 * theta2)
                  - 2 * sinD * m2 * (omega2 * omega2 * L2 + omega1 * omega1 * L1 * cosD))
                 / (L1 * denom1);

    var alpha2 = (2 * sinD * (omega1 * omega1 * L1 * (m1 + m2)
                  + g * (m1 + m2) * Math.cos(theta1)
                  + omega2 * omega2 * L2 * m2 * cosD))
                 / (L2 * denom2);

    omega1 += alpha1 * dt;
    omega2 += alpha2 * dt;
    theta1 += omega1 * dt;
    theta2 += omega2 * dt;
  }

  function getColors() {
    var t = window.theme || {};
    return {
      bg: t.background || "#ffffff",
      pivot: t.foreground || "#18181b",
      arm1: t.primaryBtn || "#3b82f6",
      arm2: t.link || "#8b5cf6",
      bob1: t.primaryBtn || "#3b82f6",
      bob2: t.linkHover || "#6d28d9",
      trail: t.muted || "#a1a1aa",
    };
  }

  function draw() {
    var W = canvas.width;
    var H = canvas.height;
    var cx = W / 2;
    var cy = H * 0.35;

    var c = getColors();

    // Clear
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, W, H);

    // Positions
    var x1 = cx + L1 * Math.sin(theta1);
    var y1 = cy + L1 * Math.cos(theta1);
    var x2 = x1 + L2 * Math.sin(theta2);
    var y2 = y1 + L2 * Math.cos(theta2);

    // Trail
    trail.push({ x: x2, y: y2 });
    if (trail.length > MAX_TRAIL) trail.shift();

    if (trail.length > 1) {
      for (var i = 1; i < trail.length; i++) {
        var alpha = i / trail.length;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.strokeStyle = c.trail;
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
    ctx.strokeStyle = c.arm1;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Arm 2
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = c.arm2;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Pivot
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = c.pivot;
    ctx.fill();

    // Bob 1
    ctx.beginPath();
    ctx.arc(x1, y1, m1, 0, Math.PI * 2);
    ctx.fillStyle = c.bob1;
    ctx.fill();

    // Bob 2
    ctx.beginPath();
    ctx.arc(x2, y2, m2, 0, Math.PI * 2);
    ctx.fillStyle = c.bob2;
    ctx.fill();
  }

  function loop() {
    step();
    draw();
    requestAnimationFrame(loop);
  }

  loop();
}());
