// sketch.js — Main App Orchestrator
// Wires together detection.js, classification.js, and tracking.js.
// Uses p5.js for camera capture and overlay rendering.
// Manages onboarding state machine, product inventory, and real-time stock.

/* ================================================================
   APP STATES
   ================================================================ */
const AppState = {
  LOADING:              'loading',
  ONBOARDING_WELCOME:   'onboarding_welcome',
  ONBOARDING_NAME:      'onboarding_name',
  ONBOARDING_CAPTURE:   'onboarding_capture',
  ONBOARDING_TRAIN:     'onboarding_train',
  ONBOARDING_THUMBNAIL: 'onboarding_thumbnail',
  ONBOARDING_DONE:      'onboarding_done',
  TRACKING:             'tracking',
};

/* ================================================================
   GLOBALS
   ================================================================ */
let state = AppState.LOADING;

// ML layers
const detection      = new DetectionLayer();
const classification = new ClassificationLayer();
const tracker        = new CentroidTracker({ maxDisappeared: 12, distanceThreshold: 80 });

// Products & tracking
let products          = [];       // {name, thumbnail, stock, color}
let trackedObjects    = [];
let currentProductName = '';
let captureCount       = 0;
let pendingThumbnail   = null;    // dataURL set by thumbnail capture step
let thumbCountdown     = null;    // active countdown timer ID

const MIN_SAMPLES           = 40;   // higher bar now that continuous capture is easy
const CAPTURE_INTERVAL_MS   = 250;  // ~4 frames/sec — accounts for COCO-SSD per frame
const CONFIDENCE_THRESHOLD        = 0.40;  // default for non-person COCO detections
const PERSON_CONFIDENCE_THRESHOLD = 0.75;  // higher bar when COCO says "person" (hand filter)
const DETECT_EVERY_N_FRAMES = 4;    // run pipeline every N p5 frames

const PRODUCT_COLORS = ['#22c5c2','#2563eb','#f59e0b','#ef4444','#8b5cf6','#10b981'];

// p5 references (set in setup)
let video;            // p5 capture element
let p5ref;            // p5 instance reference

/* ================================================================
   P5 SKETCH  (instance mode)
   ================================================================ */
const appSketch = (p) => {
  p5ref = p;

  p.setup = async function () {
    const cnv = p.createCanvas(640, 480);
    cnv.parent('camera-feed');

    video = p.createCapture(p.VIDEO, () => {
      console.log('[p5] Camera stream ready');
    });
    video.size(640, 480);
    video.hide();

    // ----- load ML models -----
    updateStatus('Loading COCO-SSD detection model…');
    await detection.init();

    updateStatus('Loading Teachable Machine base model…');
    await classification.init();   // no video element needed — samples via canvas

    updateStatus('Models loaded — ready');
    transition(AppState.ONBOARDING_WELCOME);
  };

  p.draw = function () {
    // always draw the camera feed (mirrored so it feels natural)
    if (video && video.elt.readyState >= 2) {
      p.push();
      p.translate(p.width, 0);
      p.scale(-1, 1);
      p.image(video, 0, 0, p.width, p.height);
      p.pop();
    }

    // detection overlay + pipeline (tracking mode only)
    if (state === AppState.TRACKING) {
      drawOverlays(p);
      if (p.frameCount % DETECT_EVERY_N_FRAMES === 0) {
        runPipeline();
      }
    }
  };
};

/* ================================================================
   DETECTION  →  CLASSIFICATION  →  TRACKING  PIPELINE
   ================================================================ */
// Persistent pipeline crop canvas (avoid re-creating every frame)
const pipelineCropCnv = document.createElement('canvas');
pipelineCropCnv.width  = 224;
pipelineCropCnv.height = 224;
const pipelineCropCtx  = pipelineCropCnv.getContext('2d');
let pipelineBusy = false;    // prevent overlapping async pipeline runs

