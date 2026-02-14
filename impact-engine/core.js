// ═══════════════════════════════════════════════════════
// IMPACT ENGINE v2.0 — CORE MODULE
// Game loop, system manager, event bus, scene graph
// ═══════════════════════════════════════════════════════

(function(global) {
  'use strict';

  // ═══════════════════════════════════════
  // EVENT BUS — Pub/Sub messaging system
  // ═══════════════════════════════════════
  class EventBus {
    constructor() {
      this._listeners = {};
      this._once = {};
    }

    on(event, callback) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(callback);
      return () => this.off(event, callback);
    }

    once(event, callback) {
      if (!this._once[event]) this._once[event] = [];
      this._once[event].push(callback);
    }

    off(event, callback) {
      if (this._listeners[event]) {
        this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
      }
    }

    emit(event, ...args) {
      if (this._listeners[event]) {
        for (const cb of this._listeners[event]) cb(...args);
      }
      if (this._once[event]) {
        for (const cb of this._once[event]) cb(...args);
        delete this._once[event];
      }
    }

    clear() {
      this._listeners = {};
      this._once = {};
    }
  }

  // ═══════════════════════════════════════
  // SYSTEM MANAGER — Manages all engine systems
  // ═══════════════════════════════════════
  class SystemManager {
    constructor() {
      this._systems = new Map();
      this._updateOrder = [];
    }

    register(name, system, priority = 0) {
      this._systems.set(name, { system, priority });
      this._updateOrder = Array.from(this._systems.entries())
        .sort((a, b) => a[1].priority - b[1].priority)
        .map(e => e[1].system);
      console.log(`[Impact] System registered: ${name} (priority: ${priority})`);
    }

    get(name) {
      const entry = this._systems.get(name);
      return entry ? entry.system : null;
    }

    update(dt) {
      for (const system of this._updateOrder) {
        if (system.enabled !== false && system.update) {
          system.update(dt);
        }
      }
    }

    init(engine) {
      for (const [name, entry] of this._systems) {
        if (entry.system.init) {
          entry.system.init(engine);
          console.log(`[Impact] System initialized: ${name}`);
        }
      }
    }

    destroy() {
      for (const [name, entry] of this._systems) {
        if (entry.system.destroy) entry.system.destroy();
      }
      this._systems.clear();
      this._updateOrder = [];
    }
  }

  // ═══════════════════════════════════════
  // SCENE GRAPH — Hierarchical scene management
  // ═══════════════════════════════════════
  class SceneNode {
    constructor(name) {
      this.name = name || 'node_' + SceneNode._nextId++;
      this.children = [];
      this.parent = null;
      this.mesh = null;
      this.visible = true;
      this.tags = new Set();
      this.userData = {};
      this.transform = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
    }

    addChild(node) {
      if (node.parent) node.parent.removeChild(node);
      node.parent = this;
      this.children.push(node);
      return node;
    }

    removeChild(node) {
      const idx = this.children.indexOf(node);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        node.parent = null;
      }
      return node;
    }

    findByName(name) {
      if (this.name === name) return this;
      for (const child of this.children) {
        const found = child.findByName(name);
        if (found) return found;
      }
      return null;
    }

    findByTag(tag) {
      const results = [];
      if (this.tags.has(tag)) results.push(this);
      for (const child of this.children) {
        results.push(...child.findByTag(tag));
      }
      return results;
    }

    traverse(callback) {
      callback(this);
      for (const child of this.children) {
        child.traverse(callback);
      }
    }

    destroy() {
      if (this.parent) this.parent.removeChild(this);
      for (const child of [...this.children]) {
        child.destroy();
      }
      this.children = [];
    }
  }
  SceneNode._nextId = 0;

  // ═══════════════════════════════════════
  // GAME LOOP — Fixed timestep with interpolation
  // ═══════════════════════════════════════
  class GameLoop {
    constructor() {
      this.running = false;
      this.targetFPS = 60;
      this.fixedDT = 1 / 60;
      this.maxDT = 0.1;
      this.accumulator = 0;
      this.time = 0;
      this.frameCount = 0;
      this.fps = 0;
      this._lastTime = 0;
      this._fpsTimer = 0;
      this._fpsFrames = 0;
      this._onUpdate = null;
      this._onRender = null;
      this._onFixedUpdate = null;
      this._rafId = null;
    }

    start(onUpdate, onRender, onFixedUpdate) {
      this._onUpdate = onUpdate;
      this._onRender = onRender;
      this._onFixedUpdate = onFixedUpdate;
      this.running = true;
      this._lastTime = performance.now() / 1000;
      this._tick();
    }

    stop() {
      this.running = false;
      if (this._rafId) cancelAnimationFrame(this._rafId);
    }

    _tick() {
      if (!this.running) return;
      this._rafId = requestAnimationFrame(() => this._tick());

      const now = performance.now() / 1000;
      let dt = now - this._lastTime;
      this._lastTime = now;

      if (dt > this.maxDT) dt = this.maxDT;

      // FPS counter
      this._fpsTimer += dt;
      this._fpsFrames++;
      if (this._fpsTimer >= 1) {
        this.fps = this._fpsFrames;
        this._fpsFrames = 0;
        this._fpsTimer = 0;
      }

      // Fixed update (physics)
      this.accumulator += dt;
      while (this.accumulator >= this.fixedDT) {
        if (this._onFixedUpdate) this._onFixedUpdate(this.fixedDT);
        this.accumulator -= this.fixedDT;
        this.time += this.fixedDT;
      }

      // Variable update (game logic)
      if (this._onUpdate) this._onUpdate(dt);

      // Render
      if (this._onRender) this._onRender(dt);

      this.frameCount++;
    }
  }

  // ═══════════════════════════════════════
  // OBJECT POOL — Reusable object management
  // ═══════════════════════════════════════
  class ObjectPool {
    constructor(factory, resetFn, initialSize = 20) {
      this._factory = factory;
      this._resetFn = resetFn;
      this._pool = [];
      this._active = new Set();
      for (let i = 0; i < initialSize; i++) {
        this._pool.push(factory());
      }
    }

    acquire() {
      let obj = this._pool.pop();
      if (!obj) obj = this._factory();
      this._active.add(obj);
      return obj;
    }

    release(obj) {
      if (this._active.has(obj)) {
        this._active.delete(obj);
        if (this._resetFn) this._resetFn(obj);
        this._pool.push(obj);
      }
    }

    releaseAll() {
      for (const obj of this._active) {
        if (this._resetFn) this._resetFn(obj);
        this._pool.push(obj);
      }
      this._active.clear();
    }

    get activeCount() { return this._active.size; }
    get poolSize() { return this._pool.length; }
  }

  // ═══════════════════════════════════════
  // STATE MACHINE — For entity states
  // ═══════════════════════════════════════
  class StateMachine {
    constructor(owner) {
      this.owner = owner;
      this.states = {};
      this.currentState = null;
      this.previousState = null;
    }

    addState(name, state) {
      this.states[name] = state;
      state.machine = this;
      state.owner = this.owner;
    }

    setState(name) {
      if (this.currentState === name) return;
      const prev = this.states[this.currentState];
      if (prev && prev.exit) prev.exit();
      this.previousState = this.currentState;
      this.currentState = name;
      const next = this.states[name];
      if (next && next.enter) next.enter();
    }

    update(dt) {
      const state = this.states[this.currentState];
      if (state && state.update) state.update(dt);
    }
  }

  // ═══════════════════════════════════════
  // TIMER — Delayed actions
  // ═══════════════════════════════════════
  class Timer {
    constructor() {
      this._timers = [];
    }

    after(delay, callback) {
      const timer = { delay, elapsed: 0, callback, repeat: false, done: false };
      this._timers.push(timer);
      return timer;
    }

    every(interval, callback) {
      const timer = { delay: interval, elapsed: 0, callback, repeat: true, done: false };
      this._timers.push(timer);
      return timer;
    }

    cancel(timer) {
      timer.done = true;
    }

    update(dt) {
      for (let i = this._timers.length - 1; i >= 0; i--) {
        const t = this._timers[i];
        if (t.done) { this._timers.splice(i, 1); continue; }
        t.elapsed += dt;
        if (t.elapsed >= t.delay) {
          t.callback();
          if (t.repeat) { t.elapsed = 0; }
          else { this._timers.splice(i, 1); }
        }
      }
    }

    clear() {
      this._timers = [];
    }
  }

  // ═══════════════════════════════════════
  // MATH UTILS
  // ═══════════════════════════════════════
  const MathUtils = {
    clamp(v, min, max) { return Math.max(min, Math.min(max, v)); },
    lerp(a, b, t) { return a + (b - a) * t; },
    smoothstep(a, b, t) { t = MathUtils.clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); },
    distance(x1, y1, z1, x2, y2, z2) { const dx = x2-x1, dy = y2-y1, dz = z2-z1; return Math.sqrt(dx*dx+dy*dy+dz*dz); },
    distance2D(x1, z1, x2, z2) { const dx = x2-x1, dz = z2-z1; return Math.sqrt(dx*dx+dz*dz); },
    randomRange(min, max) { return min + Math.random() * (max - min); },
    randomInt(min, max) { return Math.floor(MathUtils.randomRange(min, max + 1)); },
    degToRad(deg) { return deg * Math.PI / 180; },
    radToDeg(rad) { return rad * 180 / Math.PI; },
    angleBetween(x1, z1, x2, z2) { return Math.atan2(x2 - x1, z2 - z1); },
    normalizeAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  };

  // ═══════════════════════════════════════
  // EXPORT CORE MODULES
  // ═══════════════════════════════════════
  if (!global.ImpactModules) global.ImpactModules = {};
  global.ImpactModules.Core = {
    EventBus,
    SystemManager,
    SceneNode,
    GameLoop,
    ObjectPool,
    StateMachine,
    Timer,
    MathUtils
  };

  console.log('[Impact Engine] Core module loaded');

})(typeof window !== 'undefined' ? window : global);
