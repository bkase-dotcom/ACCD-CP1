// sketch.js -- p5.js rendering, visualization, and UI wiring

let sim = null;
let panelVisible = true;
let speedMultiplier = 1;
let selectedMaxTimesteps = 1000000;
let winnerShown = false;

// Current slider values (used when creating/resetting simulation)
let sliderParams = {
  spawnRate: 0.01,
  deathRate: 0.02,
  replicationRate: 0.04,
  mutationRate: 0.04,
  capacity: 1000,
  maxTimesteps: 1000000
};

function setup() {
  createCanvas(windowWidth, windowHeight);
  colorMode(HSB, 360, 100, 100, 100);
  textFont('sans-serif');
  noiseDetail(2, 0.5);
  bindControls();
}

function draw() {
  background(0, 0, 3);

  let margin = 24;
  let panelW = panelVisible ? 330 : 0;
  let availW = width - margin * 2 - panelW;
  let availH = height - margin * 2;

  if (availW < 200) availW = width - margin * 2;

  // Layout
  let graphH = availH * 0.42;
  let statsH = 38;
  let gap = 10;
  let voidH = availH - graphH - statsH - gap * 2;

  let gx = margin, gy = margin;
  let sx = margin, sy = gy + graphH + gap;
  let vx = margin, vy = sy + statsH + gap;

  if (sim) {
    // Advance simulation
    let baseSteps = sim.stepsPerFrame;
    sim.stepsPerFrame = baseSteps * speedMultiplier;
    sim.step();
    sim.stepsPerFrame = baseSteps;

    drawPopulationGraph(sim, gx, gy, availW, graphH);
    drawStatsBar(sim, sx, sy, availW, statsH);
    drawVoid(sim, vx, vy, availW, voidH);

    // Update winner box on completion (once)
    if (sim.complete && !winnerShown) {
      showWinnerStats();
      winnerShown = true;
    }
  } else {
    // Placeholder
    fill(0, 0, 100, 20);
    noStroke();
    rect(gx, gy, availW, graphH, 8);
    rect(vx, vy, availW, voidH, 8);

    fill(0, 0, 100, 30);
    textSize(16);
    textAlign(CENTER, CENTER);
    text('Configure parameters and press Run to start',
      gx + availW / 2, height / 2);
    textSize(12);
    fill(0, 0, 100, 18);
    text('Adjust the sliders on the right, choose a simulation length, then hit Run',
      gx + availW / 2, height / 2 + 28);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// ── Population Graph (stacked area chart) ──

function drawPopulationGraph(sim, gx, gy, gw, gh) {
  // Background
  noStroke();
  fill(0, 0, 6);
  rect(gx, gy, gw, gh, 8);

  let hist = sim.history;
  if (hist.length < 2) {
    fill(0, 0, 100, 20);
    textSize(13);
    textAlign(CENTER, CENTER);
    text('Collecting data...', gx + gw / 2, gy + gh / 2);
    return;
  }

  // Find max population for scaling
  let maxPop = 0;
  for (let snap of hist) {
    maxPop = Math.max(maxPop, snap.totalPopulation);
  }
  maxPop = Math.max(maxPop, 10);

  // Pad graph area
  let px = gx + 8, py = gy + 8;
  let pw = gw - 16, ph = gh - 24;

  // Draw capacity reference line
  let capFrac = sim.population.capacity / maxPop;
  if (capFrac <= 1) {
    let capY = py + ph - capFrac * ph;
    stroke(0, 0, 100, 12);
    strokeWeight(1);
    drawingContext.setLineDash([4, 4]);
    line(px, capY, px + pw, capY);
    drawingContext.setLineDash([]);
    noStroke();
    fill(0, 0, 100, 25);
    textSize(9);
    textAlign(LEFT, BOTTOM);
    text('capacity: ' + formatNumber(sim.population.capacity), px + 4, capY - 3);
  }

  // Collect all species IDs that appear across history
  let allSpeciesIds = new Set();
  for (let snap of hist) {
    for (let sp of snap.species) {
      allSpeciesIds.add(sp.speciesId);
    }
  }
  let speciesOrder = Array.from(allSpeciesIds);

  // Build stacked data: for each history point, cumulative counts per species
  let stackedData = [];
  for (let snap of hist) {
    let lookup = new Map();
    for (let sp of snap.species) {
      lookup.set(sp.speciesId, sp);
    }
    let cumulative = 0;
    let layers = [];
    for (let sid of speciesOrder) {
      let sp = lookup.get(sid);
      let count = sp ? sp.count : 0;
      layers.push({ bottom: cumulative, top: cumulative + count, speciesId: sid, color: sp ? sp.color : null });
      cumulative += count;
    }
    stackedData.push(layers);
  }

  // Draw stacked areas (bottom to top)
  for (let layerIdx = 0; layerIdx < speciesOrder.length; layerIdx++) {
    // Get color from first non-null appearance
    let col = null;
    for (let snap of hist) {
      for (let sp of snap.species) {
        if (sp.speciesId === speciesOrder[layerIdx]) {
          col = sp.color;
          break;
        }
      }
      if (col) break;
    }
    if (!col) continue;

    fill(col.h, col.s, col.b, 45);
    noStroke();
    beginShape();
    // Bottom edge (left to right)
    for (let j = 0; j < stackedData.length; j++) {
      let xp = map(j, 0, stackedData.length - 1, px, px + pw);
      let yp = py + ph - map(stackedData[j][layerIdx].bottom, 0, maxPop, 0, ph);
      vertex(xp, yp);
    }
    // Top edge (right to left)
    for (let j = stackedData.length - 1; j >= 0; j--) {
      let xp = map(j, 0, stackedData.length - 1, px, px + pw);
      let yp = py + ph - map(stackedData[j][layerIdx].top, 0, maxPop, 0, ph);
      vertex(xp, yp);
    }
    endShape(CLOSE);
  }

  // Total population line
  stroke(0, 0, 100, 60);
  strokeWeight(1.5);
  noFill();
  beginShape();
  for (let j = 0; j < hist.length; j++) {
    let xp = map(j, 0, hist.length - 1, px, px + pw);
    let yp = py + ph - map(hist[j].totalPopulation, 0, maxPop, 0, ph);
    vertex(xp, yp);
  }
  endShape();

  // Axis labels
  noStroke();
  fill(0, 0, 100, 30);
  textSize(10);
  textAlign(LEFT, BOTTOM);
  text(formatNumber(maxPop), px + 2, py + 2 + 12);
  textAlign(LEFT, TOP);
  text('0', px + 2, py + ph - 2);
  textAlign(RIGHT, TOP);
  text('t=' + formatNumber(hist[hist.length - 1].timestep), px + pw - 2, py + ph + 2);

  // Title
  fill(0, 0, 100, 40);
  textSize(11);
  textAlign(LEFT, TOP);
  text('Population Over Time', px + 2, py);
}

// ── Stats Bar ──

function drawStatsBar(sim, sx, sy, sw, sh) {
  let stats = sim.getStats();

  // Background
  noStroke();
  fill(0, 0, 6);
  rect(sx, sy, sw, sh, 6);

  // Progress bar fill
  fill(140, 60, 40, 25);
  rect(sx, sy, sw * stats.progress, sh, 6);

  // Text
  fill(0, 0, 100, 60);
  textSize(11);
  let cy = sy + sh / 2;

  textAlign(LEFT, CENTER);
  text('t: ' + formatNumber(stats.timestep) + ' / ' + formatNumber(sim.maxTimesteps), sx + 12, cy);

  let col2 = sx + sw * 0.28;
  text('Pop: ' + formatNumber(stats.population) + ' / ' + formatNumber(sim.population.capacity), col2, cy);

  let col3 = sx + sw * 0.52;
  text('Species: ' + stats.speciesCount, col3, cy);

  let col4 = sx + sw * 0.66;
  text('Born: ' + formatNumber(stats.totalBorn), col4, cy);

  let col5 = sx + sw * 0.80;
  text('Died: ' + formatNumber(stats.totalDied), col5, cy);

  // Progress percentage
  textAlign(RIGHT, CENTER);
  fill(0, 0, 100, 40);
  text(Math.floor(stats.progress * 100) + '%', sx + sw - 10, cy);
}

// ── Void Visualization ──

function drawVoid(sim, vx, vy, vw, vh) {
  // Background
  noStroke();
  fill(0, 0, 4);
  rect(vx, vy, vw, vh, 8);

  let pop = sim.population;
  if (pop.size() === 0) {
    fill(0, 0, 100, 15);
    textSize(12);
    textAlign(CENTER, CENTER);
    text('The void is empty...', vx + vw / 2, vy + vh / 2);
    return;
  }

  let maxDots = 1500;
  let dotSize = map(pop.size(), 1, pop.capacity, 7, 2.5);
  dotSize = constrain(dotSize, 1.5, 8);

  let sampleRate = Math.min(1, maxDots / pop.size());

  noStroke();
  for (let r of pop.replicators) {
    if (Math.random() > sampleRate) continue;

    // Stable position from ID hash
    let hx = stableHash(r.id, 1) * (vw - 20) + 10;
    let hy = stableHash(r.id, 2) * (vh - 20) + 10;

    // Subtle drift
    let drift = 3;
    let nx = (noise(r.id * 0.013, frameCount * 0.003) - 0.5) * drift * 2;
    let ny = (noise(r.id * 0.013 + 200, frameCount * 0.003) - 0.5) * drift * 2;

    let px = vx + hx + nx;
    let py = vy + hy + ny;

    fill(r.color.h, r.color.s, r.color.b, 70);
    circle(px, py, dotSize);
  }

  // Species legend
  let topSpecies = pop.getTopSpecies(5);
  let legendX = vx + 12;
  let legendY = vy + 14;
  textSize(10);
  for (let i = 0; i < topSpecies.length; i++) {
    let sp = topSpecies[i];
    let ly = legendY + i * 16;

    fill(sp.color.h, sp.color.s, sp.color.b, 90);
    circle(legendX, ly + 4, 7);

    fill(0, 0, 100, 50);
    textAlign(LEFT, TOP);
    let pct = (sp.count / pop.size() * 100).toFixed(1);
    text('Sp.' + sp.speciesId + ': ' + sp.count + ' (' + pct + '%)', legendX + 10, ly - 1);
  }

  // Title
  fill(0, 0, 100, 25);
  textSize(11);
  textAlign(RIGHT, TOP);
  text('The Void', vx + vw - 12, vy + 10);
}

// ── Utility ──

function stableHash(id, seed) {
  let x = Math.sin(id * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function formatNumber(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

// ── Controls ──

function bindControls() {
  // Simulation length buttons
  document.querySelectorAll('.length-button').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.length-button').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      selectedMaxTimesteps = parseInt(this.dataset.steps);
      sliderParams.maxTimesteps = selectedMaxTimesteps;
    });
  });

  // Sliders
  let sliders = {
    spawnRateSlider: { key: 'spawnRate', display: 'spawnRateVal', fmt: v => (v).toFixed(1) + '%', scale: 0.01 },
    deathRateSlider: { key: 'deathRate', display: 'deathRateVal', fmt: v => (v).toFixed(1) + '%', scale: 0.01 },
    replicationRateSlider: { key: 'replicationRate', display: 'replicationRateVal', fmt: v => (v).toFixed(1) + '%', scale: 0.01 },
    mutationRateSlider: { key: 'mutationRate', display: 'mutationRateVal', fmt: v => (v).toFixed(1) + '%', scale: 0.01 },
    capacitySlider: { key: 'capacity', display: 'capacityVal', fmt: v => Number(v).toLocaleString(), scale: 1 },
    speedSlider: { key: null, display: 'speedVal', fmt: v => v + 'x', scale: 1 }
  };

  for (let [sliderId, config] of Object.entries(sliders)) {
    let el = document.getElementById(sliderId);
    if (!el) continue;
    el.addEventListener('input', function () {
      let rawVal = parseFloat(this.value);
      document.getElementById(config.display).textContent = config.fmt(rawVal);

      if (sliderId === 'speedSlider') {
        speedMultiplier = rawVal;
      } else if (sliderId === 'capacitySlider') {
        sliderParams[config.key] = rawVal * config.scale;
        // Live update capacity during simulation
        if (sim && sim.running) {
          sim.population.capacity = rawVal;
        }
      } else if (config.key) {
        sliderParams[config.key] = rawVal * config.scale;
      }
    });
  }

  // Run button
  document.getElementById('runBtn').addEventListener('click', runSimulation);
  document.getElementById('pauseBtn').addEventListener('click', togglePause);
  document.getElementById('resetBtn').addEventListener('click', resetSimulation);
}

function runSimulation() {
  if (sim && sim.paused) {
    sim.resume();
    updateButtonStates();
    return;
  }

  sliderParams.maxTimesteps = selectedMaxTimesteps;
  sim = new Simulation({
    spawnRate: sliderParams.spawnRate,
    deathRate: sliderParams.deathRate,
    replicationRate: sliderParams.replicationRate,
    mutationRate: sliderParams.mutationRate,
    capacity: sliderParams.capacity,
    maxTimesteps: sliderParams.maxTimesteps
  });
  sim.start();
  winnerShown = false;
  hideWinnerStats();
  updateButtonStates();
}

function togglePause() {
  if (!sim) return;
  if (sim.paused) {
    sim.resume();
  } else {
    sim.pause();
  }
  updateButtonStates();
}

function resetSimulation() {
  sim = null;
  winnerShown = false;
  hideWinnerStats();
  updateButtonStates();
}

function updateButtonStates() {
  let runBtn = document.getElementById('runBtn');
  let pauseBtn = document.getElementById('pauseBtn');

  if (!sim) {
    runBtn.textContent = 'Run';
    runBtn.disabled = false;
    pauseBtn.textContent = 'Pause';
    pauseBtn.disabled = true;
  } else if (sim.complete) {
    runBtn.textContent = 'Complete';
    runBtn.disabled = true;
    pauseBtn.textContent = 'Pause';
    pauseBtn.disabled = true;
  } else if (sim.paused) {
    runBtn.textContent = 'Resume';
    runBtn.disabled = false;
    pauseBtn.textContent = 'Pause';
    pauseBtn.disabled = true;
  } else {
    runBtn.textContent = 'Running...';
    runBtn.disabled = true;
    pauseBtn.textContent = 'Pause';
    pauseBtn.disabled = false;
  }
}

function showWinnerStats() {
  let winnerBox = document.getElementById('winnerBox');
  let winner = sim.getWinnerStats();
  if (!winner || !winner.stats) return;

  document.getElementById('winRepRate').textContent = (winner.stats.replicationRate * 100).toFixed(2) + '%';
  document.getElementById('winDeathRate').textContent = (winner.stats.deathRate * 100).toFixed(2) + '%';
  document.getElementById('winMutRate').textContent = (winner.stats.mutationRate * 100).toFixed(2) + '%';
  document.getElementById('winShare').textContent = winner.percentage + '%';
  winnerBox.classList.add('visible');
  updateButtonStates();
}

function hideWinnerStats() {
  document.getElementById('winnerBox').classList.remove('visible');
}

function togglePanel() {
  let panel = document.getElementById('control-panel');
  let toggle = document.getElementById('toggle-controls');

  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    toggle.classList.remove('visible');
    panelVisible = true;
  } else {
    panel.classList.add('hidden');
    toggle.classList.add('visible');
    panelVisible = false;
  }
}

function keyPressed() {
  if (key === ' ') {
    if (!sim || sim.complete) {
      runSimulation();
    } else {
      togglePause();
    }
    return false; // prevent scroll
  }
  if (key === 'r' || key === 'R') {
    resetSimulation();
  }
  if (key === 'h' || key === 'H') {
    togglePanel();
  }
}
