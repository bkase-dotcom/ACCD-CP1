// Flow Field Visualization - Wave-like Vector Field
// Inspired by macOS screensaver aesthetics

let particles = [];
let flowField;
let cols, rows;
let scl = 20; // Scale of flow field grid
let inc = 0.1; // Increment for Perlin noise
let zoff = 0; // Z-axis offset for noise (time)
let numParticles = 3000;

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  background(0);
  
  // Calculate grid dimensions
  cols = floor(width / scl);
  rows = floor(height / scl);
  
  // Initialize flow field
  flowField = new Array(cols * rows);
  
  // Create particles
  for (let i = 0; i < numParticles; i++) {
    particles[i] = new Particle();
  }
}

function draw() {
  // Semi-transparent background for trail effect
  background(0, 0, 0, 5);
  
  // Update flow field based on Perlin noise
  let yoff = 0;
  for (let y = 0; y < rows; y++) {
    let xoff = 0;
    for (let x = 0; x < cols; x++) {
      let index = x + y * cols;
      
      // Create flowing, wave-like patterns with noise
      let angle = noise(xoff, yoff, zoff) * TWO_PI * 4;
      let v = p5.Vector.fromAngle(angle);
      v.setMag(1);
      flowField[index] = v;
      
      xoff += inc;
    }
    yoff += inc;
  }
  zoff += 0.003; // Slow evolution of the field over time
  
  // Update and display particles
  for (let i = 0; i < particles.length; i++) {
    particles[i].follow(flowField);
    particles[i].update();
    particles[i].edges();
    particles[i].show();
  }
}

class Particle {
  constructor() {
    this.pos = createVector(random(width), random(height));
    this.vel = createVector(0, 0);
    this.acc = createVector(0, 0);
    this.maxSpeed = 2;
    this.prevPos = this.pos.copy();
    
    // Each particle has a slight hue offset for variation
    this.hueOffset = random(360);
  }
  
  follow(vectors) {
    let x = floor(this.pos.x / scl);
    let y = floor(this.pos.y / scl);
    let index = x + y * cols;
    
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
    this.acc.mult(0);
  }
  
  show() {
    // Calculate hue based on velocity angle and position
    let angle = this.vel.heading();
    let hue = (map(angle, -PI, PI, 0, 360) + this.hueOffset + frameCount * 0.1) % 360;
    
    // Saturation and brightness based on speed
    let speed = this.vel.mag();
    let sat = map(speed, 0, this.maxSpeed, 50, 100);
    let bright = map(speed, 0, this.maxSpeed, 60, 100);
    
    stroke(hue, sat, bright, 40);
    strokeWeight(1.5);
    line(this.prevPos.x, this.prevPos.y, this.pos.x, this.pos.y);
    
    this.updatePrev();
  }
  
  updatePrev() {
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;
  }
  
  edges() {
    // Wrap around edges
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
  background(0);
}

// Optional: Press 'r' to reset
function keyPressed() {
  if (key === 'r' || key === 'R') {
    background(0);
    particles = [];
    for (let i = 0; i < numParticles; i++) {
      particles[i] = new Particle();
    }
  }
}