async function runPipeline() {
  if (pipelineBusy) return;
  pipelineBusy = true;

  try {
    // Layer 1 — COCO-SSD
    const dets = await detection.detect(video.elt);

    if (dets.length === 0) {
      trackedObjects = tracker.update([]);
      processStockEvents();
      updateStatus(`Tracking ${products.length} product(s) — COCO sees 0 objects`);
      return;
    }

    // Pass ALL detections to the TM classifier — including "person".
    // COCO-SSD often labels a hand-holding-product as "person", but the
    // Teachable Machine can still identify the product from that crop.
    // The _background class + confidence threshold handle false positives.
    const objectDets = dets;

    // Layer 2 — classify each crop through TM model
    const classified = [];
    const debugParts = [];     // for on-screen diagnostics

    for (const det of objectDets) {
      const { x, y, width: w, height: h } = det.bbox;
      const cx = Math.max(0, Math.round(x));
      const cy = Math.max(0, Math.round(y));
      const cw = Math.min(Math.round(w), video.elt.videoWidth  - cx);
      const ch = Math.min(Math.round(h), video.elt.videoHeight - cy);
      if (cw < 20 || ch < 20) continue;

      pipelineCropCtx.clearRect(0, 0, 224, 224);
      pipelineCropCtx.drawImage(video.elt, cx, cy, cw, ch, 0, 0, 224, 224);

      const res = await classification.classify(pipelineCropCnv);
      const conf = res ? (res.confidence * 100).toFixed(0) : '?';
      const lbl  = res ? res.label : 'null';
      debugParts.push(`${det.cocoLabel}→${lbl}(${conf}%)`);

      console.log(`[Pipeline] COCO: "${det.cocoLabel}" → TM: "${lbl}" (${conf}%)`);

      // Use a higher confidence threshold when COCO says "person" —
      // the model needs to be very sure it's a product, not just a hand.
      const isPerson = det.cocoLabel === 'person' || det.cocoLabel === 'hand';
      const threshold = isPerson ? PERSON_CONFIDENCE_THRESHOLD : CONFIDENCE_THRESHOLD;

      if (res && res.confidence > threshold && res.label !== '_background') {
        classified.push({
          label:      res.label,
          confidence: res.confidence,
          bbox:       det.bbox,
          cocoLabel:  det.cocoLabel
        });
      }
    }

    // Layer 3 — centroid tracker
    trackedObjects = tracker.update(classified);
    processStockEvents();

    // Diagnostic status bar showing full pipeline state
    updateStatus(
      `${trackedObjects.length} tracked | ${debugParts.join(', ')}`
    );
  } catch (err) {
    console.error('[Pipeline] Error:', err);
  } finally {
    pipelineBusy = false;
  }
}

function processStockEvents() {
  for (const ev of tracker.getStockEvents()) {
    const prod = products.find(p => p.name === ev.label);
    if (!prod) continue;
    if (ev.type === 'enter') prod.stock++;
    if (ev.type === 'exit')  prod.stock = Math.max(0, prod.stock - 1);
    refreshCard(prod);
  }
}

/* ================================================================
   OVERLAY DRAWING  (runs inside p5.draw)
   ================================================================ */
function drawOverlays(p) {
  // Mirror the overlay coordinate space to match the flipped camera feed
  p.push();
  p.translate(p.width, 0);
  p.scale(-1, 1);

  for (const obj of trackedObjects) {
    const { bbox, label, confidence, id } = obj;

    // bounding box
    p.noFill();
    p.stroke(34, 197, 194);       // #22c5c2
    p.strokeWeight(2);
    p.rect(bbox.x, bbox.y, bbox.width, bbox.height, 4);

    // label pill — flip text back so it reads left-to-right
    const txt = `${label}  ${Math.round(confidence * 100)}%  #${id}`;
    p.push();
    p.translate(bbox.x + bbox.width / 2, bbox.y - 13);
    p.scale(-1, 1);   // un-mirror for readable text
    p.textFont('system-ui');
    p.textSize(13);
    const tw = p.textWidth(txt);
    p.fill(15, 23, 42, 210);
    p.noStroke();
    p.rectMode(p.CENTER);
    p.rect(0, 0, tw + 12, 22, 4);
    p.fill(34, 197, 194);
    p.textAlign(p.CENTER, p.CENTER);
    p.text(txt, 0, 0);
    p.pop();
  }

  p.pop();
}

/* ================================================================
   ONBOARDING STATE MACHINE
   ================================================================ */
