# Flow Field Visualization - Rhythmic Wave Pattern

A P5.js sketch creating a wave-like vector field visualization inspired by macOS screensaver aesthetics. Particles follow smooth, evolving Perlin noise fields to create organic, flowing patterns with dynamic HSB color gradients.

## Features

- **Flow Field System**: Grid-based vector field using Perlin noise
- **3000 Particles**: Following the field with physics-based movement
- **HSB Color Mode**: Dynamic colors based on velocity angle and position
- **Non-linear Motion**: Smooth, organic movement using noise functions
- **Trail Effects**: Semi-transparent background creates flowing line patterns
- **Responsive**: Adapts to window size
- **Interactive**: Press 'R' to reset the visualization

## How to Run

1. Open `index.html` in a web browser
2. The sketch will fill the entire window
3. Press 'R' to reset and regenerate particles

## Technical Implementation

### Core Components

1. **Flow Field Grid**: 
   - Divides canvas into cells (20x20 pixels)
   - Each cell contains a vector direction
   - Updated every frame using 3D Perlin noise

2. **Particle System**:
   - 3000 particles with position, velocity, acceleration
   - Each follows nearest flow field vector
   - Wraps around edges for continuous flow

3. **Color System (HSB)**:
   - Hue: Based on velocity direction + time offset
   - Saturation: Maps to particle speed (50-100%)
   - Brightness: Maps to particle speed (60-100%)

### Key Parameters

```javascript
scl = 20          // Flow field resolution
inc = 0.1         // Noise detail level
zoff += 0.003     // Time evolution speed
numParticles = 3000
maxSpeed = 2
background(0, 0, 0, 5)  // Trail alpha
```

## Development Process

### Problems Encountered & Solutions

1. **Initial Chaos**: First attempt showed particles moving randomly with no cohesive flow
   - **Solution**: Reduced noise increment from 0.3 to 0.1 for smoother field transitions

2. **Performance Issues**: 5000 particles caused significant lag
   - **Solution**: Optimized to 3000 particles and simplified color calculations

3. **Color Monotony**: All particles had same hue at start
   - **Solution**: Added individual `hueOffset` to each particle for variation

4. **Trails Too Faint**: Couldn't see the flowing patterns clearly
   - **Solution**: Adjusted background alpha from 2 to 5 and strokeWeight from 1 to 1.5

5. **Jarring Edge Behavior**: Particles would jump when wrapping around edges
   - **Solution**: Updated `prevPos` when wrapping to prevent drawing lines across screen

6. **Static Patterns**: Field wasn't evolving enough over time
   - **Solution**: Implemented 3D Perlin noise with slowly incrementing Z-axis (`zoff`)

7. **Color Bleeding**: Similar hues made patterns blend together
   - **Solution**: Combined angle-based hue with time-based offset: `(map(angle, -PI, PI, 0, 360) + this.hueOffset + frameCount * 0.1) % 360`

8. **Window Resize Issues**: Field wouldn't recalculate on resize
   - **Solution**: Added `windowResized()` function to recalculate grid dimensions

---

## Deep Dive: The Color Bleeding Problem

### The Problem

During initial development, one of the most visually frustrating issues was what I called "color bleeding" - the phenomenon where particles in similar flow regions would all display nearly identical colors, creating large monochromatic patches instead of the desired rainbow gradient effect seen in the reference image. The visualization looked flat and lacked the rich color variation that makes flow field art compelling. When particles moved in the same direction (which happens frequently in flow fields due to their continuous nature), they would all share the same hue, causing entire swaths of the screen to appear as single-color blocks rather than smooth gradients.

The root cause was my initial color calculation: `let hue = map(angle, -PI, PI, 0, 360)`. This approach seemed logical - map the velocity angle directly to the hue spectrum - but it failed to account for the coherent nature of flow fields. Since neighboring particles tend to move in similar directions due to the smooth Perlin noise field, they would calculate nearly identical angles, resulting in identical hues. This created the "bleeding" effect where large regions were dominated by single colors, especially in areas where the flow was uniform.

### The Solution

The solution required introducing multiple layers of variation to break up the color uniformity while still maintaining the angle-based foundation. I implemented a three-part color calculation system:

1. **Per-particle hue offset**: Each particle receives a random `hueOffset` between 0-360 during initialization, giving every particle a unique "starting point" on the color wheel
2. **Time-based rotation**: Adding `frameCount * 0.1` causes all hues to slowly rotate over time, creating shimmering, evolving color patterns
3. **Modulo wrapping**: Using `% 360` ensures hues wrap smoothly around the color wheel

The final formula became: `let hue = (map(angle, -PI, PI, 0, 360) + this.hueOffset + frameCount * 0.1) % 360`

This solution preserved the directional color relationship (particles moving in similar directions still have related hues) while adding enough variation to create beautiful gradients. The time-based component adds a fourth dimension to the visualization, making it truly dynamic. Now, even in regions of uniform flow, you see subtle rainbow gradients as each particle's unique offset creates local color variation, while the slow rotation over time ensures the entire composition constantly evolves. This transformed the visualization from flat color blocks into the rich, flowing spectrum that captures the aesthetic of the reference image.

## Possible Enhancements

- [ ] Add mouse interaction (attract/repel particles)
- [ ] Integrate p5.sound for audio reactivity
- [ ] Add occasional "burst" events with randomness
- [ ] Load background image to influence field direction
- [ ] Implement multiple layered flow fields
- [ ] Add particle size variation based on speed
- [ ] Create color palette selector

## Requirements Met

✅ Visual pattern created in P5.js  
✅ Rhythmic composition with variation  
✅ HSB color mode with dynamic color variations  
✅ Loops used for iteration (flow field grid)  
✅ Attention to composition and symmetry  
✅ Animation with complex, non-linear movement  
✅ Randomness/noise for desired effects  
✅ Documentation of problems and solutions  

## Credits

Concept inspired by macOS vector field screensaver and flow field visualizations by Tyler Hobbs and others in the generative art community.
