// classification.js — Teachable Machine Classification Layer
// Uses Google's @teachablemachine/image for in-browser transfer learning.
//
// Architecture: Samples are buffered locally as ImageData during capture,
// then fed to the TM model in a single batch at training time. This avoids
// the issue where calling setLabels() reinitialises the internal dataset
// and wipes previously stored examples.
//
// Training flow:
//   1. init()                    — loads the base MobileNet model
//   2. addSample(label, canvas)  — buffers a 224×224 canvas locally (synchronous)
//   3. train(progressCallback)   — setLabels → addExample × N → train
//   4. classify(canvas)          — returns {label, confidence}

class ClassificationLayer {
  constructor() {
    this.model = null;       // tmImage.Teachable instance
    this.ready = false;
    this.trained = false;
    this._labelMap = [];     // index → label name
    this._sampleCounts = new Map(); // label → count
    // Buffered training samples — stored as {labelIndex, imageData}
    // Fed to the TM model in bulk at train() time.
    this._storedSamples = [];
  }

  /**
   * Initialise the Teachable Machine base model.
   */
  async init() {
    if (typeof tmImage === 'undefined') {
      throw new Error(
        '@teachablemachine/image not loaded. Check CDN script tags.'
      );
    }

    this.model = await tmImage.createTeachable(
      { tpiModelUrl: undefined },
      { version: 2, alpha: 0.35 }
    );

    this.ready = true;
    console.log('[ClassificationLayer] Teachable Machine base model ready');
  }

  /**
   * Register a class label in our local map.
   * Does NOT call setLabels() — that happens once at train() time.
   */
  _ensureLabel(label) {
    let idx = this._labelMap.indexOf(label);
    if (idx === -1) {
      idx = this._labelMap.length;
      this._labelMap.push(label);
      console.log(`[ClassificationLayer] Registered label "${label}" at index ${idx}`);
    }
    return idx;
  }

  /**
   * Buffer a training sample locally. imageSource must be a <canvas>.
   * This is SYNCHRONOUS — it copies pixel data immediately.
   * Returns the running sample count for this label.
   */
  addSample(label, canvasElement) {
    if (!this.ready) {
      console.warn('[ClassificationLayer] addSample called before ready');
      return 0;
    }
    const idx = this._ensureLabel(label);
    const count = (this._sampleCounts.get(label) || 0) + 1;
    this._sampleCounts.set(label, count);

    // Copy pixel data from the canvas into an ImageData object.
    // This is a snapshot — safe even though the canvas is reused.
    try {
      const ctx = canvasElement.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height);
      this._storedSamples.push({ labelIndex: idx, imageData });

      if (count % 10 === 0 || count <= 3) {
        console.log(`[ClassificationLayer] Buffered sample #${count} for "${label}" (class ${idx})`);
      }
    } catch (err) {
      console.error('[ClassificationLayer] Failed to buffer sample:', err);
    }
    return count;
  }

  getSampleCount(label) {
    return this._sampleCounts.get(label) || 0;
  }

  getTotalSamples() {
    let total = 0;
    for (const c of this._sampleCounts.values()) total += c;
    return total;
  }

  getLabels() {
    return [...this._labelMap];
  }

  /**
   * Train the classifier head.
   * 1. Calls setLabels() ONCE with all known labels
   * 2. Feeds all buffered samples into the TM model via addExample()
   * 3. Runs training
   *
   * progressCallback(epoch, loss, val_loss) fires every epoch.
   */
  async train(progressCallback) {
    if (!this.ready) throw new Error('Model not initialised');
    if (this._labelMap.length < 2) {
      throw new Error('Need at least 2 classes (add a background class)');
    }

    console.log('[ClassificationLayer] ===== TRAINING START =====');
    console.log('  Labels:', this._labelMap);
    console.log('  Samples per label:', Object.fromEntries(this._sampleCounts));
    console.log('  Total buffered samples:', this._storedSamples.length);

    // Disable classification while we rebuild — prevents stale model from
    // being used by the pipeline during the retrain window.
    this.trained = false;

    // Step 0 — create a FRESH model so the dense layer is sized for the
    // current number of classes. Without this, adding a 3rd class after
    // training with 2 causes a shape mismatch (e.g. [16,2] vs [16,3]).
    this.model = await tmImage.createTeachable(
      { tpiModelUrl: undefined },
      { version: 2, alpha: 0.35 }
    );
    console.log('[ClassificationLayer] Fresh TM model created for', this._labelMap.length, 'classes');

    // Step 1 — set all labels at once (initialises internal dataset)
    this.model.setLabels(this._labelMap);
    console.log('[ClassificationLayer] setLabels() called with', this._labelMap.length, 'classes');

    // Step 2 — feed all buffered samples into the TM model
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 224;
    tempCanvas.height = 224;
    const tempCtx = tempCanvas.getContext('2d');

    for (let i = 0; i < this._storedSamples.length; i++) {
      const sample = this._storedSamples[i];
      tempCtx.putImageData(sample.imageData, 0, 0);
      await this.model.addExample(sample.labelIndex, tempCanvas);

      // Progress logging every 20 samples
      if ((i + 1) % 20 === 0 || i === this._storedSamples.length - 1) {
        console.log(`[ClassificationLayer] Fed ${i + 1}/${this._storedSamples.length} samples to TM`);
      }
    }

    // Step 3 — train
    console.log('[ClassificationLayer] Starting TF.js training...');
    await this.model.train({
      denseUnits: 100,
      epochs: 50,
      learningRate: 0.001,
      batchSize: 16,
      shuffle: true,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          const loss = logs ? logs.loss : null;
          const val  = logs ? logs.val_loss : null;
          if ((epoch + 1) % 5 === 0 || epoch === 0) {
            console.log(
              `[ClassificationLayer] Epoch ${epoch + 1}` +
              (loss != null ? `, loss: ${loss.toFixed(5)}` : '') +
              (val  != null ? `, val_loss: ${val.toFixed(5)}` : '')
            );
          }
          if (progressCallback) progressCallback(epoch, loss, val);
        },
      },
    });

    this.trained = true;
    console.log('[ClassificationLayer] Training complete');
    console.log(`  Model knows ${this._labelMap.length} classes: ${this._labelMap.join(', ')}`);
  }

  /**
   * Classify an image / canvas.
   * Returns { label, confidence } or null.
   */
  async classify(imageSource) {
    if (!this.trained || !imageSource) return null;

    try {
      const predictions = await this.model.predict(imageSource);
      if (!predictions || predictions.length === 0) return null;

      // Find the highest probability prediction
      let best = predictions[0];
      for (let i = 1; i < predictions.length; i++) {
        if (predictions[i].probability > best.probability) {
          best = predictions[i];
        }
      }
      return {
        label: best.className,
        confidence: best.probability,
      };
    } catch (err) {
      console.error('[ClassificationLayer] predict failed:', err);
      return null;
    }
  }
}