function transition(next) {
  state = next;

  const modal     = document.getElementById('onboarding-modal');
  const captureUI = document.getElementById('capture-ui');

  // hide everything first, then show what's needed
  captureUI.classList.add('hidden');
  document.getElementById('thumbnail-ui').classList.add('hidden');
  if (thumbCountdown) { clearInterval(thumbCountdown); thumbCountdown = null; }

  switch (state) {

    /* ---- Loading ---- */
    case AppState.LOADING:
      showModal('Loading…',
        '<p>Initialising camera and ML models. This may take a moment.</p>', []);
      break;

    /* ---- Welcome ---- */
    case AppState.ONBOARDING_WELCOME:
      showModal('Welcome to Self Stock',
        `<p>Self Stock uses machine learning to track product inventory in real time
           using just your camera.</p>
         <p>First, you'll train the system to recognise your products by holding each
           one in front of the camera from multiple angles.</p>
         <p class="hint"><strong>Important:</strong> Add <em>all</em> your products before
           starting tracking. The model needs to learn the difference between each product,
           so training multiple items together gives much better accuracy.</p>`,
        [{ text: 'Get Started', primary: true,
           action: () => transition(AppState.ONBOARDING_NAME) }]);
      break;

    /* ---- Name your product ---- */
    case AppState.ONBOARDING_NAME:
      currentProductName = '';
      captureCount = 0;
      showModal('Name Your Product',
        `<div class="input-group">
           <label for="product-name-input">What product are you adding?</label>
           <input type="text" id="product-name-input"
                  placeholder="e.g. Water Bottle" autofocus>
         </div>`,
        [
          { text: 'Cancel',
            action: () => transition(products.length ? AppState.TRACKING
                                                      : AppState.ONBOARDING_WELCOME) },
          { text: 'Next', primary: true,
            action: () => {
              const v = document.getElementById('product-name-input').value.trim();
              if (!v) return;
              currentProductName = v;
              transition(AppState.ONBOARDING_CAPTURE);
            }}
        ]);
      // auto-focus the input after modal renders
      requestAnimationFrame(() => {
        const inp = document.getElementById('product-name-input');
        if (inp) inp.focus();
      });
      break;

    /* ---- Capture samples ---- */
    case AppState.ONBOARDING_CAPTURE:
      stopRecording();   // ensure clean state if returning from train failure
      modal.classList.add('hidden');
      captureUI.classList.remove('hidden');
      document.getElementById('capture-product-name').textContent = currentProductName;
      captureCount = classification.getSampleCount(currentProductName);
      initCaptureButton();
      refreshCaptureUI();
      break;

    /* ---- Training ---- */
    case AppState.ONBOARDING_TRAIN:
      showModal('Training Model',
        `<div class="training-progress">
           <div class="spinner"></div>
           <p id="training-status">Preparing training data…</p>
           <p class="hint">This may take 15-30 seconds.</p>
         </div>`, []);
      doTraining();
      break;

    /* ---- Thumbnail capture ---- */
    case AppState.ONBOARDING_THUMBNAIL:
      pendingThumbnail = null;
      modal.classList.add('hidden');
      captureUI.classList.add('hidden');
      document.getElementById('thumbnail-ui').classList.remove('hidden');
      document.getElementById('thumb-product-name').textContent = currentProductName;
      const thumbName2 = document.getElementById('thumb-product-name-2');
      if (thumbName2) thumbName2.textContent = currentProductName;
      // reset preview
      document.getElementById('thumb-preview').classList.add('hidden');
      document.getElementById('thumb-prompt').classList.remove('hidden');
      document.getElementById('thumb-countdown-display').textContent = '';
      initThumbnailUI();
      break;

    /* ---- Product added ---- */
    case AppState.ONBOARDING_DONE:
      document.getElementById('thumbnail-ui').classList.add('hidden');
      registerProduct(currentProductName, pendingThumbnail);
      {
        const prodCount = products.length;
        const recommendMore = prodCount < 2;
        showModal('Product Added!',
          `<p><strong>${currentProductName}</strong> is now in your inventory
             (${prodCount} product${prodCount > 1 ? 's' : ''} total).</p>
           ${recommendMore
             ? '<p class="hint"><strong>Recommended:</strong> Add at least one more product so the model can learn to tell them apart. With only one product trained, all objects tend to be classified as that product.</p>'
             : '<p>You can add more products or start tracking.</p>'}`,
          [
            { text: 'Add Another', primary: recommendMore,
              action: () => transition(AppState.ONBOARDING_NAME) },
            { text: 'Start Tracking', primary: !recommendMore,
              action: () => {
                document.getElementById('onboarding-modal').classList.add('hidden');
                transition(AppState.TRACKING);
              }}
          ]);
      }
      break;

    /* ---- Tracking mode ---- */
    case AppState.TRACKING:
      modal.classList.add('hidden');
      tracker.reset();                 // clear stale tracking IDs
      trackedObjects = [];
      document.getElementById('add-product-btn').classList.remove('hidden');
      updateStatus(`Tracking ${products.length} product(s)`);
      break;
  }
}

