# Rooted Vector Field Visualization

A P5.js visualization where vectors remain anchored to grid positions and animate by changing their direction and length over time. Inspired by fluid dynamics flow field visualizations and macOS vector screensavers.

## Visual Concept

Unlike particle-based flow fields, this visualization shows the **field itself** - each vector is rooted to a specific position and displays:
- **Direction**: Where the flow is pointing at that location
- **Magnitude**: How strong the flow is (shown by vector length)
- **Color**: HSB mapping based on angle and strength

The result is a mesmerizing, wave-like pattern of arrows that ebb and flow across the screen.

## Features

- **Rooted Grid System**: Vectors stay in fixed positions
- **Dynamic Animation**: Angles and lengths change smoothly based on Perlin noise
- **HSB Color Mode**: Hue shifts with direction, saturation/brightness with magnitude
- **Smooth Interpolation**: Lerping prevents jarring transitions
- **Interactive Controls**: Adjust grid spacing and reset patterns
- **Arrowheads**: Visual indicators showing direction clearly
- **Trail Effects**: Semi-transparent background creates motion blur

## Controls

- **R** - Reset and jump to new noise pattern
- **+** - Increase vector spacing (fewer, larger vectors)
- **-** - Decrease vector spacing (more, smaller vectors)

## How to Run

1. Open `index_rooted.html` in a web browser
2. Watch the vectors dance and flow
3. Use keyboard controls to adjust the visualization

## Technical Implementation

### Core Architecture

```
Grid of FlowVector objects
    ↓
Each frame:
    1. Calculate angle from 3D Perlin noise (xoff, yoff, zoff)
    2. Calculate magnitude from separate noise field
    3. Smoothly interpolate to new values (lerp)
    4. Draw vector line with arrowhead
    5. Color based on angle + magnitude
```

### Key Parameters

```javascript
scl = 40          // Grid spacing (adjustable with +/-)
inc = 0.08        // Noise sampling resolution
zoff += 0.002     // Time evolution speed
lerp(..., 0.1)    // Smoothing factor (lower = smoother)
```

### Dual Noise Fields

The sketch uses **two independent Perlin noise fields**:
1. **Angle Field**: `noise(xoff, yoff, zoff)` - determines direction
2. **Magnitude Field**: `noise(xoff + 1000, yoff + 1000, zoff * 0.5)` - determines length

This separation creates more interesting patterns where direction and strength vary independently.

## Development Process

### Problems Encountered & Solutions

1. **Vectors Changing Too Abruptly**: Initial implementation had no interpolation
   - **Solution**: Added lerp() for smooth angle and magnitude transitions (0.1 factor)

2. **Uniform Vector Lengths**: All vectors same size looked static
   - **Solution**: Implemented separate noise field for magnitude calculation

3. **Angle Wrapping Issues**: Vectors would "flip" 180° when angle wrapped from 2π to 0
   - **Solution**: Perlin noise naturally produces smooth values, avoiding abrupt wraps

4. **Hard to See Direction**: Lines alone didn't clearly show flow direction
   - **Solution**: Added triangle arrowheads at vector endpoints

5. **Color Monotony**: All vectors similar hue
   - **Solution**: Combined angle-based hue with time-based rotation: `(degrees(this.angle) + frameCount * 0.2) % 360`

6. **Vectors Too Faint**: Couldn't see patterns clearly
   - **Solution**: Increased alpha to 80, added small dots at vector origins

7. **Grid Size Fixed**: Couldn't adapt to different aesthetic preferences
   - **Solution**: Added keyboard controls (+/-) to adjust spacing dynamically

8. **Performance at Small Grid Sizes**: Too many vectors caused lag
   - **Solution**: Set minimum spacing of 20 pixels to prevent excessive vector count

9. **Harsh Visual Transitions**: Background cleared fully each frame
   - **Solution**: Semi-transparent background (alpha 25) creates smooth trails

10. **Arrowhead Size Issues**: Arrows were same size regardless of vector length
    - **Solution**: Map arrowhead size to vector magnitude: `map(this.mag, 0, scl * 0.8, 3, 8)`

---

## Deep Dive: The Smooth Interpolation Challenge

