// Drift-style Flow Field Visualization
// Particles flow through curl noise-based vector field

let particles = [];
let flowField;
let cols, rows;
let scl = 20; // Grid resolution for flow field sampling
let inc = 0.08; // Noise detail (lower = smoother)
let zoff = 0; // Time parameter
let numParticles = 3000; // Number of flowing particles

// Adjustable parameters
let trailAlpha = 5; // Background fade (lower = longer trails)
let particleSpeed = 2; // Max particle speed
let evolutionSpeed = 0.003; // Flow field evolution rate
let strokeWeightValue = 1.5; // Line thickness
let currentPalette = 'bluePink'; // Current color scheme
let curvatureScale = 500; // Scale factor for curvature-to-color mapping

// Vortex system for creating more swirling patterns
let vortices = [];
let numVortices = 4; // Number of vortex centers

// Color Palettes - color mapped from instantaneous radius of curvature
// logK range is approximately 0 (straight) to 4 (tight spiral)
const colorPalettes = {
  bluePink: {
    name: 'Blue-Pink',
    getColor: (logK, speed, hueOffset) => {
      let hue = (map(logK, 0, 4, 200, 420) + hueOffset * 0.3) % 360;
      let sat = map(speed, 0, particleSpeed, 50, 100);
      let bright = map(logK, 0, 4, 55, 100);
      return [hue, sat, bright, 40];
    }
  },
  violet: {
    name: 'Violet',
    getColor: (logK, speed, hueOffset) => {
      let hue = (map(logK, 0, 4, 260, 340) + hueOffset * 0.1) % 360;
      let sat = map(speed, 0, particleSpeed, 80, 100);
      let bright = map(logK, 0, 4, 60, 100);
      return [hue, sat, bright, 50];
    }
  },
  cyanTeal: {
    name: 'Cyan-Teal',
    getColor: (logK, speed, hueOffset) => {
      let hue = (map(logK, 0, 4, 170, 230) + hueOffset * 0.1) % 360;
      let sat = map(speed, 0, particleSpeed, 60, 95);
      let bright = map(logK, 0, 4, 60, 100);
      return [hue, sat, bright, 45];
    }
  },
  redOrange: {
    name: 'Red-Orange',
    getColor: (logK, speed, hueOffset) => {
      let hue = (map(logK, 0, 4, 0, 60) + hueOffset * 0.1) % 360;
      let sat = map(speed, 0, particleSpeed, 70, 100);
      let bright = map(logK, 0, 4, 60, 100);
      return [hue, sat, bright, 45];
    }
  },
  grayscale: {
    name: 'Grayscale',
    getColor: (logK, speed, hueOffset) => {
      let hue = 0;
      let sat = 0;
      let bright = map(logK, 0, 4, 30, 100);
      return [hue, sat, bright, 35];
    }
  }
};

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  background(0);

  // Calculate flow field grid dimensions
  cols = floor(width / scl);
  rows = floor(height / scl);
  flowField = new Array(cols * rows);

  // Create vortex centers
  for (let i = 0; i < numVortices; i++) {
    vortices.push(new Vortex());
  }

  // Create particle system
  for (let i = 0; i < numParticles; i++) {
    particles[i] = new Particle();
  }
}

function draw() {
  // Low alpha background for long, smooth trails
  background(0, 0, 0, trailAlpha);

  // Update vortex positions
  for (let vortex of vortices) {
    vortex.update();
  }

  // Update flow field with curl noise + vortex forces
  let yoff = 0;
  for (let y = 0; y < rows; y++) {
    let xoff = 0;
    for (let x = 0; x < cols; x++) {
      let index = x + y * cols;

      // Calculate curl noise vector at this point
      let v = calculateCurlNoise(xoff, yoff, zoff);
      v.setMag(1); // Normalize for consistent force

      // Add vortex forces
      let worldX = x * scl;
      let worldY = y * scl;
      for (let vortex of vortices) {
        let vortexForce = vortex.getForceAt(worldX, worldY);
        v.add(vortexForce);
      }

      flowField[index] = v;

      xoff += inc;
    }
    yoff += inc;
  }

  // Evolve the flow field over time
  zoff += evolutionSpeed;

  // Set rendering state once before particle loop
  strokeWeight(strokeWeightValue);
  noFill();

  // Update and render all particles
  for (let i = 0; i < particles.length; i++) {
    particles[i].follow(flowField);
    particles[i].update();
    particles[i].edges();
    particles[i].show();
  }
}