/* ================================================================
   MODAL HELPER
   ================================================================ */
function showModal(title, bodyHTML, buttons) {
  const modal   = document.getElementById('onboarding-modal');
  const mTitle  = document.getElementById('modal-title');
  const mBody   = document.getElementById('modal-body');
  const mActs   = document.getElementById('modal-actions');

  mTitle.textContent = title;
  mBody.innerHTML    = bodyHTML;
  mActs.innerHTML    = '';

  for (const b of buttons) {
    const el = document.createElement('button');
    el.textContent = b.text;
    el.className   = b.primary ? 'btn btn-primary' : 'btn btn-secondary';
    el.addEventListener('click', b.action);
    mActs.appendChild(el);
  }
  modal.classList.remove('hidden');
}

/* ================================================================
   CAPTURE FLOW  — continuous hold-to-record (like Teachable Machine)
   ================================================================ */
let captureTimer = null;
let isRecording  = false;

function initCaptureButton() {
  const btn = document.getElementById('record-btn');
  if (!btn) return;

  const start = () => startRecording();
  const stop  = () => stopRecording();

  // mouse
  btn.addEventListener('mousedown', start);
  btn.addEventListener('mouseup', stop);
  btn.addEventListener('mouseleave', stop);
  // touch
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); start(); });
  btn.addEventListener('touchend', stop);
  btn.addEventListener('touchcancel', stop);
}

function startRecording() {
  if (isRecording || !currentProductName || state !== AppState.ONBOARDING_CAPTURE) return;
  isRecording = true;

  const btn   = document.getElementById('record-btn');
  const label = document.getElementById('record-label');
  if (btn)   btn.classList.add('recording');
  if (label) label.textContent = 'Recording…';

  // capture one frame immediately, then repeat on interval
  captureOneFrame();
  captureTimer = setInterval(captureOneFrame, CAPTURE_INTERVAL_MS);
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  clearInterval(captureTimer);
  captureTimer = null;

  const btn   = document.getElementById('record-btn');
  const label = document.getElementById('record-label');
  if (btn)   btn.classList.remove('recording');
  if (label) label.textContent = 'Hold to Record';
}

// Reusable crop canvas for training samples — sized to match the 224x224
// crops the classifier receives at runtime from COCO-SSD bounding boxes.
const trainCropCnv = document.createElement('canvas');
trainCropCnv.width  = 224;
trainCropCnv.height = 224;
const trainCropCtx  = trainCropCnv.getContext('2d');

let captureBusy = false;   // prevents overlapping async captures

async function captureOneFrame() {
  if (!currentProductName || captureBusy) return;
  captureBusy = true;

  try {
    // Run COCO-SSD on the current frame — same detection used during
    // live tracking — so training samples are cropped identically to
    // what the classifier will see at runtime.
    const dets = await detection.detect(video.elt);
    // Don't filter out "person" — COCO-SSD often labels hand+product as
    // "person". Let all detections through; TM handles classification.
    const candidates = (dets || []);

    if (candidates.length === 0) {
      // No object detected — skip this frame silently.
      // The hint text tells the user COCO-SSD must see the object.
      updateCaptureHint('No object detected — adjust position');
      captureBusy = false;
      return;
    }

    // Pick the largest detection (most likely the product being trained)
    candidates.sort((a, b) =>
      (b.bbox.width * b.bbox.height) - (a.bbox.width * a.bbox.height));
    const best = candidates[0].bbox;

    // Crop to the bounding box, same as the runtime pipeline
    const sx = Math.max(0, Math.round(best.x));
    const sy = Math.max(0, Math.round(best.y));
    const sw = Math.min(Math.round(best.width),  video.elt.videoWidth  - sx);
    const sh = Math.min(Math.round(best.height), video.elt.videoHeight - sy);

    if (sw < 20 || sh < 20) { captureBusy = false; return; }

    trainCropCtx.clearRect(0, 0, 224, 224);
    trainCropCtx.drawImage(video.elt, sx, sy, sw, sh, 0, 0, 224, 224);

    captureCount = classification.addSample(currentProductName, trainCropCnv);
    refreshCaptureUI();
    updateCaptureHint('');

    // subtle flash
    const flash = document.getElementById('capture-flash');
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 80);

  } catch (err) {
    console.error('[captureOneFrame] Error:', err);
    updateCaptureHint('Capture error — check console');
  } finally {
    captureBusy = false;
  }
}

