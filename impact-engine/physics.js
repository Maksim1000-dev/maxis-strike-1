// ═══════════════════════════════════════════════════════
// IMPACT ENGINE v2.0 — PHYSICS MODULE
// Rigid bodies, collisions, raycasting, explosions
// ═══════════════════════════════════════════════════════

(function(global) {
  'use strict';

  // ═══════════════════════════════════════
  // AABB — Axis-Aligned Bounding Box
  // ═══════════════════════════════════════
  class AABB {
    constructor(minX, minY, minZ, maxX, maxY, maxZ) {
      this.min = { x: minX, y: minY, z: minZ };
      this.max = { x: maxX, y: maxY, z: maxZ };
    }

    static fromBox(x, y, z, w, h, d) {
      return new AABB(x - w/2, y - h/2, z - d/2, x + w/2, y + h/2, z + d/2);
    }

    static fromSphere(x, y, z, r) {
      return new AABB(x - r, y - r, z - r, x + r, y + r, z + r);
    }

    intersects(other) {
      return this.min.x <= other.max.x && this.max.x >= other.min.x &&
             this.min.y <= other.max.y && this.max.y >= other.min.y &&
             this.min.z <= other.max.z && this.max.z >= other.min.z;
    }

    containsPoint(x, y, z) {
      return x >= this.min.x && x <= this.max.x &&
             y >= this.min.y && y <= this.max.y &&
             z >= this.min.z && z <= this.max.z;
    }

    center() {
      return {
        x: (this.min.x + this.max.x) / 2,
        y: (this.min.y + this.max.y) / 2,
        z: (this.min.z + this.max.z) / 2
      };
    }

    size() {
      return {
        x: this.max.x - this.min.x,
        y: this.max.y - this.min.y,
        z: this.max.z - this.min.z
      };
    }
  }

  // ═══════════════════════════════════════
  // RIGID BODY
  // ═══════════════════════════════════════
  class RigidBody {
    constructor(config = {}) {
      this.id = RigidBody._nextId++;
      this.mesh = config.mesh || null;
      this.type = config.type || 'dynamic'; // dynamic, static, kinematic
      this.shape = config.shape || 'box'; // box, sphere, cylinder

      // Position & rotation
      this.position = { x: config.x || 0, y: config.y || 0, z: config.z || 0 };
      this.rotation = { x: 0, y: 0, z: 0 };

      // Velocity
      this.velocity = { x: 0, y: 0, z: 0 };
      this.angularVelocity = { x: 0, y: 0, z: 0 };

      // Properties
      this.mass = config.mass || 1;
      this.invMass = this.type === 'static' ? 0 : 1 / this.mass;
      this.friction = config.friction || 0.92;
      this.bounciness = config.bounciness || 0.3;
      this.radius = config.radius || 0.5;
      this.halfExtents = config.halfExtents || { x: 0.5, y: 0.5, z: 0.5 };

      // State
      this.grounded = false;
      this.destroyed = false;
      this.sleeping = false;
      this.sleepTimer = 0;

      // Collision
      this.collisionGroup = config.collisionGroup || 'default';
      this.collidesWith = config.collidesWith || ['default'];
      this.isTrigger = config.isTrigger || false;
      this.onCollision = config.onCollision || null;

      // Tags
      this.tags = new Set(config.tags || []);
      this.userData = config.userData || {};
    }

    applyForce(fx, fy, fz) {
      if (this.type === 'static') return;
      this.velocity.x += fx * this.invMass;
      this.velocity.y += fy * this.invMass;
      this.velocity.z += fz * this.invMass;
      this.sleeping = false;
      this.sleepTimer = 0;
    }

    applyImpulse(ix, iy, iz) {
      if (this.type === 'static') return;
      this.velocity.x += ix;
      this.velocity.y += iy;
      this.velocity.z += iz;
      this.sleeping = false;
      this.sleepTimer = 0;
    }

    getSpeed() {
      return Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2 + this.velocity.z ** 2);
    }

    getAABB() {
      if (this.shape === 'sphere') {
        return AABB.fromSphere(this.position.x, this.position.y, this.position.z, this.radius);
      }
      return AABB.fromBox(
        this.position.x, this.position.y, this.position.z,
        this.halfExtents.x * 2, this.halfExtents.y * 2, this.halfExtents.z * 2
      );
    }

    syncToMesh() {
      if (!this.mesh) return;
      this.mesh.position.set(this.position.x, this.position.y, this.position.z);
      this.mesh.rotation.set(this.rotation.x, this.rotation.y, this.rotation.z);
    }

    syncFromMesh() {
      if (!this.mesh) return;
      this.position.x = this.mesh.position.x;
      this.position.y = this.mesh.position.y;
      this.position.z = this.mesh.position.z;
    }
  }
  RigidBody._nextId = 0;

  // ═══════════════════════════════════════
  // RAY — For raycasting
  // ═══════════════════════════════════════
  class Ray {
    constructor(ox, oy, oz, dx, dy, dz) {
      this.origin = { x: ox, y: oy, z: oz };
      const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
      this.direction = { x: dx/len, y: dy/len, z: dz/len };
    }

    intersectSphere(cx, cy, cz, radius) {
      const ex = this.origin.x - cx;
      const ey = this.origin.y - cy;
      const ez = this.origin.z - cz;
      const a = this.direction.x**2 + this.direction.y**2 + this.direction.z**2;
      const b = 2 * (ex * this.direction.x + ey * this.direction.y + ez * this.direction.z);
      const c = ex*ex + ey*ey + ez*ez - radius*radius;
      let disc = b*b - 4*a*c;
      if (disc < 0) return null;
      disc = Math.sqrt(disc);
      const t1 = (-b - disc) / (2*a);
      const t2 = (-b + disc) / (2*a);
      if (t1 > 0) return { distance: t1, point: this.getPoint(t1) };
      if (t2 > 0) return { distance: t2, point: this.getPoint(t2) };
      return null;
    }

    intersectAABB(aabb) {
      let tmin = -Infinity, tmax = Infinity;
      const axes = ['x', 'y', 'z'];
      for (const axis of axes) {
        if (Math.abs(this.direction[axis]) < 1e-8) {
          if (this.origin[axis] < aabb.min[axis] || this.origin[axis] > aabb.max[axis]) return null;
        } else {
          let t1 = (aabb.min[axis] - this.origin[axis]) / this.direction[axis];
          let t2 = (aabb.max[axis] - this.origin[axis]) / this.direction[axis];
          if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) return null;
        }
      }
      if (tmax < 0) return null;
      const t = tmin > 0 ? tmin : tmax;
      return { distance: t, point: this.getPoint(t) };
    }

    getPoint(t) {
      return {
        x: this.origin.x + this.direction.x * t,
        y: this.origin.y + this.direction.y * t,
        z: this.origin.z + this.direction.z * t
      };
    }
  }

  // ═══════════════════════════════════════
  // COLLISION RESOLVER
  // ═══════════════════════════════════════
  class CollisionResolver {
    static resolveSpheres(a, b) {
      const dx = b.position.x - a.position.x;
      const dy = b.position.y - a.position.y;
      const dz = b.position.z - a.position.z;
      const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      const minDist = a.radius + b.radius;

      if (dist >= minDist || dist === 0) return false;

      const nx = dx / dist, ny = dy / dist, nz = dz / dist;
      const overlap = minDist - dist;

      // Separate bodies
      const totalMass = a.invMass + b.invMass;
      if (totalMass === 0) return false;

      const aRatio = a.invMass / totalMass;
      const bRatio = b.invMass / totalMass;

      a.position.x -= nx * overlap * aRatio;
      a.position.y -= ny * overlap * aRatio;
      a.position.z -= nz * overlap * aRatio;
      b.position.x += nx * overlap * bRatio;
      b.position.y += ny * overlap * bRatio;
      b.position.z += nz * overlap * bRatio;

      // Bounce
      const relVx = b.velocity.x - a.velocity.x;
      const relVy = b.velocity.y - a.velocity.y;
      const relVz = b.velocity.z - a.velocity.z;
      const velAlongNormal = relVx * nx + relVy * ny + relVz * nz;

      if (velAlongNormal > 0) return true;

      const restitution = Math.min(a.bounciness, b.bounciness);
      const j = -(1 + restitution) * velAlongNormal / totalMass;

      a.velocity.x -= j * a.invMass * nx;
      a.velocity.y -= j * a.invMass * ny;
      a.velocity.z -= j * a.invMass * nz;
      b.velocity.x += j * b.invMass * nx;
      b.velocity.y += j * b.invMass * ny;
      b.velocity.z += j * b.invMass * nz;

      // Trigger callbacks
      if (a.onCollision) a.onCollision(b);
      if (b.onCollision) b.onCollision(a);

      return true;
    }

    static resolveBodyAABB(body, aabb) {
      if (body.type === 'static') return false;
      const ba = body.getAABB();
      if (!ba.intersects(aabb)) return false;

      // Find minimum penetration axis
      const overlaps = [
        { axis: 'x', sign: 1, depth: ba.max.x - aabb.min.x },
        { axis: 'x', sign: -1, depth: aabb.max.x - ba.min.x },
        { axis: 'y', sign: 1, depth: ba.max.y - aabb.min.y },
        { axis: 'y', sign: -1, depth: aabb.max.y - ba.min.y },
        { axis: 'z', sign: 1, depth: ba.max.z - aabb.min.z },
        { axis: 'z', sign: -1, depth: aabb.max.z - ba.min.z }
      ].filter(o => o.depth > 0);

      if (overlaps.length === 0) return false;

      overlaps.sort((a, b) => a.depth - b.depth);
      const min = overlaps[0];

      body.position[min.axis] -= min.sign * min.depth;
      body.velocity[min.axis] = -body.velocity[min.axis] * body.bounciness;

      if (min.axis === 'y' && min.sign === 1) {
        body.grounded = true;
        body.velocity.x *= body.friction;
        body.velocity.z *= body.friction;
      }

      return true;
    }
  }

  // ═══════════════════════════════════════
  // PHYSICS WORLD
  // ═══════════════════════════════════════
  class PhysicsWorld {
    constructor() {
      this.bodies = [];
      this.staticAABBs = [];
      this.gravity = { x: 0, y: -25, z: 0 };
      this.sleepThreshold = 0.05;
      this.sleepDelay = 1.0;
    }

    addBody(body) {
      this.bodies.push(body);
      return body;
    }

    removeBody(body) {
      const idx = this.bodies.indexOf(body);
      if (idx !== -1) this.bodies.splice(idx, 1);
    }

    addStaticAABB(aabb) {
      this.staticAABBs.push(aabb);
      return aabb;
    }

    removeStaticAABB(aabb) {
      const idx = this.staticAABBs.indexOf(aabb);
      if (idx !== -1) this.staticAABBs.splice(idx, 1);
    }

    clear() {
      this.bodies = [];
      this.staticAABBs = [];
    }

    raycast(ox, oy, oz, dx, dy, dz, maxDist = 100, filter = null) {
      const ray = new Ray(ox, oy, oz, dx, dy, dz);
      let closest = null;
      let closestDist = maxDist;

      for (const body of this.bodies) {
        if (body.destroyed || body.isTrigger) continue;
        if (filter && !filter(body)) continue;

        let hit = null;
        if (body.shape === 'sphere' || body.shape === 'cylinder') {
          hit = ray.intersectSphere(body.position.x, body.position.y, body.position.z, body.radius);
        } else {
          hit = ray.intersectAABB(body.getAABB());
        }

        if (hit && hit.distance < closestDist) {
          closestDist = hit.distance;
          closest = { body, distance: hit.distance, point: hit.point };
        }
      }

      return closest;
    }

    explosion(x, y, z, radius, force) {
      for (const body of this.bodies) {
        if (body.destroyed || body.type === 'static') continue;
        const dx = body.position.x - x;
        const dy = body.position.y - y;
        const dz = body.position.z - z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist < radius && dist > 0.01) {
          const falloff = 1 - (dist / radius);
          const f = force * falloff;
          body.applyImpulse((dx / dist) * f, f * 0.5, (dz / dist) * f);
        }
      }
    }

    step(dt) {
      // Integrate
      for (const body of this.bodies) {
        if (body.destroyed || body.type === 'static' || body.sleeping) continue;

        // Gravity
        body.velocity.x += this.gravity.x * dt;
        body.velocity.y += this.gravity.y * dt;
        body.velocity.z += this.gravity.z * dt;

        // Position
        body.position.x += body.velocity.x * dt;
        body.position.y += body.velocity.y * dt;
        body.position.z += body.velocity.z * dt;

        // Rotation from angular velocity
        body.rotation.x += body.angularVelocity.x * dt;
        body.rotation.y += body.angularVelocity.y * dt;
        body.rotation.z += body.angularVelocity.z * dt;

        // Rolling
        if (body.grounded && body.shape === 'sphere') {
          const speed = Math.sqrt(body.velocity.x**2 + body.velocity.z**2);
          if (speed > 0.1) {
            body.angularVelocity.x = body.velocity.z * 2;
            body.angularVelocity.z = -body.velocity.x * 2;
          }
        }

        // Angular damping
        body.angularVelocity.x *= 0.98;
        body.angularVelocity.y *= 0.98;
        body.angularVelocity.z *= 0.98;

        // Air friction
        body.velocity.x *= 0.995;
        body.velocity.z *= 0.995;

        // Ground collision
        const groundY = body.shape === 'sphere' ? body.radius : body.halfExtents.y;
        if (body.position.y <= groundY) {
          body.position.y = groundY;
          if (body.velocity.y < 0) {
            body.velocity.y = -body.velocity.y * body.bounciness;
            if (Math.abs(body.velocity.y) < 0.5) body.velocity.y = 0;
          }
          body.grounded = true;
          body.velocity.x *= body.friction;
          body.velocity.z *= body.friction;
        } else {
          body.grounded = false;
        }

        // Sleep check
        if (body.getSpeed() < this.sleepThreshold && body.grounded) {
          body.sleepTimer += dt;
          if (body.sleepTimer >= this.sleepDelay) {
            body.sleeping = true;
            body.velocity.x = 0;
            body.velocity.y = 0;
            body.velocity.z = 0;
          }
        } else {
          body.sleepTimer = 0;
        }
      }

      // Body-body collisions
      for (let i = 0; i < this.bodies.length; i++) {
        for (let j = i + 1; j < this.bodies.length; j++) {
          const a = this.bodies[i], b = this.bodies[j];
          if (a.destroyed || b.destroyed) continue;
          if (a.type === 'static' && b.type === 'static') continue;
          if (a.sleeping && b.sleeping) continue;
          CollisionResolver.resolveSpheres(a, b);
        }
      }

      // Static AABB collisions
      for (const body of this.bodies) {
        if (body.destroyed || body.type === 'static') continue;
        for (const aabb of this.staticAABBs) {
          CollisionResolver.resolveBodyAABB(body, aabb);
        }
      }

      // Sync meshes
      for (const body of this.bodies) {
        if (!body.destroyed) body.syncToMesh();
      }
    }
  }

  // ═══════════════════════════════════════
  // PHYSICS SYSTEM (pluggable into engine)
  // ═══════════════════════════════════════
  class PhysicsSystem {
    constructor() {
      this.enabled = true;
      this.world = null;
    }

    init(engine) {
      this.world = new PhysicsWorld();
      engine.physics = this.world;
    }

    update(dt) {
      if (this.world) this.world.step(dt);
    }

    destroy() {
      if (this.world) this.world.clear();
    }
  }

  // ═══════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════
  if (!global.ImpactModules) global.ImpactModules = {};
  global.ImpactModules.Physics = {
    AABB,
    RigidBody,
    Ray,
    CollisionResolver,
    PhysicsWorld,
    PhysicsSystem
  };

  console.log('[Impact Engine] Physics module loaded');

})(typeof window !== 'undefined' ? window : global);
