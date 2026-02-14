// ═══════════════════════════════════════════════════════
// IMPACT ENGINE v2.0 — MAIN ENGINE FILE
// Assembles all modules into a unified game engine
// ═══════════════════════════════════════════════════════

(function(global) {
  'use strict';

  // Wait for modules
  const M = global.ImpactModules;
  if (!M || !M.Core || !M.Renderer || !M.Physics || !M.Entities) {
    console.error('[Impact Engine] Modules not loaded! Load core.js, renderer.js, physics.js, entities.js first.');
    return;
  }

  const { EventBus, SystemManager, SceneNode, GameLoop, ObjectPool, StateMachine, Timer, MathUtils } = M.Core;
  const { RenderSystem } = M.Renderer;
  const { PhysicsSystem, AABB, RigidBody, Ray } = M.Physics;
  const { EntitySystem, Entity, PlayerModelBuilder, WalkAnimator, ParticleEmitter } = M.Entities;

  // ═══════════════════════════════════════
  // IMPACT ENGINE — Main class
  // ═══════════════════════════════════════
  class ImpactEngine {
    constructor() {
      this.version = '2.0.0';
      this.name = 'Impact Engine';
      this.initialized = false;

      // Core systems
      this.events = new EventBus();
      this.systems = new SystemManager();
      this.timer = new Timer();
      this.loop = new GameLoop();
      this.root = new SceneNode('root');

      // Three.js references (set on init)
      this.scene = null;
      this.camera = null;
      this.renderer = null;

      // System shortcuts (set after init)
      this.physics = null;
      this.particles = null;
      this.textures = null;
      this.materials = null;
      this.lighting = null;
      this.walkAnimator = null;
      this.playerModels = null;

      // Pools
      this.pools = {};

      // Stats
      this.stats = {
        fps: 0,
        entities: 0,
        bodies: 0,
        particles: 0,
        drawCalls: 0
      };
    }

    // ═══════════════════════════════════════
    // INIT — Initialize with Three.js scene
    // ═══════════════════════════════════════
    init(scene, camera, renderer) {
      if (this.initialized) {
        console.warn('[Impact Engine] Already initialized, reinitializing...');
        this.destroy();
      }

      this.scene = scene;
      this.camera = camera;
      this.renderer = renderer;

      // Register core systems
      this.systems.register('render', new RenderSystem(), 0);
      this.systems.register('physics', new PhysicsSystem(), 10);
      this.systems.register('entities', new EntitySystem(), 20);

      // Initialize all systems
      this.systems.init(this);

      // Set entity scene
      const entitySys = this.systems.get('entities');
      if (entitySys) entitySys.setScene(scene);

      // Create object pools
      this._createPools();

      this.initialized = true;

      console.log(`╔══════════════════════════════════════╗`);
      console.log(`║  Impact Engine v${this.version}               ║`);
      console.log(`║  Systems: ${this.systems._systems.size} loaded                 ║`);
      console.log(`║  Status: READY                       ║`);
      console.log(`╚══════════════════════════════════════╝`);

      this.events.emit('engine:init');
      return this;
    }

    // ═══════════════════════════════════════
    // UPDATE — Call every frame
    // ═══════════════════════════════════════
    update(dt) {
      if (!this.initialized) return;
      if (dt > 0.1) dt = 0.1;

      this.timer.update(dt);
      this.systems.update(dt);

      // Update stats
      this.stats.fps = this.loop.fps;
      this.stats.entities = this.systems.get('entities') ? this.systems.get('entities').entities.length : 0;
      this.stats.bodies = this.physics ? this.physics.bodies.length : 0;
      if (this.renderer) this.stats.drawCalls = this.renderer.info.render.calls;

      this.events.emit('engine:update', dt);
    }

    // ═══════════════════════════════════════
    // SCENE MANAGEMENT
    // ═══════════════════════════════════════
    setScene(scene) {
      this.scene = scene;
      const entitySys = this.systems.get('entities');
      if (entitySys) entitySys.setScene(scene);
    }

    setupLighting(preset) {
      if (this.lighting) {
        return this.lighting.setupScene(this.scene, preset);
      }
    }

    // ═══════════════════════════════════════
    // ENTITY MANAGEMENT
    // ═══════════════════════════════════════
    createEntity(config) {
      const entity = new Entity(config);
      const entitySys = this.systems.get('entities');
      if (entitySys) entitySys.addEntity(entity);
      return entity;
    }

    destroyEntity(entity) {
      entity.destroy();
      const entitySys = this.systems.get('entities');
      if (entitySys) entitySys.removeEntity(entity);
    }

    // ═══════════════════════════════════════
    // PHYSICS SHORTCUTS
    // ═══════════════════════════════════════
    createBody(config) {
      if (!this.physics) return null;
      const body = new RigidBody(config);
      this.physics.addBody(body);
      return body;
    }

    addStaticBox(x, y, z, w, h, d) {
      if (!this.physics) return null;
      return this.physics.addStaticAABB(AABB.fromBox(x, y, z, w, h, d));
    }

    raycast(ox, oy, oz, dx, dy, dz, maxDist, filter) {
      if (!this.physics) return null;
      return this.physics.raycast(ox, oy, oz, dx, dy, dz, maxDist, filter);
    }

    explode(x, y, z, radius, force) {
      if (this.physics) this.physics.explosion(x, y, z, radius, force || radius * 5);
      if (this.particles) this.particles.explosion(x, y, z, radius);
    }

    // ═══════════════════════════════════════
    // TEXTURE SHORTCUTS
    // ═══════════════════════════════════════
    getTexture(name, res) {
      return this.textures ? this.textures.get(name, res) : null;
    }

    getMaterial(type, options) {
      return this.materials ? this.materials.get(type, options) : null;
    }

    // ═══════════════════════════════════════
    // PLAYER MODEL SHORTCUTS
    // ═══════════════════════════════════════
    createPlayerModel(team) {
      return PlayerModelBuilder.create(team);
    }

    updatePlayerWeapon(mesh, weapon) {
      PlayerModelBuilder.updateWeapon(mesh, weapon);
    }

    animateWalk(mesh, isMoving, dt) {
      if (this.walkAnimator) {
        this.walkAnimator.animate(mesh, isMoving, dt);
      }
    }

    // ═══════════════════════════════════════
    // PARTICLE SHORTCUTS
    // ═══════════════════════════════════════
    emitBlood(x, y, z, intensity) {
      if (this.particles) this.particles.blood(x, y, z, intensity);
    }

    emitDebris(x, y, z, color, count) {
      if (this.particles) this.particles.debris(x, y, z, color, count);
    }

    emitGibs(x, y, z) {
      if (this.particles) this.particles.gibs(x, y, z);
    }

    emitMuzzleFlash(x, y, z) {
      if (this.particles) this.particles.muzzleFlash(x, y, z);
    }

    emitBulletImpact(x, y, z) {
      if (this.particles) this.particles.bulletImpact(x, y, z);
    }

    // ═══════════════════════════════════════
    // MAP BUILDING HELPERS
    // ═══════════════════════════════════════
    createGround(size, textureName) {
      const tex = this.getTexture(textureName || 'grass', 512);
      if (tex) tex.repeat.set(size / 20, size / 20);
      const mat = tex ? new THREE.MeshLambertMaterial({ map: tex }) : new THREE.MeshLambertMaterial({ color: 0x556B2F });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.receiveShadow = true;
      if (this.scene) this.scene.add(mesh);
      return mesh;
    }

    createWall(x, y, z, w, h, d, textureName, color) {
      const mat = textureName ? this.getMaterial(textureName) : new THREE.MeshLambertMaterial({ color: color || 0x808080 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (this.scene) this.scene.add(mesh);
      this.addStaticBox(x, y, z, w, h, d);
      return mesh;
    }

    createBarrel(x, y, z, isDynamic) {
      const mat = this.getMaterial('barrel') || new THREE.MeshLambertMaterial({ color: 0x8B0000 });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 16), mat);
      mesh.position.set(x, y || 0.6, z);
      mesh.castShadow = true;
      if (this.scene) this.scene.add(mesh);

      if (isDynamic && this.physics) {
        const body = this.createBody({
          mesh, x, y: y || 0.6, z,
          shape: 'sphere', radius: 0.5,
          mass: 50, friction: 0.85, bounciness: 0.2
        });
        return { mesh, body };
      }

      this.addStaticBox(x, y || 0.6, z, 1, 1.2, 1);
      return { mesh, body: null };
    }

    createCrate(x, y, z, size, isDynamic) {
      const s = size || 1.5;
      const mat = this.getMaterial('crate') || new THREE.MeshLambertMaterial({ color: 0x8B6914 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat);
      mesh.position.set(x, y || s / 2, z);
      mesh.castShadow = true;
      if (this.scene) this.scene.add(mesh);

      if (isDynamic && this.physics) {
        const body = this.createBody({
          mesh, x, y: y || s / 2, z,
          shape: 'box', halfExtents: { x: s/2, y: s/2, z: s/2 },
          mass: 80, friction: 0.9, bounciness: 0.1
        });
        return { mesh, body };
      }

      this.addStaticBox(x, y || s / 2, z, s, s, s);
      return { mesh, body: null };
    }

    createBuyZone(x, z, radius, color) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(radius - 0.5, radius, 32),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.05, z);
      if (this.scene) this.scene.add(mesh);
      return mesh;
    }

    // ═══════════════════════════════════════
    // OBJECT POOLS
    // ═══════════════════════════════════════
    _createPools() {
      // Bullet tracer pool
      this.pools.tracers = new ObjectPool(
        () => {
          const geo = new THREE.BufferGeometry();
          const mat = new THREE.LineBasicMaterial({ color: 0xffff44, transparent: true, opacity: 0.6 });
          return new THREE.Line(geo, mat);
        },
        (obj) => { if (obj.parent) obj.parent.remove(obj); },
        10
      );
    }

    // ═══════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════
    destroy() {
      this.events.emit('engine:destroy');
      this.systems.destroy();
      this.events.clear();
      this.timer.clear();
      this.loop.stop();
      this.root.destroy();
      this.initialized = false;
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.physics = null;
      this.particles = null;
      this.textures = null;
      this.materials = null;
      this.lighting = null;
      console.log('[Impact Engine] Destroyed');
    }

    // ═══════════════════════════════════════
    // STATIC UTILS
    // ═══════════════════════════════════════
    static get Math() { return MathUtils; }
    static get AABB() { return AABB; }
    static get RigidBody() { return RigidBody; }
    static get Ray() { return Ray; }
    static get Entity() { return Entity; }
    static get StateMachine() { return StateMachine; }
    static get Timer() { return Timer; }
    static get ObjectPool() { return ObjectPool; }
    static get SceneNode() { return SceneNode; }
    static get EventBus() { return EventBus; }
    static get PlayerModelBuilder() { return PlayerModelBuilder; }
    static get WalkAnimator() { return WalkAnimator; }
  }

  // ═══════════════════════════════════════
  // GLOBAL SINGLETON
  // ═══════════════════════════════════════
  global.ImpactEngine = new ImpactEngine();

  // Also export the class for advanced usage
  global.ImpactEngineClass = ImpactEngine;

  console.log('╔══════════════════════════════════════╗');
  console.log('║  Impact Engine v2.0 LOADED           ║');
  console.log('║  Modules: Core, Renderer,            ║');
  console.log('║           Physics, Entities           ║');
  console.log('║  Status: Awaiting init()             ║');
  console.log('╚══════════════════════════════════════╝');

})(typeof window !== 'undefined' ? window : global);
