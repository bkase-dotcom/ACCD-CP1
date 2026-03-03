// Eclipse animation:
// - Sun with Perlin-noise texture
// - Moon moving on an elliptical orbit around the sun
//   • In front: moves L → R, large and darker
//   • Behind: moves R → L, smaller and brighter

// --- Orbit parameters ---
let orbitA;                 // horizontal radius of ellipse (set in setup)
let orbitB = 80;            // vertical radius of ellipse (small => almost straight path in front)
let orbitSpeed = 0.00015;    // radians per millisecond (controls moon speed)
let stars = [];
let starCount = 250;
let fft;
let audioSource = null;
let micInput = null;
let soundFile = null;
let audioStatusEl;
let playPauseBtn;
let micBtn;
let fileInputEl;
let canvasAspect = 1200 / 520;
let canvasPadY = 80;

function setup() {
  let canvas = createCanvas(getSketchWidth(), getSketchHeight());
  canvas.parent("sketch-holder");
  orbitA = width;     // wide enough that the moon goes off screen
  initStars();
  fft = new p5.FFT(0.8, 1024);
}

function draw() {
  background(0);
  drawStars();

  // Sun position + size
  let sx = width / 2;
  let sy = height / 2;
  let sd = min(width, height) * 0.8;

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
    drawAura(sx, sy, sd);
  } else {
    drawSun(sx, sy, sd);
    drawAura(sx, sy, sd);
    drawMoon(mx, my, moonD, moonBrightness); // in front
  }
}

function windowResized() {
  resizeCanvas(getSketchWidth(), getSketchHeight());
  orbitA = width;
  initStars();
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
  let t = millis() * 0.002; // time component for twinkle

  for (let i = 0; i < stars.length; i++) {
    let s = stars[i];

    // Per-star noise: each star has its own phase + speed
    let n = noise(s.noiseSeed, t * s.speed); // 0–1

    // Map noise to brightness (how much it "twinkles")
    let bright = map(n, 0, 1, 80, 255);
    let r = s.baseR * map(n, 0, 1, 0.6, 1.4);

    fill(bright);
    circle(s.x, s.y, r);
  }
}

function drawAura(x, y, diameter) {
  let spectrum = fft.analyze();
  let baseR = diameter * 0.52;

  drawAuraRing(x, y, baseR + 18, 16, [255, 190, 90, 160], spectrum, 60, 250);
  drawAuraRing(x, y, baseR + 42, 24, [255, 150, 60, 140], spectrum, 250, 2000);
  drawAuraRing(x, y, baseR + 70, 34, [255, 120, 40, 110], spectrum, 2000, 9000);
}

function drawAuraRing(x, y, radius, amp, rgba, spectrum, fMin, fMax) {
  let points = 220;
  let logMin = Math.log(fMin);
  let logMax = Math.log(fMax);
  let angleOffset = millis() * 0.00015;
  let mags = new Array(points);
  let pts = [];

  noFill();
  stroke(rgba[0], rgba[1], rgba[2], rgba[3]);
  strokeWeight(2);
  for (let i = 0; i < points; i++) {
    let u = i / points;
    let angle = u * TWO_PI + angleOffset;
    let freq = Math.exp(logMin + u * (logMax - logMin));
    let mag = sampleSpectrumAtFreq(spectrum, freq);
    mags[i] = mag;
  }

  // Circular smoothing to remove seam at the wrap
  for (let i = 0; i < points; i++) {
    let prev = mags[(i - 1 + points) % points];
    let next = mags[(i + 1) % points];
    let smooth = (prev + mags[i] + next) / 3;
    let u = i / points;
    let angle = u * TWO_PI + angleOffset;
    let wobble = map(smooth, 0, 255, -amp, amp);
    let r = radius + wobble;
    let px = x + cos(angle) * r;
    let py = y + sin(angle) * r;
    pts.push({ x: px, y: py });
  }
  beginShape();
  curveVertex(pts[points - 1].x, pts[points - 1].y);
  for (let i = 0; i < points; i++) {
    curveVertex(pts[i].x, pts[i].y);
  }
  curveVertex(pts[0].x, pts[0].y);
  curveVertex(pts[1].x, pts[1].y);
  endShape(CLOSE);
}

function sampleSpectrumAtFreq(spectrum, freq) {
  let nyquist = getAudioContext().sampleRate / 2;
  let idx = floor(constrain(freq / nyquist, 0, 0.999) * spectrum.length);
  let sum = 0;
  let count = 0;
  for (let i = -1; i <= 1; i++) {
    let j = constrain(idx + i, 0, spectrum.length - 1);
    sum += spectrum[j];
    count++;
  }
  return sum / count;
}

function initStars() {
  stars = [];
  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: random(width),
      y: random(height),
      baseR: random(1, 3),
      noiseSeed: random(1000),
      speed: random(0.8, 2.5)
    });
  }
}

function getSketchWidth() {
  let holder = document.getElementById("sketch-holder");
  return holder ? holder.clientWidth : window.innerWidth;
}

function getSketchHeight() {
  let w = getSketchWidth();
  return max(280, floor(w / canvasAspect) + canvasPadY);
}

function bindAudioUI() {
  audioStatusEl = document.getElementById("audioStatus");
  playPauseBtn = document.getElementById("playPause");
  micBtn = document.getElementById("useMic");
  fileInputEl = document.getElementById("audioFile");

  if (fileInputEl) {
    fileInputEl.addEventListener("change", handleFileUpload);
  }
  if (playPauseBtn) {
    playPauseBtn.addEventListener("click", togglePlayPause);
  }
  if (micBtn) {
    micBtn.addEventListener("click", startMic);
  }
}

function handleFileUpload(event) {
  let file = event.target.files[0];
  if (!file) return;
  userStartAudio();

  if (soundFile) {
    soundFile.stop();
    soundFile.disconnect();
  }
  let url = URL.createObjectURL(file);
  soundFile = loadSound(url, () => {
    URL.revokeObjectURL(url);
    soundFile.loop();
    setAudioInput(soundFile, "Playing uploaded audio");
  }, () => {
    setStatus("Failed to load audio");
  });
}

function togglePlayPause() {
  if (!soundFile) {
    setStatus("Load an audio file first");
    return;
  }
  if (soundFile.isPlaying()) {
    soundFile.pause();
    setStatus("Paused");
  } else {
    soundFile.play();
    setStatus("Playing uploaded audio");
  }
}

function startMic() {
  userStartAudio();
  if (!micInput) {
    micInput = new p5.AudioIn();
  }
  micInput.start(() => {
    setAudioInput(micInput, "Using microphone input");
  }, () => {
    setStatus("Microphone access denied");
  });
}

function setAudioInput(input, statusText) {
  audioSource = input;
  fft.setInput(audioSource);
  setStatus(statusText);
}

function setStatus(text) {
  if (audioStatusEl) {
    audioStatusEl.textContent = text;
  }
}