function updateCaptureHint(msg) {
  const el = document.getElementById('capture-fps');
  if (!el) return;
  if (msg) {
    el.textContent = msg;
    el.style.color = '#f59e0b';  // amber warning
  } else {
    el.style.color = '';
    refreshCaptureUI();           // restore normal hint text
  }
}

function refreshCaptureUI() {
  const countEl    = document.getElementById('capture-count');
  const progressEl = document.getElementById('capture-progress');
  const trainBtn   = document.getElementById('train-btn');
  const fpsEl      = document.getElementById('capture-fps');

  if (countEl)    countEl.textContent    = captureCount;
  if (progressEl) progressEl.style.width = Math.min(100, (captureCount / MIN_SAMPLES) * 100) + '%';
  if (trainBtn)   trainBtn.disabled      = captureCount < MIN_SAMPLES;
  if (fpsEl)      fpsEl.textContent      = captureCount >= MIN_SAMPLES
                    ? 'Enough samples — you can keep recording or train now'
                    : `${Math.max(0, MIN_SAMPLES - captureCount)} more needed`;
}

async function doTraining() {
  try {
    // Teachable Machine needs at least 2 classes for transfer learning.
    // Build a robust _background class from three sources:
    //   1. COCO-SSD "person" crops — teaches model that hands/arms ≠ products
    //   2. Random scene crops — general background variety
    //   3. Full-frame captures — the overall scene without product focus
    const bgLabel = '_background';
    if (!classification.getLabels().includes(bgLabel)) {
      const statusEl = document.getElementById('training-status');
      if (statusEl) statusEl.textContent = 'Capturing background + hand samples…';

      const vw = video.elt.videoWidth;
      const vh = video.elt.videoHeight;
      let bgCount = 0;

      // Source 1: COCO-SSD "person" detections → these ARE the hand/arm crops
      // that would otherwise cause false positives. Capture ~10 frames worth.
      for (let attempt = 0; attempt < 10; attempt++) {
        const dets = await detection.detect(video.elt);
        const personDets = (dets || []).filter(d => d.cocoLabel === 'person');
        for (const pd of personDets) {
          const sx = Math.max(0, Math.round(pd.bbox.x));
          const sy = Math.max(0, Math.round(pd.bbox.y));
          const sw = Math.min(Math.round(pd.bbox.width),  vw - sx);
          const sh = Math.min(Math.round(pd.bbox.height), vh - sy);
          if (sw < 20 || sh < 20) continue;
          trainCropCtx.clearRect(0, 0, 224, 224);
          trainCropCtx.drawImage(video.elt, sx, sy, sw, sh, 0, 0, 224, 224);
          classification.addSample(bgLabel, trainCropCnv);
          bgCount++;
        }
        await new Promise(r => setTimeout(r, 150));
      }
      console.log(`[Training] Added ${bgCount} person/hand background samples`);

      // Source 2: Random scene crops at various scales
      const RANDOM_BG = 10;
      for (let i = 0; i < RANDOM_BG; i++) {
        const scale = 0.3 + Math.random() * 0.5;
        const cw = Math.round(vw * scale);
        const ch = Math.round(vh * scale);
        const cx = Math.round(Math.random() * (vw - cw));
        const cy = Math.round(Math.random() * (vh - ch));
        trainCropCtx.clearRect(0, 0, 224, 224);
        trainCropCtx.drawImage(video.elt, cx, cy, cw, ch, 0, 0, 224, 224);
        classification.addSample(bgLabel, trainCropCnv);
        bgCount++;
      }

      // Source 3: Full-frame captures (the scene as COCO-SSD would see it)
      for (let i = 0; i < 5; i++) {
        trainCropCtx.clearRect(0, 0, 224, 224);
        trainCropCtx.drawImage(video.elt, 0, 0, vw, vh, 0, 0, 224, 224);
        classification.addSample(bgLabel, trainCropCnv);
        bgCount++;
        await new Promise(r => setTimeout(r, 100));
      }

      console.log(`[Training] Total background samples: ${bgCount}`);
    }

    const statusEl = document.getElementById('training-status');
    if (statusEl) statusEl.textContent = 'Feeding samples to model…';

    await classification.train((epoch, loss, valLoss) => {
      if (statusEl) {
        const lossStr  = (loss != null)    ? loss.toFixed(4)    : '—';
        const valStr   = (valLoss != null) ? valLoss.toFixed(4) : '—';
        statusEl.textContent = `Epoch ${epoch + 1}/50 — loss: ${lossStr}  val: ${valStr}`;
      }
    });
    transition(AppState.ONBOARDING_THUMBNAIL);
  } catch (err) {
    console.error('[Training]', err);
    showModal('Training Failed',
      `<p>${err.message}</p>`,
      [{ text: 'Try Again', primary: true,
         action: () => transition(AppState.ONBOARDING_CAPTURE) }]);
  }
}