### The Problem

When I first implemented the rooted vector field, the vectors would update instantly to their new angles and magnitudes each frame based on the Perlin noise values. While Perlin noise is inherently smooth in space, the temporal changes - even though gradual - created a jittery, stroboscopic effect that was visually jarring. Vectors would "snap" to new orientations rather than gracefully rotating into them. This was especially noticeable at higher noise evolution speeds (`zoff` increment). The mathematical smoothness of the noise function wasn't translating into visual smoothness because each vector was jumping directly to each new calculated state without any temporal smoothing.

The core issue was the disconnect between **spatial continuity** (smooth transitions between neighboring vectors) and **temporal continuity** (smooth transitions over time for individual vectors). Perlin noise guarantees the former but not the latter. At `zoff += 0.002`, the noise was changing slowly enough that mathematically the difference between frames was small, but perceptually, the human eye could detect the discrete jumps. This created a flickering quality that undermined the fluid, organic aesthetic I was aiming for.

### The Solution

I implemented a **double-buffered interpolation system** using `lerp()` (linear interpolation). Each `FlowVector` object now maintains both its current display state (`this.angle`, `this.mag`) and its target state (`this.targetAngle`, `this.targetMag`). Every frame, the noise calculation produces new target values, but instead of immediately adopting them, the vector smoothly transitions using: `this.angle = lerp(this.angle, this.targetAngle, 0.1)`.

The magic happens in that `0.1` parameter - the interpolation factor. This means each frame, the current value moves 10% of the way toward the target. This creates an exponential easing curve where changes start fast and slow down as they approach the target. If the target moves (which it does continuously due to evolving noise), the current value "chases" it, creating organic, flowing motion. Setting this value was critical: too high (0.5+) and you lose the smoothing benefit; too low (0.01) and vectors lag noticeably behind the field evolution. At 0.1, there's perfect balance - vectors feel responsive while maintaining fluid, continuous motion. This technique essentially applies temporal anti-aliasing to the motion, making the discrete frame-by-frame updates imperceptible and creating the illusion of perfectly smooth, continuous rotation and length changes. Combined with the trail effect from semi-transparent backgrounds, this interpolation transforms the sketch from a series of static snapshots into genuine flowing animation.

## Design Variations to Try

### More Vectors, Subtle Movement
```javascript
scl = 20          // Dense grid
zoff += 0.001     // Very slow evolution
```

### Fewer Vectors, Dynamic Movement
```javascript
scl = 60          // Sparse grid
zoff += 0.005     // Faster evolution
background(0)     // No trails (sharp)
```

### Psychedelic Mode
```javascript
inc = 0.2         // Higher noise frequency
frameCount * 0.5  // Faster color rotation
```

## Requirements Met

✅ Visual pattern in P5.js sketch  
✅ Rhythmic composition with variation across window  
✅ HSB color mode demonstrating variations  
✅ Loops for iteration (nested grid loops)  
✅ Attention to composition and symmetry  
✅ Animation expressing complex, non-linear movement  
✅ Noise used to achieve organic flow  
✅ Comprehensive documentation of problems/solutions  

## Possible Enhancements

- [ ] Mouse interaction (warp field around cursor)
- [ ] Add p5.sound for audio-reactive magnitude
- [ ] Multiple color schemes/palettes
- [ ] 3D version using WEBGL
- [ ] Export as video/GIF
- [ ] Add "curl" calculation for rotational effects
- [ ] Particle overlay showing actual flow paths

## Technical Notes

**Why separate noise fields for angle and magnitude?**  
Using the same noise field for both creates coupling - areas of high magnitude would always point in certain directions. Separating them (by offsetting the noise coordinates by 1000 units) creates independence, resulting in richer, more varied patterns.

**Why the +1000 offset?**  
Perlin noise is deterministic - the same coordinates always return the same value. By sampling from `(xoff + 1000, yoff + 1000)` for magnitude, we're essentially reading from a completely different "region" of the infinite noise space, ensuring independence from the angle field.

## Credits

Inspired by fluid dynamics visualizations, vector field plots, and the macOS screensaver. Techniques influenced by Daniel Shiffman's Coding Train tutorials on flow fields.