// Calculate curl noise for divergence-free (incompressible) flow
// This creates natural, swirling fluid-like patterns
function calculateCurlNoise(x, y, z) {
  let eps = 0.01; // Small offset for numerical derivative

  // Multi-scale noise function (combines multiple octaves)
  function potential(x, y, z) {
    let total = 0;
    total += noise(x, y, z);                    // Large features
    total += 0.5 * noise(x*2, y*2, z*2);        // Medium features
    total += 0.25 * noise(x*4, y*4, z*4);       // Small details
    return total / 1.75; // Normalize
  }

  // Calculate partial derivatives using finite differences
  let p1 = potential(x, y + eps, z);
  let p2 = potential(x, y - eps, z);
  let p3 = potential(x + eps, y, z);
  let p4 = potential(x - eps, y, z);

  // Curl in 2D: (∂P/∂y, -∂P/∂x) - rotates gradient by 90°
  let dx = (p1 - p2) / (2 * eps);
  let dy = (p3 - p4) / (2 * eps);

  return createVector(dx, -dy);
}

// Vortex class creates swirling flow patterns
class Vortex {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = p5.Vector.random2D();
    this.vel.mult(0.3); // Slow drift
    this.strength = random(0.3, 0.8); // Vortex intensity
    this.radius = random(100, 250); // Area of influence
    this.direction = random() > 0.5 ? 1 : -1; // Clockwise or counter-clockwise
  }

  update() {
    // Slowly drift around the canvas
    this.pos.add(this.vel);

    // Bounce off edges
    if (this.pos.x < 0 || this.pos.x > width) {
      this.vel.x *= -1;
    }
    if (this.pos.y < 0 || this.pos.y > height) {
      this.vel.y *= -1;
    }

    // Keep within bounds
    this.pos.x = constrain(this.pos.x, 0, width);
    this.pos.y = constrain(this.pos.y, 0, height);
  }

  // Calculate vortex force at a given position
  getForceAt(x, y) {
    let diff = createVector(x - this.pos.x, y - this.pos.y);
    let distance = diff.mag();

    // Force decreases with distance (inverse square falloff)
    if (distance < this.radius && distance > 0) {
      // Rotate the direction vector 90 degrees for circular motion
      let force = createVector(-diff.y, diff.x);
      force.normalize();

      // Apply direction (clockwise or counter-clockwise)
      force.mult(this.direction);

      // Scale force based on distance from center
      let falloff = map(distance, 0, this.radius, 1, 0);
      falloff = falloff * falloff; // Squared falloff for smoother transition
      force.mult(this.strength * falloff);

      return force;
    }

    return createVector(0, 0);
  }
}

