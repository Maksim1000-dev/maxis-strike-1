// ═══════════════════════════════════════════════════════
// IMPACT ENGINE v2.0 — RENDERER MODULE
// Materials, textures, post-processing, lighting
// ═══════════════════════════════════════════════════════

(function(global) {
  'use strict';

  // ═══════════════════════════════════════
  // TEXTURE GENERATOR — HD Procedural Textures
  // ═══════════════════════════════════════
  class TextureGenerator {
    constructor() {
      this._cache = {};
    }

    get(name, resolution) {
      const key = name + '_' + (resolution || 256);
      if (this._cache[key]) return this._cache[key];
      const gen = this['_gen_' + name];
      if (!gen) return this._gen_fallback(name, resolution);
      const tex = gen.call(this, resolution || 256);
      this._cache[key] = tex;
      return tex;
    }

    _createCanvas(size) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      return { canvas: c, ctx: c.getContext('2d') };
    }

    _toTexture(canvas) {
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      return tex;
    }

    _gen_brick(size) {
      const { canvas, ctx } = this._createCanvas(size);
      ctx.fillStyle = '#7a3a1a';
      ctx.fillRect(0, 0, size, size);
      const bw = size / 6, bh = size / 12;
      for (let y = 0; y < size; y += bh) {
        const offset = (Math.floor(y / bh) % 2) * (bw / 2);
        for (let x = -bw; x < size + bw; x += bw) {
          const bx = x + offset;
          const r = 140 + Math.random() * 50, g = 55 + Math.random() * 35, b = 15 + Math.random() * 25;
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(bx + 1, y + 1, bw - 2, bh - 2);
          for (let i = 0; i < 20; i++) {
            ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
            ctx.fillRect(bx + Math.random() * bw, y + Math.random() * bh, 1 + Math.random(), 1 + Math.random());
          }
          ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
          ctx.fillRect(bx + 2, y + 1, bw - 4, 1);
        }
      }
      ctx.strokeStyle = 'rgba(120,110,90,0.4)';
      ctx.lineWidth = 1.5;
      for (let y = 0; y <= size; y += bh) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
      }
      return this._toTexture(canvas);
    }

    _gen_concrete(size) {
      const { canvas, ctx } = this._createCanvas(size);
      const grad = ctx.createLinearGradient(0, 0, size, size);
      grad.addColorStop(0, '#888888');
      grad.addColorStop(0.5, '#7a7a7a');
      grad.addColorStop(1, '#909090');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 8000; i++) {
        const g = 90 + Math.random() * 70;
        ctx.fillStyle = `rgba(${g},${g},${g},0.2)`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
      ctx.strokeStyle = 'rgba(50,50,50,0.3)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        let cx = Math.random() * size, cy = Math.random() * size;
        ctx.moveTo(cx, cy);
        for (let j = 0; j < 12; j++) {
          cx += (Math.random() - 0.5) * 40;
          cy += (Math.random() - 0.5) * 40;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = `rgba(${60 + Math.random() * 30},${55 + Math.random() * 25},${50 + Math.random() * 20},0.15)`;
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, 5 + Math.random() * 20, 0, Math.PI * 2);
        ctx.fill();
      }
      return this._toTexture(canvas);
    }

    _gen_metal(size) {
      const { canvas, ctx } = this._createCanvas(size);
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0, '#6a6a7a');
      grad.addColorStop(0.3, '#8a8a9a');
      grad.addColorStop(0.7, '#7a7a8a');
      grad.addColorStop(1, '#5a5a6a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 4000; i++) {
        const g = 80 + Math.random() * 80;
        ctx.fillStyle = `rgba(${g},${g},${g + 10},0.12)`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 1, Math.random() * 4 + 1);
      }
      ctx.strokeStyle = 'rgba(200,200,220,0.15)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 20; i++) {
        ctx.beginPath();
        const sx = Math.random() * size;
        ctx.moveTo(sx, Math.random() * size);
        ctx.lineTo(sx + (Math.random() - 0.5) * 80, Math.random() * size);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(70,70,80,0.7)';
      for (let x = size / 8; x < size; x += size / 4) {
        for (let y = size / 8; y < size; y += size / 4) {
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(120,120,130,0.5)';
          ctx.beginPath();
          ctx.arc(x - 0.5, y - 0.5, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(70,70,80,0.7)';
        }
      }
      return this._toTexture(canvas);
    }

    _gen_wood(size) {
      const { canvas, ctx } = this._createCanvas(size);
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(0, 0, size, size);
      for (let y = 0; y < size; y++) {
        const wave = Math.sin(y * 0.03) * 15 + Math.sin(y * 0.07) * 8;
        const r = 135 + Math.sin(y * 0.08 + wave * 0.1) * 25;
        const g = 100 + Math.sin(y * 0.08 + wave * 0.1) * 18;
        const b = 20 + Math.sin(y * 0.08 + wave * 0.1) * 12;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0, y, size, 1);
      }
      for (let i = 0; i < 4; i++) {
        const kx = Math.random() * size, ky = Math.random() * size;
        const kr = 6 + Math.random() * 14;
        const grad = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
        grad.addColorStop(0, 'rgba(70,40,8,0.7)');
        grad.addColorStop(0.5, 'rgba(80,50,12,0.4)');
        grad.addColorStop(1, 'rgba(80,50,12,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(kx, ky, kr, kr * 0.5, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
      }
      return this._toTexture(canvas);
    }

    _gen_sand(size) {
      const { canvas, ctx } = this._createCanvas(size);
      const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size);
      grad.addColorStop(0, '#D4B36A');
      grad.addColorStop(1, '#B89A50');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 12000; i++) {
        const r = 175 + Math.random() * 50;
        const g = 145 + Math.random() * 45;
        const b = 65 + Math.random() * 50;
        ctx.fillStyle = `rgba(${r},${g},${b},0.35)`;
        const s = Math.random() * 2.5 + 0.5;
        ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
      }
      for (let i = 0; i < 30; i++) {
        const g = 140 + Math.random() * 40;
        ctx.fillStyle = `rgba(${g},${g - 20},${g - 50},0.4)`;
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, 1.5 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      return this._toTexture(canvas);
    }

    _gen_grass(size) {
      const { canvas, ctx } = this._createCanvas(size);
      ctx.fillStyle = '#3a6a20';
      ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 5000; i++) {
        const x = Math.random() * size, y = Math.random() * size;
        const r = 30 + Math.random() * 60;
        const g = 80 + Math.random() * 80;
        const b = 15 + Math.random() * 35;
        ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`;
        ctx.lineWidth = 0.5 + Math.random() * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
        const len = 3 + Math.random() * 5;
        ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
        ctx.stroke();
      }
      for (let i = 0; i < 15; i++) {
        ctx.fillStyle = `rgba(${80 + Math.random() * 40},${60 + Math.random() * 30},${30 + Math.random() * 25},0.25)`;
        ctx.beginPath();
        ctx.arc(Math.random() * size, Math.random() * size, 4 + Math.random() * 10, 0, Math.PI * 2);
        ctx.fill();
      }
      return this._toTexture(canvas);
    }

    _gen_darkfloor(size) {
      const { canvas, ctx } = this._createCanvas(size);
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(0, 0, size, size);
      const ts = size / 8;
      for (let x = 0; x < size; x += ts) {
        for (let y = 0; y < size; y += ts) {
          const g = 38 + Math.random() * 22;
          ctx.fillStyle = `rgb(${g},${g},${g + 12})`;
          ctx.fillRect(x + 1, y + 1, ts - 2, ts - 2);
          for (let i = 0; i < 15; i++) {
            ctx.fillStyle = `rgba(${35 + Math.random() * 25},${35 + Math.random() * 25},${45 + Math.random() * 25},0.25)`;
            ctx.fillRect(x + Math.random() * ts, y + Math.random() * ts, 1, 1);
          }
        }
      }
      ctx.strokeStyle = 'rgba(20,20,30,0.6)';
      ctx.lineWidth = 1.5;
      for (let x = 0; x <= size; x += ts) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke(); }
      for (let y = 0; y <= size; y += ts) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke(); }
      return this._toTexture(canvas);
    }

    _gen_crate(size) {
      const { canvas, ctx } = this._createCanvas(size);
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(0, 0, size, size);
      for (let y = 0; y < size; y++) {
        const r = 130 + Math.sin(y * 0.1) * 20;
        const g = 95 + Math.sin(y * 0.1) * 15;
        const b = 18 + Math.sin(y * 0.1) * 8;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0, y, size, 1);
      }
      ctx.strokeStyle = 'rgba(60,40,10,0.6)';
      ctx.lineWidth = 3;
      ctx.strokeRect(4, 4, size - 8, size - 8);
      ctx.beginPath();
      ctx.moveTo(4, 4); ctx.lineTo(size - 4, size - 4);
      ctx.moveTo(size - 4, 4); ctx.lineTo(4, size - 4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(100,100,110,0.7)';
      const cs = 8;
      ctx.fillRect(2, 2, cs, cs);
      ctx.fillRect(size - cs - 2, 2, cs, cs);
      ctx.fillRect(2, size - cs - 2, cs, cs);
      ctx.fillRect(size - cs - 2, size - cs - 2, cs, cs);
      return this._toTexture(canvas);
    }

    _gen_barrel(size) {
      const { canvas, ctx } = this._createCanvas(size);
      const grad = ctx.createLinearGradient(0, 0, size, 0);
      grad.addColorStop(0, '#5a1a1a');
      grad.addColorStop(0.3, '#8B2020');
      grad.addColorStop(0.5, '#9a2a2a');
      grad.addColorStop(0.7, '#8B2020');
      grad.addColorStop(1, '#5a1a1a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(80,80,90,0.6)';
      ctx.fillRect(0, 0, size, size / 16);
      ctx.fillRect(0, size - size / 16, size, size / 16);
      ctx.fillRect(0, size / 2 - size / 32, size, size / 16);
      for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
      }
      return this._toTexture(canvas);
    }

    _gen_fallback(name, size) {
      const { canvas, ctx } = this._createCanvas(size || 64);
      const colors = { wall: '#707070', floor: '#555555', ceiling: '#404040' };
      ctx.fillStyle = colors[name] || '#808080';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 500; i++) {
        ctx.fillStyle = `rgba(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255},0.03)`;
        ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
      }
      return this._toTexture(canvas);
    }

    clearCache() {
      for (const key in this._cache) {
        if (this._cache[key].dispose) this._cache[key].dispose();
      }
      this._cache = {};
    }
  }

  // ═══════════════════════════════════════
  // MATERIAL FACTORY
  // ═══════════════════════════════════════
  class MaterialFactory {
    constructor(texGen) {
      this._texGen = texGen;
      this._cache = {};
    }

    get(type, options = {}) {
      const key = type + JSON.stringify(options);
      if (this._cache[key]) return this._cache[key].clone();

      let mat;
      switch (type) {
        case 'brick':
          mat = new THREE.MeshLambertMaterial({ map: this._texGen.get('brick', options.res || 256) });
          break;
        case 'concrete':
          mat = new THREE.MeshLambertMaterial({ map: this._texGen.get('concrete', options.res || 256) });
          break;
        case 'metal':
          mat = new THREE.MeshLambertMaterial({ map: this._texGen.get('metal', options.res || 256) });
          break;
        case 'wood':
          mat = new THREE.MeshLambertMaterial({ map: this._texGen.get('wood', options.res || 256) });
          break;
        case 'crate':
          mat = new THREE.MeshLambertMaterial({ map: this._texGen.get('crate', options.res || 256) });
          break;
        case 'barrel':
          mat = new THREE.MeshLambertMaterial({ map: this._texGen.get('barrel', options.res || 256) });
          break;
        case 'sand':
          mat = new THREE.MeshLambertMaterial({ map: this._texGen.get('sand', options.res || 256) });
          break;
        case 'grass':
          mat = new THREE.MeshLambertMaterial({ map: this._texGen.get('grass', options.res || 256) });
          break;
        case 'darkfloor':
          mat = new THREE.MeshLambertMaterial({ map: this._texGen.get('darkfloor', options.res || 256) });
          break;
        default:
          mat = new THREE.MeshLambertMaterial({ color: options.color || 0x808080 });
      }
      this._cache[key] = mat;
      return mat;
    }
  }

  // ═══════════════════════════════════════
  // LIGHTING MANAGER
  // ═══════════════════════════════════════
  class LightingManager {
    constructor() {
      this.lights = [];
      this.ambient = null;
      this.sun = null;
    }

    setupScene(scene, preset) {
      this.clearLights(scene);

      const presets = {
        day: { ambColor: 0xaabbcc, ambInt: 0.6, sunColor: 0xffffff, sunInt: 1.0, sunPos: [40, 60, 30], skyColor: 0x4a6a8a, fogNear: 80, fogFar: 200 },
        desert: { ambColor: 0xffeedd, ambInt: 0.7, sunColor: 0xfff0d0, sunInt: 1.2, sunPos: [50, 80, 20], skyColor: 0x87CEEB, fogNear: 100, fogFar: 250 },
        night: { ambColor: 0x334466, ambInt: 0.3, sunColor: 0x8888cc, sunInt: 0.4, sunPos: [20, 40, 10], skyColor: 0x0a0a1e, fogNear: 40, fogFar: 120 },
        arena: { ambColor: 0xccccff, ambInt: 0.5, sunColor: 0xeeeeff, sunInt: 0.8, sunPos: [30, 50, 30], skyColor: 0x1a1a2e, fogNear: 60, fogFar: 180 }
      };

      const p = presets[preset] || presets.day;

      this.ambient = new THREE.AmbientLight(p.ambColor, p.ambInt);
      scene.add(this.ambient);
      this.lights.push(this.ambient);

      this.sun = new THREE.DirectionalLight(p.sunColor, p.sunInt);
      this.sun.position.set(p.sunPos[0], p.sunPos[1], p.sunPos[2]);
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.width = 2048;
      this.sun.shadow.mapSize.height = 2048;
      this.sun.shadow.camera.near = 0.5;
      this.sun.shadow.camera.far = 200;
      this.sun.shadow.camera.left = -80;
      this.sun.shadow.camera.right = 80;
      this.sun.shadow.camera.top = 80;
      this.sun.shadow.camera.bottom = -80;
      scene.add(this.sun);
      this.lights.push(this.sun);

      scene.background = new THREE.Color(p.skyColor);
      scene.fog = new THREE.Fog(p.skyColor, p.fogNear, p.fogFar);

      return p;
    }

    addPointLight(scene, x, y, z, color, intensity, distance) {
      const light = new THREE.PointLight(color || 0xffaa44, intensity || 1, distance || 20);
      light.position.set(x, y, z);
      scene.add(light);
      this.lights.push(light);
      return light;
    }

    clearLights(scene) {
      for (const light of this.lights) {
        scene.remove(light);
      }
      this.lights = [];
      this.ambient = null;
      this.sun = null;
    }
  }

  // ═══════════════════════════════════════
  // RENDER SYSTEM (pluggable into engine)
  // ═══════════════════════════════════════
  class RenderSystem {
    constructor() {
      this.enabled = true;
      this.textures = null;
      this.materials = null;
      this.lighting = null;
    }

    init(engine) {
      this.textures = new TextureGenerator();
      this.materials = new MaterialFactory(this.textures);
      this.lighting = new LightingManager();
      engine.textures = this.textures;
      engine.materials = this.materials;
      engine.lighting = this.lighting;
    }

    update(dt) {
      // Render system doesn't need per-frame updates — Three.js handles rendering
    }

    destroy() {
      if (this.textures) this.textures.clearCache();
    }
  }

  // ═══════════════════════════════════════
  // EXPORT
  // ═══════════════════════════════════════
  if (!global.ImpactModules) global.ImpactModules = {};
  global.ImpactModules.Renderer = {
    TextureGenerator,
    MaterialFactory,
    LightingManager,
    RenderSystem
  };

  console.log('[Impact Engine] Renderer module loaded');

})(typeof window !== 'undefined' ? window : global);
