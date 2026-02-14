// ═══════════════════════════════════════════════════════
// IMPACT ENGINE v2.0 — ENTITIES MODULE
// Entity system, player models, weapons, particles, FX
// ═══════════════════════════════════════════════════════

(function(global) {
  'use strict';

  // ═══════════════════════════════════════
  // BASE ENTITY
  // ═══════════════════════════════════════
  class Entity {
    constructor(config = {}) {
      this.id = Entity._nextId++;
      this.name = config.name || 'entity_' + this.id;
      this.mesh = null;
      this.body = null;
      this.active = true;
      this.tags = new Set(config.tags || []);
      this.components = {};
      this.userData = config.userData || {};
    }

    addComponent(name, component) {
      this.components[name] = component;
      component.entity = this;
      if (component.init) component.init();
      return this;
    }

    getComponent(name) {
      return this.components[name] || null;
    }

    update(dt) {
      for (const name in this.components) {
        if (this.components[name].update) {
          this.components[name].update(dt);
        }
      }
    }

    destroy() {
      this.active = false;
      for (const name in this.components) {
        if (this.components[name].destroy) {
          this.components[name].destroy();
        }
      }
    }
  }
  Entity._nextId = 0;

  // ═══════════════════════════════════════
  // PLAYER MODEL BUILDER — Articulated character
  // ═══════════════════════════════════════
  class PlayerModelBuilder {
    static create(team, options = {}) {
      const group = new THREE.Group();
      const isT = team === 'T';
      const bodyColor = isT ? 0xc4782a : 0x2a5a8a;
      const darkBodyColor = isT ? 0x8a5520 : 0x1a3a5a;
      const pantsColor = 0x2a2a3a;
      const bootColor = 0x1a1a1a;
      const skinColor = 0xdaa06d;

      // Torso
      const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.7, 0.3),
        new THREE.MeshLambertMaterial({ color: bodyColor })
      );
      torso.position.y = 1.0;
      torso.name = 'body';
      torso.castShadow = true;
      group.add(torso);

      // Shoulders
      const shoulders = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.12, 0.3),
        new THREE.MeshLambertMaterial({ color: darkBodyColor })
      );
      shoulders.position.y = 1.38;
      shoulders.name = 'shoulders';
      group.add(shoulders);

      // Head
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.3, 0.28),
        new THREE.MeshLambertMaterial({ color: skinColor })
      );
      head.position.y = 1.6;
      head.name = 'head';
      head.castShadow = true;
      group.add(head);

      // Helmet/hat
      if (isT) {
        const hat = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.1, 0.32),
          new THREE.MeshLambertMaterial({ color: 0x333333 })
        );
        hat.position.y = 1.78;
        hat.name = 'hat';
        group.add(hat);
      } else {
        const helmet = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.18, 0.3),
          new THREE.MeshLambertMaterial({ color: 0x2a4a2a })
        );
        helmet.position.y = 1.74;
        helmet.name = 'helmet';
        group.add(helmet);
      }

      // Left arm (upper + lower)
      const armLGroup = new THREE.Group();
      armLGroup.position.set(-0.38, 1.3, 0);
      armLGroup.name = 'armL';

      const armLUpper = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.35, 0.12),
        new THREE.MeshLambertMaterial({ color: bodyColor })
      );
      armLUpper.position.y = -0.15;
      armLGroup.add(armLUpper);

      const armLLower = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.3, 0.1),
        new THREE.MeshLambertMaterial({ color: skinColor })
      );
      armLLower.position.y = -0.4;
      armLGroup.add(armLLower);
      group.add(armLGroup);

      // Right arm
      const armRGroup = new THREE.Group();
      armRGroup.position.set(0.38, 1.3, 0);
      armRGroup.name = 'armR';

      const armRUpper = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.35, 0.12),
        new THREE.MeshLambertMaterial({ color: bodyColor })
      );
      armRUpper.position.y = -0.15;
      armRGroup.add(armRUpper);

      const armRLower = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.3, 0.1),
        new THREE.MeshLambertMaterial({ color: skinColor })
      );
      armRLower.position.y = -0.4;
      armRGroup.add(armRLower);
      group.add(armRGroup);

      // Left leg
      const legLGroup = new THREE.Group();
      legLGroup.position.set(-0.14, 0.6, 0);
      legLGroup.name = 'legL';

      const legLUpper = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.35, 0.16),
        new THREE.MeshLambertMaterial({ color: pantsColor })
      );
      legLUpper.position.y = -0.15;
      legLGroup.add(legLUpper);

      const legLLower = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.3, 0.14),
        new THREE.MeshLambertMaterial({ color: pantsColor })
      );
      legLLower.position.y = -0.4;
      legLGroup.add(legLLower);

      const bootL = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.1, 0.2),
        new THREE.MeshLambertMaterial({ color: bootColor })
      );
      bootL.position.set(0, -0.58, 0.02);
      legLGroup.add(bootL);
      group.add(legLGroup);

      // Right leg
      const legRGroup = new THREE.Group();
      legRGroup.position.set(0.14, 0.6, 0);
      legRGroup.name = 'legR';

      const legRUpper = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.35, 0.16),
        new THREE.MeshLambertMaterial({ color: pantsColor })
      );
      legRUpper.position.y = -0.15;
      legRGroup.add(legRUpper);

      const legRLower = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.3, 0.14),
        new THREE.MeshLambertMaterial({ color: pantsColor })
      );
      legRLower.position.y = -0.4;
      legRGroup.add(legRLower);

      const bootR = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.1, 0.2),
        new THREE.MeshLambertMaterial({ color: bootColor })
      );
      bootR.position.set(0, -0.58, 0.02);
      legRGroup.add(bootR);
      group.add(legRGroup);

      // Weapon holder
      const weaponHolder = new THREE.Group();
      weaponHolder.position.set(0.3, 0.95, -0.2);
      weaponHolder.name = 'weaponHolder';
      group.add(weaponHolder);

      // Default weapon mesh
      const defaultGun = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 0.4),
        new THREE.MeshLambertMaterial({ color: 0x444444 })
      );
      weaponHolder.add(defaultGun);

      group.castShadow = true;
      return group;
    }

    static updateWeapon(playerMesh, weaponType) {
      const holder = playerMesh.children.find(c => c.name === 'weaponHolder');
      if (!holder) return;
      while (holder.children.length) holder.remove(holder.children[0]);

      const guns = {
        knife: () => {
          const g = new THREE.Group();
          g.add(Object.assign(new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 0.04, 0.2),
            new THREE.MeshLambertMaterial({ color: 0xCCCCCC })
          ), { position: new THREE.Vector3(0, 0, -0.1) }));
          return g;
        },
        usp: () => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(
            new THREE.BoxGeometry(0.04, 0.05, 0.2),
            new THREE.MeshLambertMaterial({ color: 0x222222 })
          ));
          return g;
        },
        deagle: () => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.06, 0.25),
            new THREE.MeshLambertMaterial({ color: 0xAAAAAA })
          ));
          return g;
        },
        ak47: () => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.06, 0.45),
            new THREE.MeshLambertMaterial({ color: 0x654321 })
          ));
          const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8),
            new THREE.MeshLambertMaterial({ color: 0x333333 })
          );
          barrel.rotation.x = Math.PI / 2;
          barrel.position.z = -0.3;
          g.add(barrel);
          return g;
        },
        m4a1: () => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.06, 0.42),
            new THREE.MeshLambertMaterial({ color: 0x2a2a2a })
          ));
          const barrel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.01, 0.01, 0.25, 8),
            new THREE.MeshLambertMaterial({ color: 0x444444 })
          );
          barrel.rotation.x = Math.PI / 2;
          barrel.position.z = -0.32;
          g.add(barrel);
          return g;
        },
        awp: () => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.07, 0.55),
            new THREE.MeshLambertMaterial({ color: 0x2a4a2a })
          ));
          const scope = new THREE.Mesh(
            new THREE.CylinderGeometry(0.02, 0.02, 0.12, 12),
            new THREE.MeshLambertMaterial({ color: 0x111111 })
          );
          scope.position.set(0, 0.06, -0.05);
          g.add(scope);
          return g;
        },
        rpg: () => {
          const g = new THREE.Group();
          const tube = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.06, 0.6, 12),
            new THREE.MeshLambertMaterial({ color: 0x4a6a4a })
          );
          tube.rotation.x = Math.PI / 2;
          g.add(tube);
          return g;
        }
      };

      const factory = guns[weaponType] || guns.usp;
      holder.add(factory());
    }
  }

  // ═══════════════════════════════════════
  // WALK ANIMATION SYSTEM
  // ═══════════════════════════════════════
  class WalkAnimator {
    constructor() {
      this.phase = 0;
      this.speed = 14;
      this.armSwing = 0.5;
      this.legSwing = 0.6;
      this.bodyBob = 0.03;
    }

    animate(playerMesh, isMoving, dt) {
      if (!playerMesh) return;

      const find = n => {
        for (const c of playerMesh.children) {
          if (c.name === n) return c;
        }
        return null;
      };

      const legL = find('legL');
      const legR = find('legR');
      const armL = find('armL');
      const armR = find('armR');
      const body = find('body');
      const head = find('head');

      if (isMoving) {
        this.phase += dt * this.speed;
        const sin = Math.sin(this.phase);
        const cos = Math.cos(this.phase);

        // Leg swing
        if (legL) legL.rotation.x = sin * this.legSwing;
        if (legR) legR.rotation.x = -sin * this.legSwing;

        // Arm swing (opposite to legs)
        if (armL) armL.rotation.x = -sin * this.armSwing;
        if (armR) armR.rotation.x = sin * this.armSwing;

        // Body bob
        if (body) body.position.y = 1.0 + Math.abs(sin) * this.bodyBob;

        // Slight head bob
        if (head) head.position.y = 1.6 + Math.abs(cos) * this.bodyBob * 0.5;

        // Slight body sway
        if (body) body.rotation.z = sin * 0.02;
      } else {
        // Return to idle
        const decay = 0.88;
        if (legL) legL.rotation.x *= decay;
        if (legR) legR.rotation.x *= decay;
        if (armL) armL.rotation.x *= decay;
        if (armR) armR.rotation.x *= decay;
        if (body) {
          body.position.y += (1.0 - body.position.y) * 0.1;
          body.rotation.z *= decay;
        }
        if (head) head.position.y += (1.6 - head.position.y) * 0.1;
      }
    }
  }

  // ═══════════════════════════════════════
  // PARTICLE EMITTER — Advanced particles
  // ═══════════════════════════════════════
  class ParticleEmitter {
    constructor(scene) {
      this.scene = scene;
      this.systems = [];
    }

    emit(config) {
      const particles = [];
      const count = config.count || 10;

      for (let i = 0; i < count; i++) {
        const size = (config.size || 0.1) * (0.4 + Math.random() * 0.6);
        let geo, mat;

        if (config.shape === 'box') {
          const sx = size * (0.3 + Math.random() * 0.7);
          const sy = size * (0.3 + Math.random() * 0.7);
          const sz = size * (0.3 + Math.random() * 0.7);
          geo = new THREE.BoxGeometry(sx, sy, sz);
        } else {
          geo = new THREE.SphereGeometry(size, 4, 4);
        }

        const color = typeof config.color === 'function' ? config.color() : (config.color || 0xff6600);
        mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: config.opacity || 1 });
        const mesh = new THREE.Mesh(geo, mat);

        const spread = config.spread || 0.5;
        mesh.position.set(
          config.x + (Math.random() - 0.5) * spread,
          config.y + (Math.random() - 0.5) * spread,
          config.z + (Math.random() - 0.5) * spread
        );

        if (config.shape === 'box') {
          mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        }

        this.scene.add(mesh);

        const speed = config.speed || 8;
        const dirSpread = config.dirSpread || 1;

        particles.push({
          mesh,
          vx: (config.vx || 0) + (Math.random() - 0.5) * speed * dirSpread,
          vy: (config.vy || 0) + Math.random() * speed * 0.7 + speed * 0.2,
          vz: (config.vz || 0) + (Math.random() - 0.5) * speed * dirSpread,
          rv: config.shape === 'box' ? {
            x: (Math.random() - 0.5) * 8,
            y: (Math.random() - 0.5) * 8,
            z: (Math.random() - 0.5) * 8
          } : null,
          life: (config.lifetime || 1.5) * (0.6 + Math.random() * 0.4),
          age: 0,
          gravity: config.gravity !== undefined ? config.gravity : -15,
          fadeOut: config.fadeOut !== false,
          groundBounce: config.groundBounce || false,
          groundFriction: config.groundFriction || 0.6
        });
      }

      this.systems.push({ particles });
    }

    blood(x, y, z, intensity) {
      this.emit({
        x, y, z, count: intensity || 15, speed: 7, size: 0.05,
        lifetime: 1.8, spread: 0.3,
        color: () => [0x8B0000, 0xCC0000, 0x660000, 0xAA0000, 0x990000][Math.floor(Math.random() * 5)],
        gravity: -14, groundBounce: true
      });
    }

    explosion(x, y, z, radius) {
      // Fire
      this.emit({
        x, y, z, count: 35, speed: radius * 2.5, size: 0.2,
        lifetime: 1.2, spread: 1.5,
        color: () => [0xff6600, 0xff2200, 0xff8800, 0xffaa00, 0xff4400][Math.floor(Math.random() * 5)],
        gravity: -3
      });
      // Smoke
      this.emit({
        x, y: y + 1, z, count: 18, speed: 3, size: 0.4,
        lifetime: 3.5, spread: 2.5, opacity: 0.6,
        color: () => { const g = 50 + Math.random() * 50; return (g << 16) | (g << 8) | g; },
        gravity: 2
      });
      // Sparks
      this.emit({
        x, y, z, count: 25, speed: 18, size: 0.025,
        lifetime: 0.9, spread: 0.5, color: 0xffff44, gravity: -22
      });
      // Embers
      this.emit({
        x, y, z, count: 12, speed: 6, size: 0.03,
        lifetime: 2.5, spread: 1, color: 0xff4400, gravity: -5
      });
    }

    debris(x, y, z, color, count) {
      this.emit({
        x, y, z, count: count || 12, speed: 12, size: 0.35,
        lifetime: 30, spread: 1.5, shape: 'box',
        color: color || 0x8B4513, gravity: -18, groundBounce: true,
        groundFriction: 0.7, fadeOut: false
      });
    }

    gibs(x, y, z) {
      const colors = [0xdaa06d, 0x8B0000, 0xCC0000, 0x660000, 0x2a2a3a];
      this.emit({
        x, y, z, count: 14, speed: 15, size: 0.18,
        lifetime: 5, spread: 0.5, shape: 'box',
        color: () => colors[Math.floor(Math.random() * colors.length)],
        gravity: -18, groundBounce: true, fadeOut: false
      });
      this.blood(x, y, z, 30);
    }

    muzzleFlash(x, y, z) {
      this.emit({
        x, y, z, count: 5, speed: 3, size: 0.08,
        lifetime: 0.08, spread: 0.1, color: 0xffff88, gravity: 0
      });
    }

    bulletImpact(x, y, z) {
      this.emit({
        x, y, z, count: 8, speed: 4, size: 0.03,
        lifetime: 0.5, spread: 0.1,
        color: () => [0xcccccc, 0x888888, 0xaaaaaa][Math.floor(Math.random() * 3)],
        gravity: -12
      });
    }

    update(dt) {
      for (let s = this.systems.length - 1; s >= 0; s--) {
        const sys = this.systems[s];
        for (let i = sys.particles.length - 1; i >= 0; i--) {
          const p = sys.particles[i];
          p.age += dt;

          if (p.age >= p.life) {
            this.scene.remove(p.mesh);
            if (p.mesh.geometry) p.mesh.geometry.dispose();
            if (p.mesh.material) p.mesh.material.dispose();
            sys.particles.splice(i, 1);
            continue;
          }

          p.mesh.position.x += p.vx * dt;
          p.vy += p.gravity * dt;
          p.mesh.position.y += p.vy * dt;
          p.mesh.position.z += p.vz * dt;

          if (p.rv) {
            p.mesh.rotation.x += p.rv.x * dt;
            p.mesh.rotation.y += p.rv.y * dt;
            p.mesh.rotation.z += p.rv.z * dt;
          }

          // Ground
          if (p.mesh.position.y < 0.02) {
            p.mesh.position.y = 0.02;
            if (p.groundBounce && Math.abs(p.vy) > 1) {
              p.vy = -p.vy * 0.3;
              p.vx *= p.groundFriction;
              p.vz *= p.groundFriction;
              if (p.rv) {
                p.rv.x *= 0.5;
                p.rv.y *= 0.5;
                p.rv.z *= 0.5;
              }
            } else {
              p.vy = 0;
              p.vx *= 0.9;
              p.vz *= 0.9;
            }
          }

          // Fade
          if (p.fadeOut && p.mesh.material) {
            p.mesh.material.opacity = Math.max(0, 1 - (p.age / p.life));
          }
        }

        if (sys.particles.length === 0) {
          this.systems.splice(s, 1);
        }
      }
    }
  }

  // ═══════════════════════════════════════
  // ENTITY SYSTEM (pluggable into engine)
  // ═══════════════════════════════════════
  class EntitySystem {
    constructor() {
      this.enabled = true;
      this.entities = [];
      this.particles = null;
      this.walkAnimator = null;
    }

    init(engine) {
      this.particles = new ParticleEmitter(engine.scene || null);
      this.walkAnimator = new WalkAnimator();
      engine.particles = this.particles;
      engine.walkAnimator = this.walkAnimator;
      engine.playerModels = PlayerModelBuilder;
    }

    setScene(scene) {
      if (this.particles) this.particles.scene = scene;
    }

    addEntity(entity) {
      this.entities.push(entity);
      return entity;
    }

    removeEntity(entity) {
      const idx = this.entities.indexOf(entity);
      if (idx !== -1) this.entities.splice(idx, 1);
    }

    update(dt) {
      for (const entity of this.entities) {
        if (entity.active && entity.update) entity.update(dt);
      }
      if (this.particles) this.particles.update(dt);
    }

    destroy() {
      this.entities = [];
    }
  }

  // ═══════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════
  if (!global.ImpactModules) global.ImpactModules = {};
  global.ImpactModules.Entities = {
    Entity,
    PlayerModelBuilder,
    WalkAnimator,
    ParticleEmitter,
    EntitySystem
  };

  console.log('[Impact Engine] Entities module loaded');

})(typeof window !== 'undefined' ? window : global);
