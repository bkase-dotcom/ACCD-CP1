// detection.js — COCO-SSD Detection Layer
// Uses @tensorflow-models/coco-ssd directly (TF.js 3.x compatible).
//
// Known limitation: COCO-SSD only recognizes ~80 categories from the COCO dataset.
// Demo products should resemble recognizable categories:
//   bottle, cup, book, cell phone, remote, banana, apple, etc.
// If COCO-SSD doesn't detect anything, the rest of the pipeline doesn't run —
// this is the most fragile layer.

class DetectionLayer {
  constructor() {
    this.detector = null;
    this.ready = false;
    this._busy = false;          // prevents overlapping detect() calls
    this.minConfidence = 0.30;   // COCO-SSD confidence floor (lower to catch more objects)
  }

  /** Load the COCO-SSD model via @tensorflow-models/coco-ssd. Returns a promise. */
  async init() {
    if (typeof cocoSsd === 'undefined') {
      throw new Error(
        '@tensorflow-models/coco-ssd not loaded. Check CDN script tags.'
      );
    }
    this.detector = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
    this.ready = true;
    console.log('[DetectionLayer] COCO-SSD ready (lite_mobilenet_v2)');
  }

  /**
   * Run detection on a video / canvas / image element.
   * Returns array of { cocoLabel, confidence, bbox:{x,y,width,height} }
   */
  async detect(source) {
    if (!this.ready || this._busy) return [];
    this._busy = true;

    try {
      const predictions = await this.detector.detect(source);
      return (predictions || [])
        .filter(p => p.score >= this.minConfidence)
        .map(p => ({
          cocoLabel: p.class,
          confidence: p.score,
          bbox: {
            x: p.bbox[0],
            y: p.bbox[1],
            width: p.bbox[2],
            height: p.bbox[3],
          }
        }));
    } catch (err) {
      console.warn('[DetectionLayer] detect error:', err);
      return [];
    } finally {
      this._busy = false;
    }
  }
}