class Particle {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = createVector(0, 0);
    this.acc = createVector(0, 0);
    this.smoothK = 0; // EMA-smoothed curvature
    this.hueOffset = random(360); // Individual color variation
    this.speed = 0; // Cached speed to avoid recomputing
    this.stepsThisFrame = 0;
    // Flat coordinate arrays — avoids creating Vector objects per sub-step
    this.hx = [];
    this.hy = [];
  }

  get maxSpeed() {
    return particleSpeed;
  }

  // Sample velocity from flow field at particle's position
  follow(vectors) {
    let x = floor(this.pos.x / scl);
    let y = floor(this.pos.y / scl);
    let index = x + y * cols;

    // Bounds checking
    if (index >= 0 && index < vectors.length) {
      let force = vectors[index];
      this.acc.add(force);
    }
  }

  update() {
    // Capture heading before forces are applied
    let prevHeading = this.vel.heading();

    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);

    // Compute instantaneous curvature: κ = |dθ/ds|
    let speed = this.vel.mag();
    this.speed = speed;
    if (speed > 0.01) {
      let dTheta = this.vel.heading() - prevHeading;
      // Normalize angle difference to [-PI, PI]
      if (dTheta > PI) dTheta -= TWO_PI;
      if (dTheta < -PI) dTheta += TWO_PI;
      let kappa = abs(dTheta) / speed;
      // Smooth with exponential moving average
      this.smoothK = lerp(this.smoothK, kappa, 0.08);
    }

    // Sub-step position updates for smoother trails at high speeds
    // Direct arithmetic avoids p5.Vector.div() allocation
    let numSteps = max(1, ceil(speed / 2));
    let svx = this.vel.x / numSteps;
    let svy = this.vel.y / numSteps;
    this.stepsThisFrame = numSteps;

    for (let s = 0; s < numSteps; s++) {
      this.pos.x += svx;
      this.pos.y += svy;
      // Push raw numbers instead of Vector objects
      this.hx.push(this.pos.x);
      this.hy.push(this.pos.y);
    }

    this.acc.mult(0); // Reset acceleration

    // Keep history buffer small
    while (this.hx.length > 12) {
      this.hx.shift();
      this.hy.shift();
    }

    // Prevent stagnation - if particle is too slow, give it a nudge
    if (speed < 0.1) {
      let randomForce = p5.Vector.random2D();
      randomForce.mult(0.5);
      this.vel.add(randomForce);
    }
  }

  show() {
    let len = this.hx.length;
    if (len < 2) return;

    // Map smoothed curvature to color via log scale
    let logK = log(1 + this.smoothK * curvatureScale);

    let palette = colorPalettes[currentPalette];
    let [hue, sat, bright, alpha] = palette.getColor(logK, this.speed, this.hueOffset);

    stroke(hue, sat, bright, alpha);

    // Draw line segments for new sub-steps
    // With dense sub-stepped points (~1.5-2px apart), lines are visually smooth
    // line() is far cheaper than curve() — no spline interpolation needed
    let startI = max(1, len - this.stepsThisFrame);
    for (let i = startI; i < len; i++) {
      line(this.hx[i - 1], this.hy[i - 1], this.hx[i], this.hy[i]);
    }
  }

  // Wrap around screen edges seamlessly
  edges() {
    let wrapped = false;
    if (this.pos.x > width) { this.pos.x = 0; wrapped = true; }
    if (this.pos.x < 0) { this.pos.x = width; wrapped = true; }
    if (this.pos.y > height) { this.pos.y = 0; wrapped = true; }
    if (this.pos.y < 0) { this.pos.y = height; wrapped = true; }
    // Clear history on wrap to avoid cross-screen artifacts
    if (wrapped) {
      this.hx.length = 0;
      this.hy.length = 0;
    }
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  cols = floor(width / scl);
  rows = floor(height / scl);
  flowField = new Array(cols * rows);

  // Reinitialize vortices for new canvas size
  vortices = [];
  for (let i = 0; i < numVortices; i++) {
    vortices.push(new Vortex());
  }

  background(0);
}

function keyPressed() {
  if (key === 'r' || key === 'R') {
    resetParticles();
  }

  // Cycle through color palettes with 'c' key
  if (key === 'c' || key === 'C') {
    cyclePalette();
  }
}

function resetParticles() {
  background(0);
  particles = [];
  for (let i = 0; i < numParticles; i++) {
    particles[i] = new Particle();
  }

  // Reset vortices to create new patterns
  vortices = [];
  for (let i = 0; i < numVortices; i++) {
    vortices.push(new Vortex());
  }
}

function cyclePalette() {
  const paletteKeys = Object.keys(colorPalettes);
  const currentIndex = paletteKeys.indexOf(currentPalette);
  const nextIndex = (currentIndex + 1) % paletteKeys.length;
  currentPalette = paletteKeys[nextIndex];

  // Sync active state on control panel buttons
  document.querySelectorAll('.palette-button').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.palette-button[data-palette="${currentPalette}"]`);
  if (activeBtn) activeBtn.classList.add('active');
}

function adjustParticleCount(delta) {
  numParticles = constrain(numParticles + delta, 500, 10000);

  // Add or remove particles to match new count
  if (particles.length < numParticles) {
    for (let i = particles.length; i < numParticles; i++) {
      particles.push(new Particle());
    }
  } else if (particles.length > numParticles) {
    particles.splice(numParticles);
  }

  updateControlValues();
}

function updateControlValues() {
  // Update display values if control panel exists
  const particleCountEl = document.getElementById('particleCount');
  const trailAlphaEl = document.getElementById('trailAlpha');
  const particleSpeedEl = document.getElementById('particleSpeed');
  const evolutionSpeedEl = document.getElementById('evolutionSpeed');
  const strokeWeightEl = document.getElementById('strokeWeight');

  if (particleCountEl) particleCountEl.textContent = numParticles;
  if (trailAlphaEl) trailAlphaEl.textContent = trailAlpha.toFixed(1);
  if (particleSpeedEl) particleSpeedEl.textContent = particleSpeed.toFixed(1);
  if (evolutionSpeedEl) evolutionSpeedEl.textContent = (evolutionSpeed * 1000).toFixed(1);
  if (strokeWeightEl) strokeWeightEl.textContent = strokeWeightValue.toFixed(1);
}
