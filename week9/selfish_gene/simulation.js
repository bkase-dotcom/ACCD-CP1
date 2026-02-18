// simulation.js -- OOP classes for the Replicator Evolution Simulation
// Pure JavaScript, no p5.js dependency

class Replicator {
  constructor(config) {
    this.id = config.id;
    this.generation = config.generation;
    this.parentId = config.parentId;
    this.spawnRate = config.spawnRate;
    this.deathRate = config.deathRate;
    this.replicationRate = config.replicationRate;
    this.mutationRate = config.mutationRate;
    this.speciesId = config.speciesId;
    this.color = config.color; // {h, s, b}
    this.age = 0;
    this.alive = true;
  }

  getEffectiveReplicationRate(totalPopulation, capacity) {
    return this.replicationRate * Math.max(0, 1 - totalPopulation / capacity);
  }

  getFitness() {
    return this.replicationRate / (this.deathRate + this.mutationRate + 0.0001);
  }

  tryDie() {
    return Math.random() < this.deathRate;
  }

  tryReplicate(totalPopulation, capacity, nextId, nextSpeciesId) {
    let effRate = this.getEffectiveReplicationRate(totalPopulation, capacity);
    if (Math.random() >= effRate) return null;

    let isMutation = Math.random() < this.mutationRate;

    if (isMutation) {
      return new Replicator({
        id: nextId,
        generation: this.generation + 1,
        parentId: this.id,
        spawnRate: 0,
        deathRate: Replicator.perturbStat(this.deathRate),
        replicationRate: Replicator.perturbStat(this.replicationRate),
        mutationRate: Replicator.perturbStat(this.mutationRate),
        speciesId: nextSpeciesId,
        color: Replicator.randomColor()
      });
    } else {
      return new Replicator({
        id: nextId,
        generation: this.generation + 1,
        parentId: this.id,
        spawnRate: 0,
        deathRate: this.deathRate,
        replicationRate: this.replicationRate,
        mutationRate: this.mutationRate,
        speciesId: this.speciesId,
        color: { h: this.color.h, s: this.color.s, b: this.color.b }
      });
    }
  }

  static perturbStat(value) {
    let factor = 1 + (Math.random() - 0.5) * 0.5; // 0.75 to 1.25
    return Math.max(0.001, Math.min(0.5, value * factor));
  }

  static randomColor() {
    return {
      h: Math.random() * 360,
      s: 70 + Math.random() * 30,
      b: 60 + Math.random() * 40
    };
  }
}


class Population {
  constructor(capacity) {
    this.replicators = [];
    this.nextId = 0;
    this.nextSpeciesId = 1; // 0 is reserved for the original
    this.capacity = capacity;
    this.speciesCounts = new Map();  // speciesId -> count
    this.speciesColors = new Map();  // speciesId -> {h,s,b}
    this.speciesStats = new Map();   // speciesId -> {deathRate, replicationRate, mutationRate}
    this.totalBorn = 0;
    this.totalDied = 0;
    this.totalMutations = 0;
  }

  size() {
    return this.replicators.length;
  }

  add(replicator) {
    this.replicators.push(replicator);
    let count = this.speciesCounts.get(replicator.speciesId) || 0;
    this.speciesCounts.set(replicator.speciesId, count + 1);
    if (!this.speciesColors.has(replicator.speciesId)) {
      this.speciesColors.set(replicator.speciesId, { ...replicator.color });
      this.speciesStats.set(replicator.speciesId, {
        deathRate: replicator.deathRate,
        replicationRate: replicator.replicationRate,
        mutationRate: replicator.mutationRate
      });
    }
  }

  remove(index) {
    let r = this.replicators[index];
    let count = this.speciesCounts.get(r.speciesId) || 0;
    if (count <= 1) {
      this.speciesCounts.delete(r.speciesId);
    } else {
      this.speciesCounts.set(r.speciesId, count - 1);
    }
    // Swap with last element for O(1) removal
    let last = this.replicators.length - 1;
    if (index !== last) {
      this.replicators[index] = this.replicators[last];
    }
    this.replicators.pop();
  }

  getSpeciesBreakdown() {
    let result = [];
    for (let [speciesId, count] of this.speciesCounts) {
      result.push({
        speciesId: speciesId,
        count: count,
        color: this.speciesColors.get(speciesId) || { h: 0, s: 0, b: 50 },
        stats: this.speciesStats.get(speciesId) || null
      });
    }
    result.sort((a, b) => b.count - a.count);
    return result;
  }

  getTopSpecies(n) {
    return this.getSpeciesBreakdown().slice(0, n);
  }

  trySpawn(template) {
    if (Math.random() < template.spawnRate) {
      let r = new Replicator({
        id: this.nextId++,
        generation: 0,
        parentId: -1,
        spawnRate: template.spawnRate,
        deathRate: template.deathRate,
        replicationRate: template.replicationRate,
        mutationRate: template.mutationRate,
        speciesId: 0,
        color: { h: template.color.h, s: template.color.s, b: template.color.b }
      });
      this.add(r);
      this.totalBorn++;
    }
  }
}


