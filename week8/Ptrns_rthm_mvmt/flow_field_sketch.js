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
let currentPalette = 'original'; // Current color scheme

// Vortex system for creating more swirling patterns
let vortices = [];
let numVortices = 4; // Number of vortex centers

// Color Palettes (inspired by Flux)
const colorPalettes = {
  original: {
    name: 'Original',
    getColor: (angle, speed, hueOffset, frameCount) => {
      let hue = (map(angle, -PI, PI, 0, 360) + hueOffset + frameCount * 0.1) % 360;
      let sat = map(speed, 0, particleSpeed, 50, 100);
      let bright = map(speed, 0, particleSpeed, 60, 100);
      return [hue, sat, bright, 40];
    }
  },
  plasma: {
    name: 'Plasma',
    getColor: (angle, speed, hueOffset, frameCount) => {
      let hue = (map(angle, -PI, PI, 280, 340) + frameCount * 0.15) % 360; // Purple-magenta range
      let sat = map(speed, 0, particleSpeed, 80, 100);
      let bright = map(speed, 0, particleSpeed, 70, 100);
      return [hue, sat, bright, 50];
    }
  },
  poolside: {
    name: 'Poolside',
    getColor: (angle, speed, hueOffset, frameCount) => {
      let hue = (map(angle, -PI, PI, 170, 210) + frameCount * 0.08) % 360; // Cyan-blue range
      let sat = map(speed, 0, particleSpeed, 60, 95);
      let bright = map(speed, 0, particleSpeed, 65, 100);
      return [hue, sat, bright, 45];
    }
  },
  sunset: {
    name: 'Sunset',
    getColor: (angle, speed, hueOffset, frameCount) => {
      let hue = (map(angle, -PI, PI, 0, 60) + frameCount * 0.12) % 360; // Red-orange-yellow range
      let sat = map(speed, 0, particleSpeed, 70, 100);
      let bright = map(speed, 0, particleSpeed, 60, 100);
      return [hue, sat, bright, 45];
    }
  },
  monochrome: {
    name: 'Monochrome',
    getColor: (angle, speed, hueOffset, frameCount) => {
      let hue = 0;
      let sat = 0;
      let bright = map(speed, 0, particleSpeed, 40, 100);
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
    this.prevPos = this.pos.copy();
    this.hueOffset = random(360); // Individual color variation
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
      this.applyForce(force);
    }
  }

  applyForce(force) {
    this.acc.add(force);
  }

  update() {
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);
    this.pos.add(this.vel);
    this.acc.mult(0); // Reset acceleration

    // Prevent stagnation - if particle is too slow, give it a nudge
    if (this.vel.mag() < 0.1) {
      let randomForce = p5.Vector.random2D();
      randomForce.mult(0.5);
      this.vel.add(randomForce);
    }
  }

  show() {
    // Calculate color using current palette
    let angle = this.vel.heading();
    let speed = this.vel.mag();

    let palette = colorPalettes[currentPalette];
    let [hue, sat, bright, alpha] = palette.getColor(angle, speed, this.hueOffset, frameCount);

    // Draw trail line from previous position to current
    stroke(hue, sat, bright, alpha);
    strokeWeight(strokeWeightValue);
    line(this.prevPos.x, this.prevPos.y, this.pos.x, this.pos.y);

    this.updatePrev();
  }

  updatePrev() {
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;
  }

  // Wrap around screen edges seamlessly
  edges() {
    if (this.pos.x > width) {
      this.pos.x = 0;
      this.updatePrev();
    }
    if (this.pos.x < 0) {
      this.pos.x = width;
      this.updatePrev();
    }
    if (this.pos.y > height) {
      this.pos.y = 0;
      this.updatePrev();
    }
    if (this.pos.y < 0) {
      this.pos.y = height;
      this.updatePrev();
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
  console.log('Palette:', colorPalettes[currentPalette].name);
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
