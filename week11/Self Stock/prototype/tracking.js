// tracking.js — Centroid Tracker
// Assigns persistent IDs to detected objects based on centroid proximity.
// Known limitation: objects that overlap or touch may merge into a single
// COCO-SSD detection — demo should space objects apart.

class CentroidTracker {
  constructor(options = {}) {
    this.maxDisappeared = options.maxDisappeared || 15; // frames before exit event
    this.distanceThreshold = options.distanceThreshold || 80; // px
    this.nextId = 0;
    this.objects = new Map();      // id -> {cx, cy, label, confidence, bbox}
    this.disappeared = new Map();  // id -> consecutive-miss frame count
    this.stockEvents = [];         // [{type:'enter'|'exit', id, label}]
  }

  /* ---- helpers ---- */

  _centroid(bbox) {
    return {
      cx: bbox.x + bbox.width / 2,
      cy: bbox.y + bbox.height / 2
    };
  }

  _dist(a, b) {
    return Math.sqrt((a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2);
  }

  /* ---- public API ---- */

  /**
   * Feed in this frame's classified detections.
   * Each detection: { label, confidence, bbox: {x,y,width,height} }
   * Returns array of tracked objects with persistent IDs.
   */
  update(detections) {
    this.stockEvents = [];

    const inputs = detections.map(d => ({
      ...this._centroid(d.bbox),
      label: d.label,
      confidence: d.confidence,
      bbox: d.bbox
    }));

    // --- no detections this frame ---
    if (inputs.length === 0) {
      for (const [id, count] of this.disappeared) {
        const next = count + 1;
        if (next > this.maxDisappeared) {
          this.stockEvents.push({ type: 'exit', id, label: this.objects.get(id).label });
          this.objects.delete(id);
          this.disappeared.delete(id);
        } else {
          this.disappeared.set(id, next);
        }
      }
      return this._snapshot();
    }

    // --- nothing tracked yet → register all ---
    if (this.objects.size === 0) {
      inputs.forEach(c => this._register(c));
      return this._snapshot();
    }

    // --- greedy closest-pair matching ---
    const ids = [...this.objects.keys()];
    const existing = ids.map(id => this.objects.get(id));

    const pairs = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < inputs.length; j++) {
        pairs.push({ i, j, d: this._dist(existing[i], inputs[j]) });
      }
    }
    pairs.sort((a, b) => a.d - b.d);

    const matchedObj = new Set();
    const matchedIn  = new Set();

    for (const { i, j, d } of pairs) {
      if (matchedObj.has(i) || matchedIn.has(j)) continue;
      if (d > this.distanceThreshold) continue;
      // update existing tracked object
      this.objects.set(ids[i], inputs[j]);
      this.disappeared.set(ids[i], 0);
      matchedObj.add(i);
      matchedIn.add(j);
    }

    // new objects (unmatched inputs)
    for (let j = 0; j < inputs.length; j++) {
      if (!matchedIn.has(j)) this._register(inputs[j]);
    }

    // disappeared objects (unmatched existing)
    for (let i = 0; i < ids.length; i++) {
      if (matchedObj.has(i)) continue;
      const id = ids[i];
      const next = (this.disappeared.get(id) || 0) + 1;
      if (next > this.maxDisappeared) {
        this.stockEvents.push({ type: 'exit', id, label: this.objects.get(id).label });
        this.objects.delete(id);
        this.disappeared.delete(id);
      } else {
        this.disappeared.set(id, next);
      }
    }

    return this._snapshot();
  }

  getStockEvents() { return this.stockEvents; }

  reset() {
    this.objects.clear();
    this.disappeared.clear();
    this.stockEvents = [];
    this.nextId = 0;
  }

  /* ---- internal ---- */

  _register(centroid) {
    const id = this.nextId++;
    this.objects.set(id, centroid);
    this.disappeared.set(id, 0);
    this.stockEvents.push({ type: 'enter', id, label: centroid.label });
  }

  _snapshot() {
    return [...this.objects.entries()].map(([id, o]) => ({ id, ...o }));
  }
}