class Simulation {
  constructor(params) {
    this.params = { ...params };
    this.maxTimesteps = params.maxTimesteps;
    this.stepsPerFrame = Math.max(1, Math.ceil(params.maxTimesteps / 3000));
    this.population = new Population(params.capacity);
    this.timestep = 0;
    this.running = false;
    this.paused = false;
    this.complete = false;
    this.history = [];
    this.historySampleInterval = Math.max(1, Math.floor(params.maxTimesteps / 1000));

    this.originalTemplate = {
      spawnRate: params.spawnRate,
      deathRate: params.deathRate,
      replicationRate: params.replicationRate,
      mutationRate: params.mutationRate,
      color: { h: 200, s: 80, b: 90 } // blue for the original
    };

    // Register original species color
    this.population.speciesColors.set(0, { ...this.originalTemplate.color });
    this.population.speciesStats.set(0, {
      deathRate: params.deathRate,
      replicationRate: params.replicationRate,
      mutationRate: params.mutationRate
    });
  }

  step() {
    if (!this.running || this.paused || this.complete) return;

    for (let i = 0; i < this.stepsPerFrame; i++) {
      this.tick();
      this.timestep++;

      if (this.timestep % this.historySampleInterval === 0) {
        this.recordSnapshot();
      }

      if (this.timestep >= this.maxTimesteps) {
        this.complete = true;
        this.running = false;
        this.recordSnapshot(); // final snapshot
        break;
      }
    }
  }

  tick() {
    let pop = this.population;
    let births = [];
    let deathIndices = [];

    // 1. Spontaneous spawn
    pop.trySpawn(this.originalTemplate);

    // 2. Iterate all replicators
    for (let i = pop.replicators.length - 1; i >= 0; i--) {
      let r = pop.replicators[i];
      r.age++;

      // Death check
      if (r.tryDie()) {
        deathIndices.push(i);
        pop.totalDied++;
        continue;
      }

      // Replication check
      let child = r.tryReplicate(
        pop.size(),
        pop.capacity,
        pop.nextId,
        pop.nextSpeciesId
      );
      if (child) {
        if (child.speciesId === pop.nextSpeciesId) {
          pop.nextSpeciesId++;
          pop.totalMutations++;
        }
        pop.nextId++;
        births.push(child);
        pop.totalBorn++;
      }
    }

    // 3. Remove dead (indices are already in descending order from reverse iteration)
    for (let idx of deathIndices) {
      pop.remove(idx);
    }

    // 4. Add births
    for (let child of births) {
      pop.add(child);
    }
  }

  recordSnapshot() {
    let breakdown = this.population.getTopSpecies(10);
    this.history.push({
      timestep: this.timestep,
      totalPopulation: this.population.size(),
      species: breakdown.map(s => ({
        speciesId: s.speciesId,
        count: s.count,
        color: { h: s.color.h, s: s.color.s, b: s.color.b }
      }))
    });
  }

  start() {
    this.running = true;
    this.paused = false;
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  reset(params) {
    this.params = { ...params };
    this.maxTimesteps = params.maxTimesteps;
    this.stepsPerFrame = Math.max(1, Math.ceil(params.maxTimesteps / 3000));
    this.population = new Population(params.capacity);
    this.timestep = 0;
    this.running = false;
    this.paused = false;
    this.complete = false;
    this.history = [];
    this.historySampleInterval = Math.max(1, Math.floor(params.maxTimesteps / 1000));

    this.originalTemplate = {
      spawnRate: params.spawnRate,
      deathRate: params.deathRate,
      replicationRate: params.replicationRate,
      mutationRate: params.mutationRate,
      color: { h: 200, s: 80, b: 90 }
    };

    this.population.speciesColors.set(0, { ...this.originalTemplate.color });
    this.population.speciesStats.set(0, {
      deathRate: params.deathRate,
      replicationRate: params.replicationRate,
      mutationRate: params.mutationRate
    });
  }

  getProgress() {
    return this.timestep / this.maxTimesteps;
  }

  getStats() {
    return {
      timestep: this.timestep,
      population: this.population.size(),
      speciesCount: this.population.speciesCounts.size,
      totalBorn: this.population.totalBorn,
      totalDied: this.population.totalDied,
      totalMutations: this.population.totalMutations,
      progress: this.getProgress()
    };
  }

  getWinnerStats() {
    let top = this.population.getTopSpecies(1);
    if (top.length === 0) return null;
    let winner = top[0];
    return {
      speciesId: winner.speciesId,
      count: winner.count,
      color: winner.color,
      stats: winner.stats,
      percentage: (winner.count / this.population.size() * 100).toFixed(1)
    };
  }
}
