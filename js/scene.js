// 3D 舞台：把仓库状态画成三个区域的文件卡片 + 提交图 + 对象层（tree / blob）+ 远程仓库。
// 每次命令执行后调用 sync()，节点按 key 做增删和位置补间。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { hashBlob } from './git.js';

const DX = 3.3; // 相邻提交的水平间距
const LANE = 1.1; // 分叉泳道在纵深方向的间距
const RISE = 1.75; // 每条泳道抬高的高度：分叉主要靠高度区分，正面看也清楚
const ZZ = 8.8;
const Z0 = -3; // 提交图所在的 z
const LS = 1.3; // 提交图上文字的放大倍数 // 三个区域平台所在的 z
const PX = 1 / 56; // 文字精灵：1 个 CSS 像素对应的世界单位
const DPR = 2;
const FONT = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
const MONO = "'SF Mono', ui-monospace, Menlo, Consolas, monospace";

const THEMES = {
  light: {
    text: '#1d1d1f', text2: '#6e6e73', text3: '#86868b', panel: '#ffffff', fill: '#e8e8ed', line: '#d2d2d7',
    primary: '#0071e3', success: '#248a3d', warning: '#c93400', danger: '#d70015',
    commit: 0x0071e3, tree: 0x248a3d, blob: 0xc93400, dangling: 0xc7c7cc, edge: 0xb0b0b8, platform: 0xffffff, plate: 0xe2e2e8, shadow: 0.13,
  },
  dark: {
    text: '#f5f5f7', text2: '#a1a1a6', text3: '#8e8e93', panel: '#2c2c2e', fill: '#3a3a3c', line: '#48484a',
    primary: '#0a84ff', success: '#30d158', warning: '#ff9f0a', danger: '#ff453a',
    commit: 0x0a84ff, tree: 0x30d158, blob: 0xff9f0a, dangling: 0x48484a, edge: 0x636366, platform: 0x2c2c2e, plate: 0x1c1c1e, shadow: 0.4,
  },
};

const ZONES = [
  { id: 'work', x: -7.6, title: '工作区', sub: 'Working Directory · 你正在编辑的文件' },
  { id: 'index', x: 0, title: '暂存区', sub: 'Index · 下一次提交的草稿' },
  { id: 'head', x: 7.6, title: '版本库', sub: 'HEAD · 最近一次提交的快照' },
];

export const VIEWS = {
  overview: { pos: [0, 13, 27], target: [0, 2.2, 3.5] },
  zones: { pos: [0, 7.5, 21.5], target: [0, 1.5, 6.6] },
  objects: { pos: [12.5, 12.5, 21], target: [3, 3.2, 1.5] },
  dag: { pos: [0, 12.5, 26.5], target: [0, 2.5, 3.2] },
  remote: { pos: [-10, 17, 27], target: [0, 2, 0] },
};

const measureCtx = document.createElement('canvas').getContext('2d');
function textWidth(text, font) {
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}
function fitText(text, font, max) {
  if (textWidth(text, font) <= max) return text;
  let s = text;
  while (s.length > 1 && textWidth(s + '…', font) > max) s = s.slice(0, -1);
  return s + '…';
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * DPR);
  c.height = Math.ceil(h * DPR);
  const g = c.getContext('2d');
  g.scale(DPR, DPR);
  return [c, g];
}
function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function spriteFrom(canvas, w, h) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(canvas), transparent: true, depthWrite: false }));
  s.scale.set(w * PX, h * PX, 1);
  return s;
}
function disposeSprite(s) {
  s.material.map.dispose();
  s.material.dispose();
  s.removeFromParent();
}

