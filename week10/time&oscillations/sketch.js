// Eclipse animation:
// - Sun with Perlin-noise texture
// - Moon moving on an elliptical orbit around the sun
//   • In front: moves L → R, large and darker
//   • Behind: moves R → L, smaller and brighter

// --- Orbit parameters ---
let orbitA;                 // horizontal radius of ellipse (set in setup)
let orbitB = 80;            // vertical radius of ellipse (small => almost straight path in front)
let orbitSpeed = 0.00015;    // radians per millisecond (controls moon speed)

function setup() {
  createCanvas(2000, 800);
  orbitA = width;     // wide enough that the moon goes off screen
}

function draw() {
  background(0);

  // Sun position + size
  let sx = width / 2;
  let sy = height / 2;
  let sd = 600;

  // ---- MOON ORBIT (uses trig + time) ----
  // Angle along the orbit; grows continuously with time
  let theta = millis() * orbitSpeed;   // radians

  // Elliptical path around the sun (centered on the sun)
  // x = sx + a * sin(theta)
  // y = sy + b * cos(theta)
  //  -> Near side (front) is the lower half (cos(theta) > 0)
  let mx = sx + orbitA * sin(theta);
  let my = sy + orbitB * cos(theta) - orbitB;

  // "Depth" proxy: cos(theta)
  //   depth = +1  => closest (bottom of ellipse, in front)
  //   depth = -1  => farthest (top of ellipse, behind)
  let depth = cos(theta);

  // Tie moon size to position along the orbit.
  // Far (depth=-1) -> smaller, Near (depth=+1) -> almost as big as the sun.
  let sizeScale = map(depth, -1, 1, 0.1, 0.95); // tweak these numbers if you want
  let moonD = sd * sizeScale;

  // Tie moon brightness to depth.
  // In front (near) -> darker; Behind (far) -> brighter (lit by sun).
  let moonBrightness = map(depth, -1, 1, 230, 60); // far = 230, near = 60

  // Draw order:
  //  - When behind (depth <= 0), draw moon first, then sun (sun covers it).
  //  - When in front (depth > 0), draw sun first, then moon.
  if (depth <= 0) {
    drawMoon(mx, my, moonD, moonBrightness); // behind
    drawSun(sx, sy, sd);
  } else {
    drawSun(sx, sy, sd);
    drawMoon(mx, my, moonD, moonBrightness); // in front
  }
}

// ----- MOON -----
function drawMoon(x, y, diameter, brightness) {
  noStroke();
  fill(brightness);          // grayscale, controlled by orbit depth
  circle(x, y, diameter);
}

// ----- SUN (Perlin-noise texture) -----
function drawSun(x, y, diameter) {
  let r = diameter / 2;

  // Base disk
  noStroke();
  fill(255, 200, 0)
  circle(x, y, diameter);

  // Textured surface using Perlin noise
  let step = 3; // smaller = more detail (but slower)

  for (let dx = -r; dx <= r; dx += step) {
    for (let dy = -r; dy <= r; dy += step) {

      // Only draw inside the circular area
      if (dx * dx + dy * dy <= r * r) {
        // Noise coordinates (scaled so texture is smooth)
        let nx = (x + dx) * 0.04;
        let ny = (y + dy) * 0.04;

        // Animated 3D Perlin noise (third arg is time to move the noise slice through space)
        let n = noise(nx, ny, millis() * 0.00015);

        // Map noise (0–1) to brightness range
        let bright = map(n, 0, 1, 120, 255);

        // Warm yellow/orange variation
        fill(bright, bright * 0.8, bright * 0.3);

        // Small blob of color at this sample point
        circle(x + dx, y + dy, step);
      }
    }
  }
}

function drawStars() {
  noStroke();
  let t = millis() * 0.0005; // time component for smooth twinkle

  for (let i = 0; i < stars.length; i++) {
    let s = stars[i];

    // Per-star noise: noiseSeed gives each star a unique twinkle pattern
    let n = noise(s.noiseSeed, t); // 0–1

    // Map noise to brightness (how much it "twinkles")
    let bright = map(n, 0, 1, 120, 255);

    fill(bright);
    circle(s.x, s.y, 3); // same size for all stars
  }
}