/* ================================================================
   THUMBNAIL CAPTURE  — timed photo + COCO-SSD auto-crop
   ================================================================ */
let thumbTimerSeconds = 3;   // default countdown

function initThumbnailUI() {
  // slider
  const slider = document.getElementById('thumb-timer-slider');
  const label  = document.getElementById('thumb-timer-label');
  if (slider) {
    slider.value = thumbTimerSeconds;
    slider.addEventListener('input', () => {
      thumbTimerSeconds = parseInt(slider.value, 10);
      if (label) label.textContent = `${thumbTimerSeconds}s`;
    });
  }
  if (label) label.textContent = `${thumbTimerSeconds}s`;

  // capture button
  const btn = document.getElementById('thumb-capture-btn');
  if (btn) {
    // remove old listeners by replacing node
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', startThumbCountdown);
  }

  // retake button
  const retake = document.getElementById('thumb-retake-btn');
  if (retake) {
    const fresh = retake.cloneNode(true);
    retake.parentNode.replaceChild(fresh, retake);
    fresh.addEventListener('click', () => {
      pendingThumbnail = null;
      document.getElementById('thumb-preview').classList.add('hidden');
      document.getElementById('thumb-prompt').classList.remove('hidden');
      document.getElementById('thumb-countdown-display').textContent = '';
    });
  }

  // use button
  const useBtn = document.getElementById('thumb-use-btn');
  if (useBtn) {
    const fresh = useBtn.cloneNode(true);
    useBtn.parentNode.replaceChild(fresh, useBtn);
    fresh.addEventListener('click', () => {
      if (pendingThumbnail) transition(AppState.ONBOARDING_DONE);
    });
  }
}

function startThumbCountdown() {
  const display = document.getElementById('thumb-countdown-display');
  const captBtn = document.getElementById('thumb-capture-btn');
  if (captBtn) captBtn.disabled = true;

  let remaining = thumbTimerSeconds;
  display.textContent = remaining;

  thumbCountdown = setInterval(() => {
    remaining--;
    if (remaining > 0) {
      display.textContent = remaining;
    } else {
      clearInterval(thumbCountdown);
      thumbCountdown = null;
      display.textContent = '';
      if (captBtn) captBtn.disabled = false;
      takeThumbPhoto();
    }
  }, 1000);
}