export class Stage {
  constructor(container, { onSelect, onHover } = {}) {
    this.el = container;
    this.onSelect = onSelect || (() => {});
    this.onHover = onHover || (() => {});
    this.dark = false;
    this.T = THEMES.light;
    this.showObjects = false;
    this.repo = null;
    this.nodes = new Map();
    this.edges = new Map();
    this.pickables = [];
    this.selectedKey = null;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
    this.camera.position.set(...VIEWS.overview.pos);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 90;
    this.controls.target.set(...VIEWS.overview.target);
    this.controls.addEventListener('start', () => {
      this.userMoved = true;
      this.fly = null;
    });

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xd8d8e0, 1.5);
    this.scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 2.1));
    sun.position.set(-10, 26, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 });
    sun.shadow.bias = -0.0004;
    sun.shadow.radius = 5;
    this.scene.add(sun);

    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.ShadowMaterial({ opacity: 0.13 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // 共享几何体与材质
    this.geo = {
      commit: new THREE.SphereGeometry(0.62, 40, 28),
      tree: new THREE.OctahedronGeometry(0.6, 0),
      blob: new THREE.BoxGeometry(0.74, 0.74, 0.74),
      card: new THREE.BoxGeometry(1.7, 2.15, 0.07),
      shaft: new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0),
      cone: new THREE.ConeGeometry(1, 1, 14),
    };
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.05, ...o });
    this.mat = {
      commit: std(), remoteCommit: std({ roughness: 0.6 }), dangling: std({ transparent: true, opacity: 0.55 }),
      tree: std({ flatShading: true }), blob: std(), edge: std({ roughness: 0.8 }), platform: std({ roughness: 0.9 }),
      plate: std({ roughness: 1, transparent: true, opacity: 0.7 }), cardSide: std({ roughness: 0.9 }),
    };

    this.buildStatic();
    this.applyTheme();

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.045, 12, 64), new THREE.MeshBasicMaterial({ color: 0x0071e3 }));
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.headLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]),
      new THREE.LineDashedMaterial({ color: 0x0071e3, dashSize: 0.28, gapSize: 0.2, transparent: true, opacity: 0.7 }),
    );
    this.headLine.visible = false;
    this.scene.add(this.headLine);

    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.clock = new THREE.Clock();
    this.fly = null;
    renderer.setAnimationLoop(() => this.frame());
  }

  // ───────────── 静态布景：三个区域的平台 ─────────────
  buildStatic() {
    this.zoneSprites = [];
    this.statics = new THREE.Group();
    this.scene.add(this.statics);
    const g = new THREE.BoxGeometry(6.7, 0.24, 4.8);
    for (const z of ZONES) {
      const m = new THREE.Mesh(g, this.mat.platform);
      m.position.set(z.x, 0.12, ZZ);
      m.castShadow = m.receiveShadow = true;
      this.statics.add(m);
    }
    this.remotePlate = new THREE.Mesh(new THREE.BoxGeometry(1, 0.14, 1), this.mat.plate);
    this.remotePlate.receiveShadow = true;
    this.remotePlate.visible = false;
    this.scene.add(this.remotePlate);
    this.floating = {}; // 跟随布局移动的说明文字：local / remote
  }

  rebuildStaticLabels() {
    for (const s of this.zoneSprites) disposeSprite(s);
    this.zoneSprites = [];
    const T = this.T;
    const add = (sprite, x, y, z) => {
      sprite.position.set(x, y, z);
      this.statics.add(sprite);
      this.zoneSprites.push(sprite);
    };
    for (const z of ZONES) {
      const [c, g] = makeCanvas(300, 52);
      g.textAlign = 'center';
      g.fillStyle = T.text;
      g.font = `600 19px ${FONT}`;
      g.fillText(z.title, 150, 22);
      g.fillStyle = T.text3;
      g.font = `12px ${FONT}`;
      g.fillText(z.sub, 150, 43);
      add(spriteFrom(c, 300, 52), z.x, 0.75, ZZ + 3.1);
    }
    const arrows = [
      [-3.8, 'git add  →', '←  git restore --staged'],
      [3.8, 'git commit  →', '←  git reset'],
    ];
    for (const [x, a, b] of arrows) {
      const [c, g] = makeCanvas(190, 44);
      g.textAlign = 'center';
      g.fillStyle = T.primary;
      g.font = `600 13px ${MONO}`;
      g.fillText(a, 95, 16);
      g.fillStyle = T.text3;
      g.font = `12px ${MONO}`;
      g.fillText(b, 95, 36);
      add(spriteFrom(c, 190, 44), x, 2.2, ZZ + 0.2);
    }
    for (const k of ['local', 'remote']) {
      if (this.floating[k]) disposeSprite(this.floating[k].sprite);
      const [c, g] = makeCanvas(230, 44);
      g.textAlign = 'right';
      g.fillStyle = T.text;
      g.font = `600 15px ${FONT}`;
      g.fillText(k === 'local' ? '本地仓库' : '远程仓库 origin', 226, 17);
      g.fillStyle = T.text3;
      g.font = `12px ${FONT}`;
      g.fillText(k === 'local' ? '.git/objects 里的提交图' : '在服务器上，靠 push / fetch 同步', 226, 37);
      const sprite = spriteFrom(c, 230, 44);
      sprite.center.set(1, 0.5);
      const old = this.floating[k];
      sprite.position.copy(old ? old.sprite.position : new THREE.Vector3(-4, 3, 0));
      sprite.visible = old ? old.sprite.visible : false;
      this.scene.add(sprite);
      this.floating[k] = { sprite, target: old ? old.target : sprite.position.clone() };
    }
  }

  setTheme(dark) {
    this.dark = dark;
    this.T = dark ? THEMES.dark : THEMES.light;
    this.applyTheme();
    for (const n of this.nodes.values()) n.sigs = {};
    this.sync();
  }

  applyTheme() {
    const T = this.T, m = this.mat;
    m.commit.color.set(T.commit);
    m.remoteCommit.color.set(T.commit);
    m.dangling.color.set(T.dangling);
    m.tree.color.set(T.tree);
    m.blob.color.set(T.blob);
    m.edge.color.set(T.edge);
    m.platform.color.set(T.platform);
    m.plate.color.set(T.plate);
    m.cardSide.color.set(T.panel);
    this.ground.material.opacity = T.shadow;
    this.hemi.intensity = this.dark ? 0.9 : 1.5;
    this.hemi.groundColor.set(this.dark ? 0x222228 : 0xd8d8e0);
    this.sun.intensity = this.dark ? 1.6 : 2.1;
    if (this.ring) this.ring.material.color.set(T.primary);
    if (this.headLine) this.headLine.material.color.set(T.primary);
    this.rebuildStaticLabels();
  }

  // ───────────── 节点 / 连线的增删 ─────────────
  node(key, kind, want, make) {
    want.add(key);
    let n = this.nodes.get(key);
    if (!n) {
      n = { key, kind, target: new THREE.Vector3(), s: 0.001, ts: 1, base: 1, sprites: {}, sigs: {}, info: null, tip: '' };
      n.obj = make(n);
      n.obj.userData.node = n;
      n.obj.scale.setScalar(0.001);
      n.fresh = true;
      this.scene.add(n.obj);
      this.pickables.push(n.obj);
      this.nodes.set(key, n);
    }
    n.ts = 1;
    return n;
  }

  place(n, x, y, z, spawn) {
    n.target.set(x, y, z);
    if (n.fresh) {
      n.obj.position.copy(spawn || n.target);
      n.fresh = false;
    }
  }

  /** 给节点挂一个文字精灵；签名没变就不重画 */
  label(n, slot, sig, build) {
    sig += this.dark ? '|d' : '|l';
    if (n.sigs[slot] === sig) return;
    n.sigs[slot] = sig;
    if (n.sprites[slot]) disposeSprite(n.sprites[slot]);
    delete n.sprites[slot];
    const s = build();
    if (s) {
      n.sprites[slot] = s;
      n.obj.add(s);
    }
  }

  dropNode(n) {
    for (const s of Object.values(n.sprites)) disposeSprite(s);
    if (n.cardMat) { n.cardMat.map.dispose(); n.cardMat.dispose(); }
    this.scene.remove(n.obj);
    this.pickables.splice(this.pickables.indexOf(n.obj), 1);
    this.nodes.delete(n.key);
    if (this.selectedKey === n.key) this.selectedKey = null;
  }

  edge(a, b, want, thin = false) {
    const key = a + '>' + b;
    want.add(key);
    if (this.edges.has(key)) return;
    const group = new THREE.Group();
    const r = thin ? 0.028 : 0.05;
    const shaft = new THREE.Mesh(this.geo.shaft, this.mat.edge);
    shaft.scale.set(r, 1, r);
    const cone = new THREE.Mesh(this.geo.cone, this.mat.edge);
    const head = thin ? 0.2 : 0.32;
    cone.scale.set(r * 2.6, head, r * 2.6);
    group.add(shaft, cone);
    this.scene.add(group);
    this.edges.set(key, { a, b, group, shaft, cone, head, r });
  }

  // ───────────── 文字贴图 ─────────────
  pills(list) {
    const T = this.T, font = `600 13px ${FONT}`, H = 24, GAP = 5, PAD = 11;
    const ws = list.map((p) => textWidth(p.text, font) + PAD * 2);
    const W = Math.max(...ws) + 4, HH = list.length * H + (list.length - 1) * GAP + 4;
    const [c, g] = makeCanvas(W, HH);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    list.forEach((p, i) => {
      const w = ws[i], x = (W - w) / 2, y = 2 + i * (H + GAP);
      g.beginPath();
      g.roundRect(x, y, w, H, H / 2);
      const st = { head: [T.primary, null, '#fff'], branch: [T.panel, T.primary, T.primary], remote: [T.fill, null, T.text2], tag: [T.panel, T.line, T.text2] }[p.style];
      g.fillStyle = st[0];
      g.fill();
      if (st[1]) { g.lineWidth = 1.5; g.strokeStyle = st[1]; g.stroke(); }
      g.fillStyle = st[2];
      g.fillText(p.text, W / 2, y + H / 2 + 0.5);
    });
    const s = spriteFrom(c, W, HH);
    s.scale.multiplyScalar(LS);
    s.center.set(0.5, 0);
    s.position.y = 0.84;
    s.renderOrder = 5;
    return s;
  }

  caption(line1, line2, dy = -0.8) {
    const T = this.T, f1 = `600 12px ${MONO}`, f2 = `12px ${FONT}`;
    const W = Math.ceil(Math.min(150, Math.max(textWidth(line1, f1), line2 ? textWidth(line2, f2) : 0) + 8));
    const [c, g] = makeCanvas(W, line2 ? 36 : 18);
    g.textAlign = 'center';
    g.fillStyle = T.text;
    g.font = f1;
    g.fillText(fitText(line1, f1, W - 4), W / 2, 13);
    if (line2) {
      g.fillStyle = T.text2;
      g.font = f2;
      g.fillText(fitText(line2, f2, W - 4), W / 2, 30);
    }
    const s = spriteFrom(c, W, line2 ? 36 : 18);
    s.scale.multiplyScalar(LS);
    s.center.set(0.5, 1);
    s.position.y = dy;
    return s;
  }

  cardTexture(path, hash, status, tone, ghost) {
    const T = this.T, W = 150, H = 190;
    const [c, g] = makeCanvas(W, H);
    g.fillStyle = T.panel;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = T.line;
    g.lineWidth = 2;
    if (ghost) g.setLineDash([7, 5]);
    g.strokeRect(1, 1, W - 2, H - 2);
    g.setLineDash([]);
    // 折角
    g.fillStyle = T.fill;
    g.beginPath(); g.moveTo(W - 30, 1); g.lineTo(W - 1, 30); g.lineTo(W - 30, 30); g.closePath(); g.fill();
    const i = path.lastIndexOf('/');
    const dir = i < 0 ? '' : path.slice(0, i + 1), name = path.slice(i + 1);
    g.textAlign = 'left';
    if (dir) { g.fillStyle = T.text3; g.font = `13px ${MONO}`; g.fillText(fitText(dir, g.font, W - 46), 13, 30); }
    g.fillStyle = T.text;
    const f = `600 17px ${FONT}`;
    g.font = f;
    g.fillText(fitText(name, f, W - 24), 13, 58);
    // 几行示意文字
    g.fillStyle = T.fill;
    for (let k = 0; k < 3; k++) g.fillRect(13, 76 + k * 13, [96, 118, 70][k], 5);
    g.fillStyle = T.text3;
    g.font = `12px ${MONO}`;
    g.fillText('blob', 13, 136);
    g.fillStyle = T.text2;
    g.font = `600 13px ${MONO}`;
    g.fillText(hash.slice(0, 7), 46, 136);
    if (status) {
      const col = T[tone] || T.text3;
      g.fillStyle = col;
      g.beginPath(); g.arc(19, 164, 4.5, 0, Math.PI * 2); g.fill();
      g.font = `600 14px ${FONT}`;
      g.fillText(status, 30, 169);
    }
    return canvasTexture(c);
  }

  // ───────────── 根据仓库状态重排整个场景 ─────────────
  setRepo(repo) {
    this.repo = repo;
    this.selectedKey = null;
    this.sync();
  }

  setShowObjects(v) {
    this.showObjects = v;
    this.sync();
  }

  sync() {
    const repo = this.repo;
    if (!repo) return;
    const want = new Set(), wantE = new Set();
    const s7 = (h) => h.slice(0, 7);

    // 1) 提交：本地与远程的并集按创建顺序排开，同一个提交在两边 x 相同
    const commits = new Map();
    for (const [h, o] of repo.objects) if (o.type === 'commit') commits.set(h, o);
    if (repo.remote) for (const [h, o] of repo.remote.objects) if (o.type === 'commit') commits.set(h, o);
    const order = [...commits.keys()].sort((a, b) => commits.get(a).seq - commits.get(b).seq);
    const laneOf = new Map(), tip = [], free = [];
    const alloc = () => {
      const i = free.indexOf(true);
      if (i >= 0) { free[i] = false; return i; }
      tip.push(null); free.push(false);
      return tip.length - 1;
    };
    for (const h of order) {
      const ps = commits.get(h).parents.filter((p) => laneOf.has(p));
      const p0 = ps[0];
      const lane = p0 !== undefined && tip[laneOf.get(p0)] === p0 ? laneOf.get(p0) : alloc();
      laneOf.set(h, lane);
      tip[lane] = h;
      for (const q of ps.slice(1)) if (tip[laneOf.get(q)] === q && laneOf.get(q) !== lane) free[laneOf.get(q)] = true;
    }
    const lanes = Math.max(1, tip.length);
    const n = order.length;
    const xOf = new Map(order.map((h, i) => [h, (i - (n - 1) / 2) * DX]));
    const cy = this.showObjects ? 7.4 : 3.2;
    const reach = repo.reachableCommits();
    const headHash = repo.headHash();

    const refsOf = (r, h, isRemoteRepo) => {
      const list = [];
      if (isRemoteRepo) {
        for (const [nm, x] of r.heads) if (x === h) list.push({ text: nm, style: 'branch' });
        return list;
      }
      if (!r.HEAD.ref && headHash === h) list.push({ text: 'HEAD', style: 'head' });
      for (const [nm, x] of r.heads) if (x === h && r.HEAD.ref === nm) list.push({ text: `HEAD → ${nm}`, style: 'head' });
      for (const [nm, x] of r.heads) if (x === h && r.HEAD.ref !== nm) list.push({ text: nm, style: 'branch' });
      for (const [nm, x] of r.remotes) if (x === h) list.push({ text: nm, style: 'remote' });
      for (const [nm, x] of r.tags) if (x === h) list.push({ text: `tag: ${nm}`, style: 'tag' });
      return list.reverse(); // 画的时候从上往下，HEAD 贴着提交
    };

    for (const h of order) {
      if (!repo.objects.has(h)) continue;
      const o = commits.get(h), key = 'c:' + h;
      const nd = this.node(key, 'commit', want, () => {
        const m = new THREE.Mesh(this.geo.commit, this.mat.commit);
        m.castShadow = true;
        return m;
      });
      const dangling = !reach.has(h);
      nd.obj.material = dangling ? this.mat.dangling : this.mat.commit;
      nd.r = 0.62;
      const parent = o.parents[0] && this.nodes.get('c:' + o.parents[0]);
      this.place(nd, xOf.get(h), cy + laneOf.get(h) * RISE, Z0 - laneOf.get(h) * LANE, parent && parent.obj.position);
      nd.info = { kind: 'object', hash: h };
      nd.tip = `commit ${s7(h)} · ${o.message}${dangling ? '（不可达，等待回收）' : ''}`;
      const refs = refsOf(repo, h, false);
      this.label(nd, 'refs', JSON.stringify(refs), () => (refs.length ? this.pills(refs) : null));
      this.label(nd, 'cap', h + dangling, () => this.caption(s7(h), dangling ? '不可达 · ' + o.message : o.message));
      for (const p of o.parents) if (repo.objects.has(p)) this.edge(key, 'c:' + p, wantE);
    }

    // 2) 远程仓库：在后方另起一排
    const rz = Z0 - lanes * LANE - 5;
    if (repo.remote) {
      const R = repo.remote;
      for (const h of order) {
        if (!R.objects.has(h)) continue;
        const o = commits.get(h), key = 'rc:' + h;
        const nd = this.node(key, 'rcommit', want, () => {
          const m = new THREE.Mesh(this.geo.commit, this.mat.remoteCommit);
          m.castShadow = true;
          return m;
        });
        nd.base = 0.8;
        nd.r = 0.5;
        const twin = this.nodes.get('c:' + h);
        this.place(nd, xOf.get(h), cy + laneOf.get(h) * RISE, rz - laneOf.get(h) * LANE, twin && twin.obj.position);
        nd.info = { kind: 'object', hash: h, remote: true };
        nd.tip = `远程上的 commit ${s7(h)} · ${o.message}`;
        const refs = refsOf(R, h, true);
        this.label(nd, 'refs', JSON.stringify(refs), () => (refs.length ? this.pills(refs) : null));
        this.label(nd, 'cap', h, () => this.caption(s7(h), o.message, -0.86));
        for (const p of o.parents) if (R.objects.has(p)) this.edge(key, 'rc:' + p, wantE);
      }
    }
    const xmin = n ? xOf.get(order[0]) : 0, xmax = n ? xOf.get(order[n - 1]) : 0;
    this.remotePlate.visible = !!repo.remote;
    if (repo.remote) {
      this.remotePlate.scale.set(Math.max(12, xmax - xmin + 7), 1, lanes * LANE + 3);
      this.remotePlate.position.set((xmin + xmax) / 2, cy - 1.5, rz - ((lanes - 1) * LANE) / 2);
    }
    this.floating.local.sprite.visible = n > 0 && [...commits.keys()].some((h) => repo.objects.has(h));
    this.floating.local.target.set(xmin - 1.5, cy, Z0);
    this.floating.remote.sprite.visible = !!repo.remote;
    this.floating.remote.target.set(Math.min(xmin - 1.5, -5), cy, rz);

    // 3) 对象层：tree 与 blob。同一个哈希只画一次，所以能直接看到"内容相同就共享"
    if (this.showObjects) {
      const placed = new Set();
      const blobSlots = new Map();
      const putBlob = (h, name, x, z0, from) => {
        const key = 'b:' + h;
        if (!placed.has(key)) {
          placed.add(key);
          const slot = blobSlots.get(x) || 0;
          blobSlots.set(x, slot + 1);
          const nd = this.node(key, 'blob', want, () => {
            const m = new THREE.Mesh(this.geo.blob, this.mat.blob);
            m.castShadow = true;
            return m;
          });
          nd.r = 0.5;
          this.place(nd, x + (slot % 2 ? 0.85 : -0.85), 0.9, z0 + 1.6 + Math.floor(slot / 2) * 1.7, from);
          nd.info = { kind: 'object', hash: h };
          nd.tip = `blob ${s7(h)}${name ? ' · ' + name : ''}`;
          this.label(nd, 'cap', h + name, () => this.caption(s7(h), name || '未被引用', -0.6));
        }
        return key;
      };
      const putTree = (h, name, x, z, depth, from) => {
        const key = 't:' + h;
        if (placed.has(key)) return key;
        placed.add(key);
        const nd = this.node(key, 'tree', want, () => {
          const m = new THREE.Mesh(this.geo.tree, this.mat.tree);
          m.castShadow = true;
          return m;
        });
        nd.r = 0.56;
        this.place(nd, x + depth * 1.1, 5.1 - depth * 1.75, z + depth * 0.6, from);
        nd.info = { kind: 'object', hash: h };
        nd.tip = `tree ${s7(h)} · ${name || '根目录'}`;
        this.label(nd, 'cap', h + name, () => this.caption(s7(h), name ? name + '/' : '根目录', -0.72));
        for (const e of repo.objects.get(h).entries) {
          const child = e.type === 'tree' ? putTree(e.hash, e.name, x, z, depth + 1, nd.obj.position) : putBlob(e.hash, e.name, x, z, nd.obj.position);
          this.edge(key, child, wantE, true);
        }
        return key;
      };
      for (const h of order) {
        if (!repo.objects.has(h)) continue;
        const cn = this.nodes.get('c:' + h);
        this.edge('c:' + h, putTree(commits.get(h).tree, '', xOf.get(h), Z0 - laneOf.get(h) * LANE, 0, cn.obj.position), wantE, true);
      }
      // 只被暂存区引用（还没提交）的 blob：git add 的那一刻对象就已经写进仓库了
      const names = new Map([...repo.index].map(([p, h]) => [h, p]));
      for (const [h, o] of repo.objects) if (o.type === 'blob' && !placed.has('b:' + h)) putBlob(h, names.get(h) ? names.get(h) + '（已暂存）' : '', xmax + (n ? DX : 0), Z0, null);
    }

    // 4) 三个区域里的文件卡片
    const headFiles = repo.filesOf(headHash);
    const cards = { work: [], index: [], head: [] };
    for (const path of [...new Set([...repo.workdir.keys(), ...repo.index.keys()])].sort()) {
      if (repo.workdir.has(path)) {
        const text = repo.workdir.get(path), hash = hashBlob(text);
        let st = '', tone = '';
        if (repo.conflicts.has(path)) [st, tone] = ['冲突', 'danger'];
        else if (!repo.index.has(path)) [st, tone] = ['未跟踪', 'text3'];
        else if (repo.index.get(path) !== hash) [st, tone] = ['已修改', 'warning'];
        cards.work.push({ path, hash, st, tone, text });
      } else cards.work.push({ path, hash: repo.index.get(path), st: '已删除', tone: 'danger', ghost: true });
    }
    for (const path of [...new Set([...repo.index.keys(), ...headFiles.keys()])].sort()) {
      if (repo.index.has(path)) {
        const hash = repo.index.get(path);
        let st = '', tone = '';
        if (repo.conflicts.has(path)) [st, tone] = ['未合并', 'danger'];
        else if (!headFiles.has(path)) [st, tone] = ['新增待提交', 'success'];
        else if (headFiles.get(path) !== hash) [st, tone] = ['修改待提交', 'success'];
        cards.index.push({ path, hash, st, tone });
      } else cards.index.push({ path, hash: headFiles.get(path), st: '删除待提交', tone: 'danger', ghost: true });
    }
    for (const [path, hash] of [...headFiles].sort()) cards.head.push({ path, hash, st: '', tone: '' });
    const spawnFrom = { work: 'index', index: 'work', head: 'index' };
    for (const z of ZONES) {
      cards[z.id].forEach((cd, i) => {
        const key = `f:${z.id}:${cd.path}`;
        const nd = this.node(key, 'card', want, (nn) => {
          nn.cardMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
          const s = this.mat.cardSide;
          const m = new THREE.Mesh(this.geo.card, [s, s, s, s, nn.cardMat, s]);
          m.rotation.x = -0.24;
          m.castShadow = true;
          return m;
        });
        const sig = `${cd.hash}|${cd.st}|${this.dark}`;
        if (nd.sigs.card !== sig) {
          nd.sigs.card = sig;
          if (nd.cardMat.map) nd.cardMat.map.dispose();
          nd.cardMat.map = this.cardTexture(cd.path, cd.hash, cd.st, cd.tone, cd.ghost);
          nd.cardMat.transparent = !!cd.ghost;
          nd.cardMat.opacity = cd.ghost ? 0.5 : 1;
          nd.cardMat.needsUpdate = true;
          if (!nd.fresh && !this.reduced) nd.s = 0.8; // 内容变了：轻轻弹一下
        }
        const col = i % 3, row = Math.floor(i / 3);
        const src = this.nodes.get(`f:${spawnFrom[z.id]}:${cd.path}`);
        const cx = z.x + (col - 1) * 2.05;
        this.place(nd, cx, 1.42 + row * 0.75, ZZ + 1.1 - row * 1.5,
          src && !src.fresh ? src.obj.position : new THREE.Vector3(cx, 5, ZZ));
        nd.r = 1.2;
        const where = { work: '工作区', index: '暂存区', head: 'HEAD 快照' }[z.id];
        nd.info = { kind: 'file', area: z.id, where, path: cd.path, hash: cd.hash, status: cd.st, text: cd.text };
        nd.tip = `${where} · ${cd.path}${cd.st ? '（' + cd.st + '）' : ''}`;
      });
    }

    for (const nd of this.nodes.values()) if (!want.has(nd.key)) nd.ts = 0;
    for (const [key, e] of this.edges) {
      if (wantE.has(key)) continue;
      this.scene.remove(e.group);
      this.edges.delete(key);
    }
    this.headKey = headHash ? 'c:' + headHash : null;
  }

  // ───────────── 交互 ─────────────
  bindPointer() {
    const dom = this.renderer.domElement;
    const ray = new THREE.Raycaster(), v = new THREE.Vector2();
    const pick = (e) => {
      const r = dom.getBoundingClientRect();
      v.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(v, this.camera);
      const hit = ray.intersectObjects(this.pickables, false)[0];
      return hit ? hit.object.userData.node : null;
    };
    let down = null;
    dom.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
    dom.addEventListener('pointermove', (e) => {
      if (e.buttons) return this.onHover(null);
      const n = pick(e);
      dom.style.cursor = n ? 'pointer' : 'grab';
      this.onHover(n ? { text: n.tip, x: e.clientX, y: e.clientY } : null);
    });
    dom.addEventListener('pointerleave', () => this.onHover(null));
    dom.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const n = pick(e);
      this.selectedKey = n ? n.key : null;
      this.onSelect(n ? n.info : null);
    });
  }

  selectHash(hash) {
    this.selectedKey = ['c:', 't:', 'b:', 'rc:'].map((p) => p + hash).find((k) => this.nodes.has(k)) || null;
  }

  flyTo(name) {
    const v = VIEWS[name] || VIEWS.overview;
    this.viewName = name;
    this.userMoved = false;
    this.fly = null;
    const aspect = this.camera.aspect || 1.6;
    const k = Math.max(1, 1.6 / aspect); // 画面窄时把镜头拉远
    const target = new THREE.Vector3(...v.target);
    const pos = new THREE.Vector3(...v.pos).sub(target).multiplyScalar(k).add(target);
    if (this.reduced) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      return;
    }
    this.fly = { t: 0, p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: target };
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // 用户还没自己动过镜头时，窗口变了就重新取景
    if (this.viewName && !this.userMoved) {
      const r = this.reduced;
      this.reduced = true;
      this.flyTo(this.viewName);
      this.reduced = r;
    }
  }

  frame(step) {
    const dt = step ?? Math.min(this.clock.getDelta(), 0.05);
    const k = this.reduced ? 1 : 1 - Math.exp(-dt * 7);
    if (this.fly) {
      const f = this.fly;
      f.t = Math.min(1, f.t + dt / 0.9);
      const e = 1 - Math.pow(1 - f.t, 4);
      this.camera.position.lerpVectors(f.p0, f.p1, e);
      this.controls.target.lerpVectors(f.t0, f.t1, e);
      if (f.t >= 1) this.fly = null;
    }
    this.controls.update();

    for (const n of [...this.nodes.values()]) {
      n.obj.position.lerp(n.target, k);
      n.s += (n.ts - n.s) * (this.reduced ? 1 : 1 - Math.exp(-dt * 9));
      n.obj.scale.setScalar(Math.max(0.001, n.s * n.base));
      if (n.ts === 0 && n.s < 0.03) this.dropNode(n);
    }
    for (const f of Object.values(this.floating)) f.sprite.position.lerp(f.target, k);

    const up = Stage.UP, v = Stage.V;
    for (const e of this.edges.values()) {
      const a = this.nodes.get(e.a), b = this.nodes.get(e.b);
      if (!a || !b) { e.group.visible = false; continue; }
      v.subVectors(b.obj.position, a.obj.position);
      const len = v.length();
      const ra = a.r * a.s * a.base, rb = b.r * b.s * b.base + 0.04;
      const L = len - ra - rb;
      if (L < e.head + 0.05) { e.group.visible = false; continue; }
      e.group.visible = true;
      v.multiplyScalar(1 / len);
      e.group.quaternion.setFromUnitVectors(up, v);
      e.group.position.copy(a.obj.position).addScaledVector(v, ra);
      e.shaft.scale.y = L - e.head;
      e.cone.position.y = L - e.head / 2;
    }

    const sel = this.selectedKey && this.nodes.get(this.selectedKey);
    this.ring.visible = !!sel;
    if (sel) {
      this.ring.position.copy(sel.obj.position);
      this.ring.quaternion.copy(this.camera.quaternion);
      this.ring.scale.setScalar(sel.kind === 'card' ? 1.65 : sel.base);
    }

    // HEAD 快照平台 → 当前提交 的虚线：这块平台展示的就是那个提交里的文件
    const hn = this.headKey && this.nodes.get(this.headKey);
    this.headLine.visible = !!hn;
    if (hn) {
      const pos = this.headLine.geometry.attributes.position;
      pos.setXYZ(0, ZONES[2].x, 0.3, ZZ - 2.3);
      pos.setXYZ(1, hn.obj.position.x, hn.obj.position.y, hn.obj.position.z);
      pos.needsUpdate = true;
      this.headLine.computeLineDistances();
    }
    this.renderer.render(this.scene, this.camera);
  }
}
Stage.UP = new THREE.Vector3(0, 1, 0);
Stage.V = new THREE.Vector3();