async function takeThumbPhoto() {
  // Flash
  const flash = document.getElementById('capture-flash');
  flash.classList.add('active');
  setTimeout(() => flash.classList.remove('active'), 200);

  // Try COCO-SSD auto-crop — use any detection (including "person",
  // since COCO often labels hand+product as person)
  const dets = await detection.detect(video.elt);
  const candidates = (dets || []);

  let sx = 0, sy = 0, sw = video.elt.videoWidth, sh = video.elt.videoHeight;

  if (candidates.length > 0) {
    // pick the biggest bounding box by area
    candidates.sort((a, b) =>
      (b.bbox.width * b.bbox.height) - (a.bbox.width * a.bbox.height));
    const best = candidates[0].bbox;

    // add a small margin (10%) around the crop
    const margin = 0.10;
    const mx = best.width * margin;
    const my = best.height * margin;
    sx = Math.max(0, Math.round(best.x - mx));
    sy = Math.max(0, Math.round(best.y - my));
    sw = Math.min(Math.round(best.width + mx * 2), video.elt.videoWidth - sx);
    sh = Math.min(Math.round(best.height + my * 2), video.elt.videoHeight - sy);
    console.log('[Thumbnail] Auto-cropped via COCO-SSD:', { sx, sy, sw, sh });
  } else {
    console.log('[Thumbnail] No COCO-SSD detection — using full frame');
  }

  // Render to square canvas for clean card thumbnail
  const size = 300;
  const tc = document.createElement('canvas');
  tc.width = size;
  tc.height = size;
  const ctx = tc.getContext('2d');

  // fit the crop into the square, centered, with white background
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, size, size);

  const aspect = sw / sh;
  let dx, dy, dw, dh;
  if (aspect > 1) {
    dw = size;
    dh = size / aspect;
    dx = 0;
    dy = (size - dh) / 2;
  } else {
    dh = size;
    dw = size * aspect;
    dx = (size - dw) / 2;
    dy = 0;
  }

  ctx.drawImage(video.elt, sx, sy, sw, sh, dx, dy, dw, dh);
  pendingThumbnail = tc.toDataURL('image/jpeg', 0.85);

  // Show preview
  document.getElementById('thumb-prompt').classList.add('hidden');
  document.getElementById('thumb-preview').classList.remove('hidden');
  document.getElementById('thumb-preview-img').src = pendingThumbnail;
}

/* ================================================================
   PRODUCT MANAGEMENT & CARDS
   ================================================================ */
function registerProduct(name, thumbnailOverride) {
  let thumbnail = thumbnailOverride || null;

  // fallback: grab from live camera if no dedicated thumbnail
  if (!thumbnail) {
    const tc = document.createElement('canvas');
    tc.width = 160; tc.height = 120;
    tc.getContext('2d').drawImage(video.elt, 0, 0, 160, 120);
    thumbnail = tc.toDataURL('image/jpeg', 0.7);
  }

  const prod = {
    name,
    thumbnail,
    stock: 0,
    color: PRODUCT_COLORS[products.length % PRODUCT_COLORS.length]
  };
  products.push(prod);
  renderCard(prod);
}

function renderCard(prod) {
  const shelf = document.querySelector('#shelf-container .shelf-row');
  const card  = document.createElement('div');
  card.className = 'product-card';
  card.id = cardId(prod.name);
  card.style.borderColor = prod.color;
  card.innerHTML = `
    <div class="product-card-image">
      <img src="${prod.thumbnail}" alt="${prod.name}">
    </div>
    <span class="product-card-name">${prod.name}</span>
    <span class="product-card-stock" style="color:${prod.color}">
      ${prod.stock} in view
    </span>`;
  card.addEventListener('click', () => showDetail(prod));
  shelf.appendChild(card);
}

function refreshCard(prod) {
  const card = document.getElementById(cardId(prod.name));
  if (!card) return;
  const el = card.querySelector('.product-card-stock');
  if (el) {
    el.textContent = `${prod.stock} in view`;
    el.classList.add('stock-pulse');
    setTimeout(() => el.classList.remove('stock-pulse'), 500);
  }
}

function showDetail(prod) {
  const panel = document.getElementById('detail-panel');
  panel.classList.remove('hidden');
  document.getElementById('detail-image').src          = prod.thumbnail;
  document.getElementById('detail-name').textContent   = prod.name;
  document.getElementById('detail-stock').textContent  = prod.stock;

  document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected'));
  const c = document.getElementById(cardId(prod.name));
  if (c) c.classList.add('selected');
}

function cardId(name) {
  return 'card-' + name.replace(/\s+/g, '-').toLowerCase();
}

/* ================================================================
   UTILITIES
   ================================================================ */
function updateStatus(text) {
  const el = document.getElementById('status-bar');
  if (el) el.textContent = text;
}

/* ================================================================
   BOOT
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // wire up global buttons
  document.getElementById('add-product-btn')
    .addEventListener('click', () => transition(AppState.ONBOARDING_NAME));

  // start p5
  new p5(appSketch);
});
