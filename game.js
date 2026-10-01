/**
 * Spooky Run - 3Dハロウィン・ランナー (Temple Run風)
 * Three.jsによる3Dグラフィックス & Web Audio APIによるシンセ音響
 */

// --- ゲーム状態管理 ---
const state = {
  score: 0,
  distance: 0,
  candy: 0,
  isPlaying: false,
  difficulty: 'easy',
  highScores: {
    easy: 0,
    medium: 0,
    hard: 0
  },
  soundEnabled: true
};

const DIFFICULTY_SETTINGS = {
  easy: {
    startSpeed: 14,
    maxSpeed: 24,
    acceleration: 0.15,
    obstacleChance: 0.8, // 0.65 から 0.80 に増加
    doubleObstacleChance: 0.35 // 0.25 から 0.35 に増加
  },
  medium: {
    startSpeed: 18,
    maxSpeed: 30,
    acceleration: 0.25,
    obstacleChance: 0.6,
    doubleObstacleChance: 0.2
  },
  hard: {
    startSpeed: 22,
    maxSpeed: 38,
    acceleration: 0.4,
    obstacleChance: 0.8,
    doubleObstacleChance: 0.4
  }
};

// --- Web Audio API サウンド合成エンジン ---
let audioCtx = null;
let bgmInterval = null;
let bgmStep = 0;

function initAudio() {
  if (audioCtx) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContextClass();
}

function playTone({ frequency, type = 'sine', duration = 0.1, volume = 0.1, sweepTo = null, noise = false }) {
  if (!state.soundEnabled || !audioCtx) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const dest = audioCtx.destination;
  const now = audioCtx.currentTime;

  if (noise) {
    // ノイズ（打撃音や風きり音）の合成
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency, now);
    if (sweepTo) {
      filter.frequency.exponentialRampToValueAtTime(sweepTo, now + duration);
    }

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noiseNode.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noiseNode.start();
    noiseNode.stop(now + duration);
  } else {
    // 通常のシンセ音
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (sweepTo) {
      osc.frequency.exponentialRampToValueAtTime(sweepTo, now + duration);
    }

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    osc.stop(now + duration);
  }
}

// 効果音定義
const SE = {
  candy: () => {
    // キャンディ取得（キラキラ音）
    playTone({ frequency: 880, type: 'sine', duration: 0.1, volume: 0.08, sweepTo: 1400 });
    setTimeout(() => {
      playTone({ frequency: 1760, type: 'sine', duration: 0.15, volume: 0.06 });
    }, 40);
  },
  jump: () => {
    // ジャンプ（上昇するピッチ）
    playTone({ frequency: 220, type: 'triangle', duration: 0.2, volume: 0.15, sweepTo: 700 });
  },
  slide: () => {
    // スライディング（風きり音）
    playTone({ frequency: 600, type: 'sine', duration: 0.25, volume: 0.12, sweepTo: 100, noise: true });
  },
  trip: () => {
    // 障害物にかすった（打撃音＋死神の笑い声）
    playTone({ frequency: 150, type: 'sawtooth', duration: 0.3, volume: 0.3, sweepTo: 40, noise: true });
    // 死神の不気味な低音笑い
    setTimeout(() => {
      playTone({ frequency: 80, type: 'sawtooth', duration: 0.4, volume: 0.2, sweepTo: 40 });
      playTone({ frequency: 70, type: 'sawtooth', duration: 0.5, volume: 0.2, sweepTo: 30 });
    }, 100);
  },
  gameOver: () => {
    // ゲームオーバー（絶望的な下降和音）
    stopBgm();
    playTone({ frequency: 220, type: 'sawtooth', duration: 0.8, volume: 0.3, sweepTo: 40 });
    setTimeout(() => {
      playTone({ frequency: 165, type: 'sawtooth', duration: 0.8, volume: 0.3, sweepTo: 30 });
    }, 150);
    setTimeout(() => {
      playTone({ frequency: 110, type: 'sawtooth', duration: 1.2, volume: 0.4, sweepTo: 20 });
    }, 300);
  },
  clear: () => {
    // ゲームクリア（お祝いの明るいアルペジオ）
    stopBgm();
    if (!state.soundEnabled || !audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    playTone({ frequency: 523.25, type: 'sine', duration: 0.25, volume: 0.15 }); // C5
    setTimeout(() => playTone({ frequency: 659.25, type: 'sine', duration: 0.25, volume: 0.15 }), 80); // E5
    setTimeout(() => playTone({ frequency: 783.99, type: 'sine', duration: 0.25, volume: 0.15 }), 160); // G5
    setTimeout(() => playTone({ frequency: 1046.50, type: 'sine', duration: 0.6, volume: 0.2 }), 240); // C6
  }
};

// インタラクティブBGM演奏ループ
function startBgm() {
  if (bgmInterval) clearInterval(bgmInterval);
  bgmStep = 0;
  
  bgmInterval = setInterval(() => {
    if (!state.isPlaying || !state.soundEnabled || !audioCtx) return;

    const step = bgmStep % 16;
    const isHeavy = state.speed > 25; // 速度が上がるとテンポ感・低音を強化

    // ドラムパターン
    if (step === 0 || step === 8) {
      // バスドラム (キック)
      playTone({ frequency: 100, type: 'sine', duration: 0.15, volume: 0.15, sweepTo: 20 });
    }
    if (step === 4 || step === 12) {
      // スネア (ノイズ)
      playTone({ frequency: 500, type: 'triangle', duration: 0.08, volume: 0.06, noise: true });
    }
    if (step % 2 === 1) {
      // ハイハット
      playTone({ frequency: 6000, type: 'sine', duration: 0.02, volume: 0.02, noise: true });
    }

    // ハロウィン風ハーモニックマイナー音階 (C3, D3, Eb3, F#3, G3, Ab3, B3)
    const scale = [130.81, 146.83, 155.56, 185.00, 196.00, 207.65, 246.94];
    // ベースラインシーケンス
    const bassSeq = [0, 2, 4, 3, 4, 2, 0, 4, 1, 2, 5, 6, 5, 2, 1, 4];
    const baseFreq = scale[bassSeq[step]];
    
    // ベース音
    playTone({ frequency: baseFreq, type: 'sawtooth', duration: 0.12, volume: 0.05 });

    // スプーキーなアルペジオメロディ（たまに鳴らす）
    if (step === 2 || step === 6 || step === 10 || step === 14) {
      const highScale = [523.25, 587.33, 622.25, 739.99, 783.99, 830.61, 987.77]; // C5
      const note = highScale[Math.floor(Math.random() * highScale.length)];
      playTone({ frequency: note, type: 'sine', duration: 0.3, volume: 0.02, sweepTo: note * 0.8 });
    }

    bgmStep++;
  }, 160); // 速度にかかわらず一定のBGM（必要ならテンポ可変可能）
}

function stopBgm() {
  if (bgmInterval) {
    clearInterval(bgmInterval);
    bgmInterval = null;
  }
}


// --- 3Dプロシージャルテクスチャ生成 ---

// カボチャ顔のキャンバステクスチャ
function createPumpkinTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  
  // ベースのオレンジ
  ctx.fillStyle = '#ff6a00';
  ctx.fillRect(0, 0, 256, 256);
  
  // 縦の凹凸模様
  ctx.strokeStyle = '#c2410c';
  ctx.lineWidth = 10;
  for (let i = 32; i < 256; i += 64) {
    ctx.beginPath();
    ctx.ellipse(i, 128, 20, 128, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // くり抜かれた発光顔 (黄〜金)
  ctx.fillStyle = '#ffea00';
  ctx.shadowColor = '#ffea00';
  ctx.shadowBlur = 12;
  
  // 三角の目
  ctx.beginPath();
  ctx.moveTo(60, 95); ctx.lineTo(100, 95); ctx.lineTo(80, 65); ctx.closePath();
  ctx.moveTo(196, 95); ctx.lineTo(156, 95); ctx.lineTo(176, 65); ctx.closePath();
  ctx.fill();

  // 三角の鼻
  ctx.beginPath();
  ctx.moveTo(128, 110); ctx.lineTo(118, 130); ctx.lineTo(138, 130); ctx.closePath();
  ctx.fill();

  // ギザギザの口
  ctx.beginPath();
  ctx.moveTo(50, 150);
  ctx.lineTo(80, 170); ctx.lineTo(95, 155); ctx.lineTo(110, 170);
  ctx.lineTo(128, 150);
  ctx.lineTo(146, 170); ctx.lineTo(161, 155); ctx.lineTo(176, 170);
  ctx.lineTo(206, 150);
  ctx.lineTo(185, 190); ctx.lineTo(165, 175); ctx.lineTo(145, 195);
  ctx.lineTo(128, 180);
  ctx.lineTo(111, 195); ctx.lineTo(91, 175); ctx.lineTo(71, 190);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

// 墓石テクスチャ
function createTombstoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  // 石のベースカラー
  ctx.fillStyle = '#4a4850';
  ctx.fillRect(0, 0, 128, 128);
  
  // ひび割れ
  ctx.strokeStyle = '#232226';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(10, 20); ctx.lineTo(35, 45); ctx.lineTo(25, 70);
  ctx.moveTo(110, 30); ctx.lineTo(90, 50); ctx.lineTo(105, 90);
  ctx.stroke();

  // 「RIP」文字
  ctx.fillStyle = '#18171a';
  ctx.font = 'bold 36px Times New Roman';
  ctx.textAlign = 'center';
  ctx.fillText('RIP', 64, 75);

  return new THREE.CanvasTexture(canvas);
}

// クモの巣テクスチャ
function createCobwebTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  
  ctx.strokeStyle = 'rgba(230, 220, 255, 0.75)';
  ctx.lineWidth = 2.5;
  
  const cx = 128, cy = 128;
  // 放射状の線
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * 128, cy + Math.sin(a) * 128);
    ctx.stroke();
  }
  // 同心円の巣
  for (let r = 20; r <= 120; r += 22) {
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const a = (i * Math.PI) / 6;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  
  return new THREE.CanvasTexture(canvas);
}

// キャンディコーングラデーションテクスチャ
function createCandyCornTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  // 上から白(チップ)、真ん中オレンジ、下黄色のボーダー
  ctx.fillStyle = '#ffffff'; // 白
  ctx.fillRect(0, 0, 64, 40);
  ctx.fillStyle = '#ff6a00'; // オレンジ
  ctx.fillRect(0, 40, 64, 50);
  ctx.fillStyle = '#ffd700'; // 黄色
  ctx.fillRect(0, 90, 64, 38);

  return new THREE.CanvasTexture(canvas);
}


// ペロペロキャンディの渦巻きテクスチャ
function createLollipopTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#7c3aed';
  ctx.fillRect(0, 0, 128, 128);
  
  ctx.strokeStyle = '#39ff14';
  ctx.lineWidth = 10;
  ctx.beginPath();
  const cx = 64, cy = 64;
  for (let i = 0; i < 60; i++) {
    const angle = 0.22 * i;
    const r = 2 + 1.0 * i;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}


// --- 3Dオブジェクト生成ヘルパー ---

const textures = {};

function initTextures() {
  textures.pumpkin = createPumpkinTexture();
  textures.tombstone = createTombstoneTexture();
  textures.cobweb = createCobwebTexture();
  textures.candyCorn = createCandyCornTexture();
  textures.lollipop = createLollipopTexture(); // 渦巻きキャンディ用
}

// プレイヤー (ジャック・オー・ランタン魔導士)
function createPlayerModel() {
  const group = new THREE.Group();

  // カボチャ頭
  const headGeo = new THREE.SphereGeometry(0.7, 16, 16);
  const headMat = new THREE.MeshStandardMaterial({
    map: textures.pumpkin,
    roughness: 0.5,
    metalness: 0.1
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.castShadow = true;
  head.position.y = 1.0;
  // 前方（Zのマイナス方向）に向けてカボチャの顔が来るようにY軸回転
  head.rotation.y = Math.PI; 
  group.add(head);

  // 目がぼんやり光るポイントライト
  const glowLight = new THREE.PointLight(0xff7700, 2.5, 6);
  glowLight.position.set(0, 1.0, -0.6);
  group.add(glowLight);

  // 魔女の帽子
  const hatGroup = new THREE.Group();
  
  // 帽子のつば
  const brimGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.04, 16);
  const hatMat = new THREE.MeshStandardMaterial({ color: 0x120a1f, roughness: 0.8 });
  const brim = new THREE.Mesh(brimGeo, hatMat);
  brim.position.y = 1.5;
  hatGroup.add(brim);

  // 帽子のとんがり
  const coneGeo = new THREE.ConeGeometry(0.5, 1.2, 16);
  const cone = new THREE.Mesh(coneGeo, hatMat);
  cone.position.set(0, 2.1, -0.1);
  cone.rotation.x = -0.15; // 少し後ろに傾ける
  hatGroup.add(cone);

  // 帽子のオレンジリボン
  const ribbonGeo = new THREE.CylinderGeometry(0.51, 0.51, 0.1, 16);
  const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xff6a00 });
  const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbon.position.y = 1.58;
  hatGroup.add(ribbon);

  hatGroup.position.y = 0.05; // 微調整
  group.add(hatGroup);

  // 浮遊する紫のローブ/ケープ
  const capeGeo = new THREE.ConeGeometry(0.7, 1.2, 16, 1, true); // オープンコーン
  const capeMat = new THREE.MeshStandardMaterial({
    color: 0x4f0e87,
    roughness: 0.6,
    side: THREE.DoubleSide
  });
  const cape = new THREE.Mesh(capeGeo, capeMat);
  cape.position.y = 0.25;
  cape.rotation.x = 0.1; // 走っているときのようになびかせる
  group.add(cape);

  return group;
}

// 死神 (背後から追う影)
function createReaperModel() {
  const group = new THREE.Group();

  // フード付きの黒ローブ
  const bodyGeo = new THREE.ConeGeometry(1.0, 2.6, 16, 1, true);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x05040a, roughness: 0.9, side: THREE.DoubleSide });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1.0;
  group.add(body);

  // フードの頭部
  const headGeo = new THREE.SphereGeometry(0.6, 16, 16);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.y = 2.0;
  group.add(head);

  // 赤く光る邪悪な目
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), eyeMat);
  eyeL.position.set(-0.2, 2.0, -0.45);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.2;
  group.add(eyeL);
  group.add(eyeR);

  // 赤い目のライト
  const eyeLight = new THREE.PointLight(0xff0000, 3.0, 8);
  eyeLight.position.set(0, 2.0, -0.6);
  group.add(eyeLight);

  // 死神の大鎌 (Scythe)
  const scytheGroup = new THREE.Group();
  
  // 柄 (長い木の棒)
  const shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 3.2, 8);
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x2b1c0b, roughness: 0.9 });
  const shaft = new THREE.Mesh(shaftGeo, woodMat);
  shaft.position.y = 1.6;
  shaft.rotation.z = -0.3;
  scytheGroup.add(shaft);

  // 巨大な刃
  const bladeGeo = new THREE.BoxGeometry(1.4, 0.15, 0.03);
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x80808a, roughness: 0.3, metalness: 0.8 });
  const blade = new THREE.Mesh(bladeGeo, metalMat);
  blade.position.set(0.6, 3.1, 0);
  blade.rotation.z = 0.4;
  scytheGroup.add(blade);

  scytheGroup.position.set(-0.8, -0.3, -0.2);
  group.add(scytheGroup);

  return group;
}

// 墓石障害物
function createTombstoneModel() {
  const group = new THREE.Group();
  
  // 墓石本体
  const stoneGeo = new THREE.BoxGeometry(2.0, 2.2, 0.4);
  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.tombstone,
    roughness: 0.8
  });
  const stone = new THREE.Mesh(stoneGeo, stoneMat);
  stone.castShadow = true;
  stone.receiveShadow = true;
  stone.position.y = 1.1; // 地面にのせる
  group.add(stone);

  return group;
}

// クモの巣障害物
function createCobwebModel() {
  // 浮遊する障害物。ダブルサイドの平面にクモの巣を描画
  const geo = new THREE.PlaneGeometry(3.6, 2.6);
  const mat = new THREE.MeshBasicMaterial({
    map: textures.cobweb,
    transparent: true,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 3.3; // 下部が y=2.0 付近になるのでスライドでくぐれる
  return mesh;
}

// 魔女の釜障害物 (大釜)
function createCauldronModel() {
  const group = new THREE.Group();

  // 釜の外殻 (黒い球体を上部だけ削る)
  const potGeo = new THREE.SphereGeometry(1.3, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.7);
  const potMat = new THREE.MeshStandardMaterial({ color: 0x1d1d24, roughness: 0.6, metalness: 0.5 });
  const pot = new THREE.Mesh(potGeo, potMat);
  pot.castShadow = true;
  pot.position.y = 0.8;
  pot.rotation.x = Math.PI; // 上が開くように回転
  group.add(pot);

  // 釜のフチ
  const rimGeo = new THREE.TorusGeometry(1.1, 0.1, 8, 24);
  const rim = new THREE.Mesh(rimGeo, potMat);
  rim.position.y = 0.8;
  rim.rotation.x = Math.PI/2;
  group.add(rim);

  // ドロドロの緑の魔法薬 (円盤)
  const potionGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.05, 16);
  const potionMat = new THREE.MeshStandardMaterial({
    color: 0x39ff14,
    emissive: 0x1a8c08,
    roughness: 0.3
  });
  const potion = new THREE.Mesh(potionGeo, potionMat);
  potion.position.y = 0.75;
  group.add(potion);

  // 魔法薬の光るライト
  const glow = new THREE.PointLight(0x39ff14, 2.0, 5);
  glow.position.set(0, 1.2, 0);
  group.add(glow);

  // 泡のエフェクト (小さな緑の球)
  for (let i = 0; i < 5; i++) {
    const bubbleGeo = new THREE.SphereGeometry(0.1 + Math.random()*0.1, 8, 8);
    const bubble = new THREE.Mesh(bubbleGeo, potionMat);
    bubble.position.set(
      (Math.random() - 0.5) * 1.2,
      0.8 + Math.random() * 0.3,
      (Math.random() - 0.5) * 1.2
    );
    group.add(bubble);
  }

  return group;
}

// ゾンビ障害物
function createZombieModel() {
  const group = new THREE.Group();

  // 肌の緑色
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x4f7942, roughness: 0.8 });
  // 服の青色
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.7 });
  // ズボンの黒色
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.9 });

  // 頭部
  const headGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.6;
  head.castShadow = true;
  group.add(head);

  // 赤く光る目
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
  eyeL.position.set(-0.16, 1.66, -0.29);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.16;
  group.add(eyeL);
  group.add(eyeR);

  // 体 (Tシャツ)
  const torsoGeo = new THREE.BoxGeometry(0.7, 0.8, 0.4);
  const torso = new THREE.Mesh(torsoGeo, shirtMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  // 腕 (前方に這い寄るように伸ばす)
  const armGeo = new THREE.BoxGeometry(0.16, 0.16, 0.65);
  
  const armL = new THREE.Mesh(armGeo, skinMat);
  armL.position.set(-0.43, 1.25, -0.32);
  armL.castShadow = true;
  group.add(armL);
  
  const armR = new THREE.Mesh(armGeo, skinMat);
  armR.position.set(0.43, 1.25, -0.32);
  armR.castShadow = true;
  group.add(armR);

  // 脚
  const legGeo = new THREE.BoxGeometry(0.24, 0.65, 0.3);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.18, 0.33, 0);
  legL.castShadow = true;
  group.add(legL);

  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.18, 0.33, 0);
  legR.castShadow = true;
  group.add(legR);

  // 走ってくるプレイヤーと対面させるために180度回転
  group.rotation.y = Math.PI;

  return group;
}

// キャンディコーンコイン (各種ハロウィンお菓子をランダムに生成)
function createCandyCornModel() {
  const group = new THREE.Group();
  const rand = Math.random();
  
  if (rand < 0.35) {
    // 1. キャンディコーン (円錐)
    const geo = new THREE.ConeGeometry(0.38, 0.8, 12);
    const mat = new THREE.MeshStandardMaterial({
      map: textures.candyCorn,
      roughness: 0.4,
      metalness: 0.1
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.position.y = 0.8;
    group.add(mesh);
  } else if (rand < 0.70) {
    // 2. カボチャキャンディ (オレンジの球体)
    const geo = new THREE.SphereGeometry(0.32, 12, 12);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.5 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.position.y = 0.8;
    group.add(mesh);
    
    // ヘタ (緑)
    const stemGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.15, 8);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4f7942 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(0, 1.05, 0);
    group.add(stem);
  } else {
    // 3. 渦巻きペロペロキャンディ
    const stickGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8);
    const stickMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const stick = new THREE.Mesh(stickGeo, stickMat);
    stick.position.y = 0.55;
    stick.castShadow = true;
    group.add(stick);
    
    const headGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.08, 16);
    const headMat = new THREE.MeshStandardMaterial({ map: textures.lollipop, roughness: 0.4 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.88;
    head.rotation.x = Math.PI / 2;
    head.castShadow = true;
    group.add(head);
  }
  
  return group;
}

// 這うゾンビ障害物
function createZombieCrawlModel() {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x4f7942, roughness: 0.8 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.7 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.9 });

  const baseGroup = new THREE.Group();

  const headGeo = new THREE.BoxGeometry(0.48, 0.48, 0.48);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.set(0, 0.25, -0.6);
  head.castShadow = true;
  baseGroup.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
  eyeL.position.set(-0.14, 0.3, -0.85);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.14;
  baseGroup.add(eyeL);
  baseGroup.add(eyeR);

  const torsoGeo = new THREE.BoxGeometry(0.6, 0.3, 0.8);
  const torso = new THREE.Mesh(torsoGeo, shirtMat);
  torso.position.set(0, 0.15, 0);
  torso.castShadow = true;
  baseGroup.add(torso);

  const armGeo = new THREE.BoxGeometry(0.14, 0.14, 0.55);
  const armL = new THREE.Mesh(armGeo, skinMat);
  armL.position.set(-0.38, 0.12, -0.4);
  armL.rotation.y = 0.2;
  armL.castShadow = true;
  baseGroup.add(armL);

  const armR = new THREE.Mesh(armGeo, skinMat);
  armR.position.set(0.38, 0.12, -0.4);
  armR.rotation.y = -0.2;
  armR.castShadow = true;
  baseGroup.add(armR);

  const legGeo = new THREE.BoxGeometry(0.2, 0.15, 0.6);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.15, 0.1, 0.6);
  legL.rotation.y = -0.3;
  legL.castShadow = true;
  baseGroup.add(legL);

  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.15, 0.1, 0.6);
  legR.rotation.y = 0.3;
  legR.castShadow = true;
  baseGroup.add(legR);

  group.add(baseGroup);
  group.rotation.y = Math.PI;

  return group;
}

// 首吊りゾンビ障害物
function createZombieHangModel() {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x2b1c0b, roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x4f7942, roughness: 0.8 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.7 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 });

  const postGeo = new THREE.BoxGeometry(0.2, 4.5, 0.2);
  const post = new THREE.Mesh(postGeo, woodMat);
  post.position.set(-1.8, 2.25, 0);
  post.castShadow = true;
  group.add(post);

  const beamGeo = new THREE.BoxGeometry(2.0, 0.2, 0.2);
  const beam = new THREE.Mesh(beamGeo, woodMat);
  beam.position.set(-0.9, 4.4, 0);
  beam.castShadow = true;
  group.add(beam);

  const ropeGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8);
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8f7a66, roughness: 0.9 });
  const rope = new THREE.Mesh(ropeGeo, ropeMat);
  rope.position.set(0, 3.8, 0);
  group.add(rope);

  const zombieGroup = new THREE.Group();
  zombieGroup.position.set(0, 3.4, 0);

  const headGeo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = -0.22;
  head.castShadow = true;
  zombieGroup.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
  eyeL.position.set(-0.13, -0.25, -0.23);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.13;
  zombieGroup.add(eyeL);
  zombieGroup.add(eyeR);

  const torsoGeo = new THREE.BoxGeometry(0.55, 0.8, 0.35);
  const torso = new THREE.Mesh(torsoGeo, shirtMat);
  torso.position.y = -0.8;
  torso.castShadow = true;
  zombieGroup.add(torso);

  const armGeo = new THREE.BoxGeometry(0.12, 0.65, 0.12);
  const armL = new THREE.Mesh(armGeo, skinMat);
  armL.position.set(-0.35, -0.9, 0);
  armL.rotation.z = 0.08;
  armL.castShadow = true;
  zombieGroup.add(armL);
  
  const armR = new THREE.Mesh(armGeo, skinMat);
  armR.position.set(0.35, -0.9, 0);
  armR.rotation.z = -0.08;
  armR.castShadow = true;
  zombieGroup.add(armR);

  const legGeo = new THREE.BoxGeometry(0.18, 0.7, 0.22);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.12, -1.6, 0);
  legL.castShadow = true;
  zombieGroup.add(legL);

  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.12, -1.6, 0);
  legR.castShadow = true;
  zombieGroup.add(legR);

  zombieGroup.rotation.y = Math.PI;
  group.add(zombieGroup);
  
  group.userData = { swingMesh: zombieGroup };

  return group;
}

// 装飾用：不気味な枯れ木 (道端の飾り)
function createDeadTreeModel() {
  const group = new THREE.Group();

  const trunkHeight = 5 + Math.random() * 3;
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.5, trunkHeight, 8);
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x1a0f05, roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeo, woodMat);
  trunk.position.y = trunkHeight / 2;
  trunk.castShadow = true;
  group.add(trunk);

  // 枝をランダムに配置
  const branchCount = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < branchCount; i++) {
    const length = 2 + Math.random() * 2;
    const branchGeo = new THREE.CylinderGeometry(0.08, 0.2, length, 6);
    const branch = new THREE.Mesh(branchGeo, woodMat);
    
    const h = (trunkHeight * 0.4) + Math.random() * (trunkHeight * 0.5);
    branch.position.set(0, h, 0);
    
    // ランダムな向きと傾き
    branch.rotation.z = (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 0.7);
    branch.rotation.y = Math.random() * Math.PI * 2;
    
    branch.castShadow = true;
    group.add(branch);
  }

  return group;
}


// --- メインゲームクラス ---

class SpookyRunGame {
  constructor() {
    this.container = document.getElementById('game-canvas-container');
    
    // Three.js コア設定
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();
    
    // ゲームオブジェクト
    this.player = null;
    this.reaper = null;
    this.emberParticles = null;
    
    // 道と配置アセットの管理
    this.roadSegments = [];
    this.segmentLength = 40;
    this.visibleSegments = 6;
    
    // 衝突判定対象オブジェクト
    this.obstacles = []; // { mesh, type, boundingBox, collisionActive: true }
    this.candies = [];    // { mesh, boundingBox, active: true }
    
    // キャラ移動用の変数
    this.currentLane = 1; // 0:左, 1:中, 2:右
    this.laneX = [-3.5, 0, 3.5]; // 各レーンのX座標
    this.playerTargetX = 0;
    this.playerX = 0;
    this.playerY = 0;
    this.jumpVelocity = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.invincibilityTimer = 0;
    this.threatLevel = 0; // 0(安全) 〜 1(アウト)

    // 設定
    this.gravity = 35;
    this.jumpPower = 12.5;
    
    // スピード系
    this.speed = 16;
    this.runDistance = 0;
    this.timeElapsed = 0;
    
    // タッチ（スワイプ）操作
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.swipeThreshold = 35; // スワイプと判定する最小ピクセル数
    
    // 起動
    this.initThree();
    this.setupInputs();
    this.loadHighScores();
    
    // アニメーションループ開始
    this.animate();
  }

  // Three.jsシーンの初期化
  initThree() {
    this.scene = new THREE.Scene();
    
    // 霧効果 (深い紫の不気味なフォグ)
    this.scene.fog = new THREE.FogExp2(0x090412, 0.018);
    this.scene.background = new THREE.Color(0x090412);
    
    // カメラ設定
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 4.5, 8); // 背後上方から見下ろす
    
    // レンダラー設定
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);
    
    // テクスチャの初期化
    initTextures();
    
    // 環境光 (妖艶な紫の底光り)
    const ambientLight = new THREE.AmbientLight(0x2d1a4d, 0.8);
    this.scene.add(ambientLight);
    
    // 平行光源 (月明かり)
    this.moonLight = new THREE.DirectionalLight(0x75b6ff, 1.2);
    this.moonLight.position.set(-10, 25, 10);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.width = 1024;
    this.moonLight.shadow.mapSize.height = 1024;
    this.moonLight.shadow.camera.near = 0.5;
    this.moonLight.shadow.camera.far = 80;
    const d = 15;
    this.moonLight.shadow.camera.left = -d;
    this.moonLight.shadow.camera.right = d;
    this.moonLight.shadow.camera.top = d;
    this.moonLight.shadow.camera.bottom = -d;
    this.scene.add(this.moonLight);
    
    // 背景の遠景に巨大な月を配置
    const moonGeo = new THREE.SphereGeometry(12, 16, 16);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xfffde0, fog: false });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.position.set(-30, 40, -180);
    this.scene.add(moon);
    
    // プレイヤーの生成
    this.player = createPlayerModel();
    this.scene.add(this.player);
    
    // 死神の生成
    this.reaper = createReaperModel();
    this.scene.add(this.reaper);
    
    // パーティクル（漂う火の粉/胞子）の生成
    this.createEmberParticles();
    
    // 初期の道構築
    this.buildInitialRoad();
    
    // リサイズ監視
    window.addEventListener('resize', () => this.onResize());
  }

  // 漂うオレンジ火の粉パーティクル
  createEmberParticles() {
    const count = 180;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const speeds = [];
    
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;      // X
      positions[i * 3 + 1] = Math.random() * 8;            // Y
      positions[i * 3 + 2] = -Math.random() * 120;         // Z
      speeds.push({
        x: (Math.random() - 0.5) * 0.5,
        y: (Math.random() - 0.3) * 0.8,
        z: 2 + Math.random() * 4
      });
    }
    
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const mat = new THREE.PointsMaterial({
      color: 0xff7700,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    this.emberParticles = new THREE.Points(geo, mat);
    this.emberParticles.userData = { speeds: speeds };
    this.scene.add(this.emberParticles);
  }

  updateEmberParticles(dt, playerZ) {
    const pos = this.emberParticles.geometry.attributes.position.array;
    const speeds = this.emberParticles.userData.speeds;
    const count = pos.length / 3;
    
    for (let i = 0; i < count; i++) {
      pos[i * 3] += speeds[i].x * dt;
      pos[i * 3 + 1] += speeds[i].y * dt;
      pos[i * 3 + 2] += speeds[i].z * dt;
      
      // プレイヤーの後ろに通り過ぎたか、地面の下になったら前方遠くへリセット
      if (pos[i * 3 + 2] > playerZ + 10 || pos[i * 3 + 1] < -1) {
        pos[i * 3] = (Math.random() - 0.5) * 20;
        pos[i * 3 + 1] = Math.random() * 10;
        pos[i * 3 + 2] = playerZ - 100 - Math.random() * 30;
      }
    }
    
    this.emberParticles.geometry.attributes.position.needsUpdate = true;
  }

  // 初期ロード・メニュー待機時の道作成
  buildInitialRoad() {
    for (let i = 0; i < this.visibleSegments; i++) {
      const zPos = -i * this.segmentLength;
      // 最初の2個は安全な道（障害物なし）
      const spawnAssets = i >= 2;
      this.spawnRoadSegment(zPos, spawnAssets);
    }
  }

  // 1区画の道の生成
  spawnRoadSegment(zPos, spawnAssets) {
    const group = new THREE.Group();
    group.position.z = zPos;

    // 地面（暗い石の道）
    const groundGeo = new THREE.BoxGeometry(11, 0.4, this.segmentLength);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x130e20,
      roughness: 0.95
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    ground.position.y = -0.2; // 上端がy=0になるように配置
    group.add(ground);

    // 左右の土手/芝
    const sideLeftGeo = new THREE.BoxGeometry(10, 0.8, this.segmentLength);
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x07040d, roughness: 0.98 });
    
    const sideLeft = new THREE.Mesh(sideLeftGeo, sideMat);
    sideLeft.position.set(-10, -0.2, 0);
    sideLeft.receiveShadow = true;
    group.add(sideLeft);

    const sideRight = sideLeft.clone();
    sideRight.position.x = 10;
    group.add(sideRight);

    // レーン仕切り線 (ネオンパープルに発光する細い線)
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xaf40ff,
      emissive: 0x4f1287,
      roughness: 0.5
    });
    
    const lineL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, this.segmentLength), lineMat);
    lineL.position.set(-1.75, 0.03, 0);
    group.add(lineL);

    const lineR = lineL.clone();
    lineR.position.x = 1.75;
    group.add(lineR);

    // 道の左右に装飾アセット（枯れ木、墓石、フェンス）を置く
    if (spawnAssets) {
      this.spawnScenery(group);
      
      // ゲームプレイ中のみ、ランダムで道に障害物とキャンディを配置
      if (state.isPlaying) {
        this.spawnObstaclesAndCandy(group, zPos);
      }
    }

    this.scene.add(group);
    this.roadSegments.push({
      group: group,
      zPos: zPos
    });
  }

  // 左右の飾り付け
  spawnScenery(segmentGroup) {
    const leftSceneryX = -7.5;
    const rightSceneryX = 7.5;
    
    // 左右に何点かランダム配置
    for (let z = -15; z <= 15; z += 15) {
      // 左側
      if (Math.random() < 0.5) {
        const tree = createDeadTreeModel();
        tree.position.set(leftSceneryX - Math.random() * 2, 0, z);
        // ランダム回転
        tree.rotation.y = Math.random() * Math.PI * 2;
        segmentGroup.add(tree);
      } else if (Math.random() < 0.6) {
        const tomb = createTombstoneModel();
        tomb.position.set(leftSceneryX - 0.5 - Math.random() * 1.5, 0, z);
        tomb.rotation.y = (Math.random() - 0.5) * 0.4;
        segmentGroup.add(tomb);
      }
      
      // 右側
      if (Math.random() < 0.5) {
        const tree = createDeadTreeModel();
        tree.position.set(rightSceneryX + Math.random() * 2, 0, z);
        tree.rotation.y = Math.random() * Math.PI * 2;
        segmentGroup.add(tree);
      } else if (Math.random() < 0.6) {
        const tomb = createTombstoneModel();
        tomb.position.set(rightSceneryX + 0.5 + Math.random() * 1.5, 0, z);
        tomb.rotation.y = (Math.random() - 0.5) * 0.4;
        segmentGroup.add(tomb);
      }
    }
  }

  // 障害物とキャンディの生成
  spawnObstaclesAndCandy(segmentGroup, segmentZ) {
    const diff = DIFFICULTY_SETTINGS[state.difficulty];
    
    // 1つの道路区画に障害物を出現させるか決定
    if (Math.random() < diff.obstacleChance) {
      // 障害物のレイアウト決定
      const doubleObs = Math.random() < diff.doubleObstacleChance;
      
      // 0:左, 1:中, 2:右
      const lanes = [0, 1, 2];
      // シャッフル
      lanes.sort(() => Math.random() - 0.5);
      
      const primaryLane = lanes[0];
      const secondaryLane = lanes[1];
      
      // タイプ決定: 全部ゾンビ！ ('zombie_stand'=立型, 'zombie_crawl'=這型, 'zombie_hang'=吊型)
      const types = ['zombie_stand', 'zombie_crawl', 'zombie_hang'];
      const pType = types[Math.floor(Math.random() * types.length)];
      
      // 1つ目の障害物
      this.createObstacle(segmentGroup, primaryLane, pType, segmentZ);
      
      // 確率で2つ目の障害物を配置（ダブルブロック。必ず1レーンは開けて逃げ道を確保する）
      if (doubleObs) {
        const sType = types[Math.floor(Math.random() * types.length)];
        // わずかにZをずらして配置することもある（難易度アップ）
        const offsetZ = Math.random() > 0.5 ? -4 : 0;
        this.createObstacle(segmentGroup, secondaryLane, sType, segmentZ, offsetZ);
      }
      
      // 障害物がないレーンにキャンディをスポーン
      const freeLane = doubleObs ? lanes[2] : secondaryLane;
      if (Math.random() < 0.6) {
        this.createCandyLine(segmentGroup, freeLane, segmentZ);
      }
    } else {
      // 障害物がない場合、レーンを選んで長めのキャンディラインを引く
      if (Math.random() < 0.7) {
        const targetLane = Math.floor(Math.random() * 3);
        this.createCandyLine(segmentGroup, targetLane, segmentZ);
      }
    }
  }

  // 個別障害物の生成
  createObstacle(segmentGroup, lane, type, segmentZ, offsetZ = 0) {
    let mesh;
    if (type === 'zombie_stand') {
      mesh = createZombieModel();
    } else if (type === 'zombie_crawl') {
      mesh = createZombieCrawlModel();
    } else if (type === 'zombie_hang') {
      mesh = createZombieHangModel();
    }
    
    // 位置決定
    const xPos = this.laneX[lane];
    const zPos = offsetZ; // 区画内のローカルZ (中心0)
    mesh.position.x = xPos;
    mesh.position.z = zPos;
    
    segmentGroup.add(mesh);
    
    // コリジョン用データ登録
    this.obstacles.push({
      mesh: mesh,
      type: type,
      lane: lane,
      // ワールドZは後で判定時に算出（segmentZ + zPos）
      worldZ: segmentZ + zPos,
      collisionActive: true
    });
  }

  // キャンディをライン状にスポーン
  createCandyLine(segmentGroup, lane, segmentZ) {
    const count = 3 + Math.floor(Math.random() * 3);
    const spacing = 4.5;
    const startZ = -spacing * (count - 1) / 2;
    const xPos = this.laneX[lane];
    
    for (let i = 0; i < count; i++) {
      const mesh = createCandyCornModel();
      const zOffset = startZ + i * spacing;
      mesh.position.set(xPos, 0.4, zOffset);
      segmentGroup.add(mesh);
      
      this.candies.push({
        mesh: mesh,
        lane: lane,
        worldZ: segmentZ + zOffset,
        active: true
      });
    }
  }

  // 入力イベントのバインド
  setupInputs() {
    // PCキーボード
    window.addEventListener('keydown', (e) => {
      if (!state.isPlaying) return;
      
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          this.moveLane(-1);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          this.moveLane(1);
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
        case ' ':
          this.triggerJump();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          this.triggerSlide();
          break;
      }
    });
    
    // モバイル用タッチ（スワイプ）検出
    const zone = document.getElementById('swipe-zone');
    
    zone.addEventListener('touchstart', (e) => {
      if (!state.isPlaying) return;
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
    }, { passive: true });
    
    zone.addEventListener('touchend', (e) => {
      if (!state.isPlaying) return;
      
      const diffX = e.changedTouches[0].clientX - this.touchStartX;
      const diffY = e.changedTouches[0].clientY - this.touchStartY;
      
      // 水平方向と垂直方向で変位の大きい方を優先
      if (Math.abs(diffX) > Math.abs(diffY)) {
        // 左右スワイプ
        if (Math.abs(diffX) > this.swipeThreshold) {
          if (diffX > 0) {
            this.moveLane(1);  // 右へ
          } else {
            this.moveLane(-1); // 左へ
          }
        }
      } else {
        // 上下スワイプ
        if (Math.abs(diffY) > this.swipeThreshold) {
          if (diffY < 0) {
            this.triggerJump();  // 上（ジャンプ）
          } else {
            this.triggerSlide(); // 下（スライディング）
          }
        }
      }
    }, { passive: true });

    // UIボタン: サウンドトグル
    document.getElementById('btn-sound').addEventListener('click', (e) => {
      e.stopPropagation();
      state.soundEnabled = !state.soundEnabled;
      const btn = document.getElementById('btn-sound');
      const path = document.getElementById('speaker-path');
      
      if (state.soundEnabled) {
        btn.classList.remove('muted');
        path.setAttribute('d', 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z');
        if (state.isPlaying) startBgm();
      } else {
        btn.classList.add('muted');
        path.setAttribute('d', 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z');
        stopBgm();
      }
    });

    // UIボタン: 難易度切り替え
    const diffButtons = document.querySelectorAll('.btn-diff');
    diffButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        diffButtons.forEach(b => b.classList.remove('active'));
        const currentBtn = e.target.closest('.btn-diff');
        currentBtn.classList.add('active');
        state.difficulty = currentBtn.dataset.difficulty;
        this.updateBestScoreDisplay();
      });
    });

    // UIボタン: 開始・再起動
    document.getElementById('btn-start').addEventListener('click', () => {
      initAudio();
      this.startGame();
    });
    document.getElementById('btn-restart').addEventListener('click', () => {
      this.startGame();
    });
    document.getElementById('btn-to-start').addEventListener('click', () => {
      this.showScreen('start');
    });

    // D-pad: 十字キーボタンのタッチ/クリック入力
    const bindDpad = (id, action) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const fire = (e) => {
        e.preventDefault();
        if (!state.isPlaying) return;
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 120);
        action();
      };
      btn.addEventListener('touchstart', fire, { passive: false });
      btn.addEventListener('mousedown',  fire);
    };
    bindDpad('dpad-up',    () => this.triggerJump());
    bindDpad('dpad-down',  () => this.triggerSlide());
    bindDpad('dpad-left',  () => this.moveLane(-1));
    bindDpad('dpad-right', () => this.moveLane(1));
  }

  // ハイスコアロード
  loadHighScores() {
    const saved = localStorage.getItem('spooky_run_highscores');
    if (saved) {
      try {
        state.highScores = JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    this.updateBestScoreDisplay();
  }

  saveHighScores() {
    localStorage.setItem('spooky_run_highscores', JSON.stringify(state.highScores));
  }

  updateBestScoreDisplay() {
    const bestVal = document.getElementById('best-score-val');
    bestVal.textContent = state.highScores[state.difficulty] || 0;
  }

  // 表示画面コントロール
  showScreen(screenId) {
    document.querySelectorAll('.screen-overlay').forEach(screen => {
      screen.classList.remove('active');
    });
    const activeScreen = document.getElementById(`screen-${screenId}`);
    if (activeScreen) {
      activeScreen.classList.add('active');
    }
    
    if (screenId === 'start') {
      this.updateBestScoreDisplay();
    }
  }

  // --- ゲーム進行アクション ---

  // ゲームの開始
  startGame() {
    // スコアなどのリセット
    state.score = 0;
    state.distance = 0;
    state.candy = 0;
    state.isPlaying = true;

    // D-pad表示
    const dpad = document.getElementById('dpad');
    if (dpad) dpad.classList.add('visible');
    
    // スピードの設定
    const diff = DIFFICULTY_SETTINGS[state.difficulty];
    this.speed = diff.startSpeed;
    this.runDistance = 0;
    this.timeElapsed = 0;

    // キャラ状態リセット
    this.currentLane = 1;
    this.playerTargetX = this.laneX[1];
    this.playerX = 0;
    this.playerY = 0;
    this.jumpVelocity = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.invincibilityTimer = 0;
    this.threatLevel = 0; // 安全
    
    this.player.position.set(0, 0, 0);
    this.player.scale.set(1, 1, 1);
    
    // 死神の初期位置設定（後方遠く）
    this.reaper.position.set(0, 1.2, 16); // プレイヤーの後方16m
    this.reaper.scale.set(1, 1, 1);

    // HUD更新
    this.updateHUD();

    // 既存の道とアセットの初期化
    this.clearThreeObjects();
    this.buildInitialRoad();

    // 画面切り替えとサウンド
    this.showScreen('game');
    playTone({ frequency: 330, type: 'sine', duration: 0.3, volume: 0.15, sweepTo: 660 });
    setTimeout(() => {
      startBgm();
    }, 400);

    // タイム計測開始
    this.clock.getDelta();
  }

  // Three.js側の道や障害物を完全に消去
  clearThreeObjects() {
    // 道路セグメント
    this.roadSegments.forEach(seg => {
      this.scene.remove(seg.group);
      this.disposeHierarchy(seg.group);
    });
    this.roadSegments = [];

    // コリジョンデータのクリア
    this.obstacles = [];
    this.candies = [];
  }

  // メモリリーク防止のためのThree.jsオブジェクト破棄
  disposeHierarchy(obj) {
    obj.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });
  }

  // 終了 (死神に捕まった、または逃げ切った)
  endGame(isClear = false) {
    state.isPlaying = false;
    stopBgm();

    // D-pad非表示
    const dpad = document.getElementById('dpad');
    if (dpad) dpad.classList.remove('visible');

    const titleEl = document.getElementById('result-title');
    const msgEl = document.querySelector('.result-msg');

    if (isClear) {
      SE.clear();
      // クリア時のタイトル表示
      titleEl.textContent = "ESCAPED! 🎉";
      titleEl.className = "title-large glow-text clear-title";
      msgEl.textContent = "死神から見事に逃げ切った！";

      // クリアアニメーション: プレイヤーが喜んで上空へジャンプ回転、死神は悔しがって後退消滅
      this.player.position.y = 1.5;
      this.player.rotation.y += Math.PI * 4;
      this.reaper.position.z += 15.0; // 後方へ退散
      this.reaper.scale.set(0.01, 0.01, 0.01); // 縮小して見えなくする
    } else {
      SE.gameOver();
      // 被捕獲時のタイトル表示
      titleEl.textContent = "CAUGHT!";
      titleEl.className = "title-large glow-text caught-title";
      msgEl.textContent = "死神に追いつかれてしまった...";

      // 捕獲時のアニメーション（キャラがうずくまり、死神が覆い被さる）
      this.player.scale.set(0.8, 0.4, 0.8);
      this.reaper.position.set(this.player.position.x, 1.0, this.player.position.z - 0.5);
    }
    
    // スコア算出 (走行距離m + キャンディ数*10)
    state.score = Math.floor(this.runDistance) + state.candy * 10;

    // ハイスコア更新判定
    let isNewHigh = false;
    if (state.score > state.highScores[state.difficulty]) {
      state.highScores[state.difficulty] = state.score;
      this.saveHighScores();
      isNewHigh = true;
    }

    // 結果表示
    document.getElementById('final-distance').textContent = Math.floor(this.runDistance);
    document.getElementById('final-candy').textContent = state.candy;
    document.getElementById('final-score').textContent = state.score;
    
    const newHighEl = document.querySelector('.new-high-score');
    newHighEl.style.display = isNewHigh ? 'flex' : 'none';

    // ゲームオーバー時のみ画面振動
    if (!isClear) {
      document.querySelector('.game-container').classList.add('shake');
      setTimeout(() => {
        document.querySelector('.game-container').classList.remove('shake');
      }, 450);
    }

    setTimeout(() => {
      this.showScreen('result');
    }, 1000);
  }

  // --- 操作制御 ---

  // レーン移動 (-1: 左へ, 1: 右へ)
  moveLane(dir) {
    const nextLane = this.currentLane + dir;
    if (nextLane >= 0 && nextLane <= 2) {
      this.currentLane = nextLane;
      this.playerTargetX = this.laneX[this.currentLane];
      // 移動音
      playTone({ frequency: 400, type: 'sine', duration: 0.05, volume: 0.03, sweepTo: 450 });
    }
  }

  // ジャンプ開始
  triggerJump() {
    if (!this.isJumping && !this.isSliding) {
      this.isJumping = true;
      this.jumpVelocity = this.jumpPower;
      SE.jump();
    }
  }

  // スライディング開始
  triggerSlide() {
    if (!this.isJumping && !this.isSliding) {
      this.isSliding = true;
      this.slideTimer = 0.65; // スライド継続時間
      SE.slide();
      
      // プロシージャルなスケール縮小（縦を潰し、前後を伸ばす）
      this.player.scale.set(1.15, 0.4, 1.4);
      this.player.position.y = 0; // 地面密着
    }
  }

  // --- メインループ ---

  animate() {
    requestAnimationFrame(() => this.animate());
    
    const dt = Math.min(this.clock.getDelta(), 0.1); // 最低10FPS相当で保護
    
    if (state.isPlaying) {
      this.updateGame(dt);
    } else {
      this.updateMenu(dt);
    }
    
    this.renderer.render(this.scene, this.camera);
  }

  // メニュー時のアイドル演出
  updateMenu(dt) {
    this.timeElapsed += dt;
    
    // プレイヤーがメニューで可愛くふわふわ浮き沈みする
    this.player.position.y = 0.5 + Math.sin(this.timeElapsed * 2) * 0.15;
    this.player.position.x = 0;
    this.player.rotation.y += 0.4 * dt;
    
    // 死神も不気味に浮かぶ
    this.reaper.position.set(0, 1.2 + Math.sin(this.timeElapsed * 1.8) * 0.1, -12);
    this.reaper.rotation.y = Math.PI;

    // カメラをちょっとだけ傾ける
    this.camera.position.set(3, 3, 6);
    this.camera.lookAt(0, 1.0, 0);
  }

  // ゲーム本編アップデート
  updateGame(dt) {
    this.timeElapsed += dt;
    const diff = DIFFICULTY_SETTINGS[state.difficulty];
    
    // 1. スピード徐々に上昇
    if (this.speed < diff.maxSpeed) {
      this.speed += diff.acceleration * dt;
    }
    
    // 2. 距離を稼ぐ
    this.runDistance += this.speed * dt;
    if (this.runDistance >= 500) {
      this.runDistance = 500; // キャップ
      this.endGame(true); // ゲームクリア！
      return;
    }
    
    // 3. プレイヤーのZ進行（-Z方向へ走る）
    this.player.position.z -= this.speed * dt;
    
    // 4. 横方向のレーン切り替え補間 (スムーズな移動)
    this.playerX += (this.playerTargetX - this.playerX) * (1 - Math.exp(-14 * dt));
    this.player.position.x = this.playerX;
    
    // 5. ジャンプ・スライディング挙動
    if (this.isJumping) {
      this.playerY += this.jumpVelocity * dt;
      this.jumpVelocity -= this.gravity * dt;
      
      if (this.playerY <= 0) {
        this.playerY = 0;
        this.isJumping = false;
        this.jumpVelocity = 0;
      }
      this.player.position.y = this.playerY;
    } else if (this.isSliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
        // スケールを元に戻す
        this.player.scale.set(1, 1, 1);
      }
    } else {
      // 走っている時の縦の上下動（ボビング）
      this.player.position.y = Math.abs(Math.sin(this.runDistance * 0.8)) * 0.15;
    }
    
    // 6. 被ダメージ無敵の点滅
    if (this.invincibilityTimer > 0) {
      this.invincibilityTimer -= dt;
      // プレイヤー点滅
      const visible = Math.floor(this.timeElapsed * 15) % 2 === 0;
      this.player.visible = visible;
      
      if (this.invincibilityTimer <= 0) {
        this.player.visible = true;
      }
    }

    // 7. 死神の追跡ロジック (固定の距離で常に真後ろを追走する)
    const targetReaperDist = 7.5; // 常に7.5m後方をキープして追いかける
    const reaperZ = this.player.position.z + targetReaperDist;
    this.reaper.position.z += (reaperZ - this.reaper.position.z) * 6 * dt;
    
    // 横移動もプレイヤーに追従
    this.reaper.position.x += (this.player.position.x - this.reaper.position.x) * 4 * dt;
    // 浮遊ふわふわ
    this.reaper.position.y = 1.2 + Math.sin(this.timeElapsed * 5.0) * 0.12;

    // 8. カメラの追従
    this.camera.position.set(this.playerX * 0.7, 4.2 + (this.playerY * 0.3), this.player.position.z + 7.5);
    this.camera.lookAt(this.playerX * 0.5, 1.2 + (this.playerY * 0.2), this.player.position.z - 4);
    
    // 月明かりのライトもプレイヤーに合わせてZ移動 (常に影がきれいに落ちるように)
    this.moonLight.position.set(this.player.position.x - 10, 25, this.player.position.z + 10);
    this.moonLight.target = this.player;

    // 9. パーティクルの更新
    this.updateEmberParticles(dt, this.player.position.z);

    // 9.5. ゾンビのアニメーション（不気味な徘徊・揺れ挙動）
    for (let obs of this.obstacles) {
      if (obs.mesh && obs.collisionActive) {
        const t = this.timeElapsed * 6 + obs.worldZ; // 個別の時間軸
        if (obs.type === 'zombie_stand') {
          // 左右の揺れ ＋ 上下歩行ボビング
          obs.mesh.rotation.z = Math.sin(t) * 0.08;
          obs.mesh.position.y = Math.abs(Math.sin(t * 2)) * 0.12;
        } else if (obs.type === 'zombie_crawl') {
          // もがくように素早く左右にクネクネ
          obs.mesh.rotation.y = Math.PI + Math.sin(t * 1.5) * 0.15;
          obs.mesh.position.y = Math.abs(Math.sin(t * 3)) * 0.06;
        } else if (obs.type === 'zombie_hang') {
          // 風に吹かれるようにダラーンとぶらぶらスイング
          const swingMesh = obs.mesh.userData.swingMesh;
          if (swingMesh) {
            swingMesh.rotation.x = Math.sin(t * 0.5) * 0.18;
            swingMesh.rotation.z = Math.cos(t * 0.4) * 0.10;
          }
        }
      }
    }

    // 10. 道の無限生成ループ
    // プレイヤーが一番古い区画を通過したら、それを取り壊し、前方に新しい区画を生成
    if (this.roadSegments.length > 0) {
      const oldest = this.roadSegments[0];
      if (this.player.position.z < oldest.zPos - this.segmentLength) {
        // 取り壊し
        this.scene.remove(oldest.group);
        this.disposeHierarchy(oldest.group);
        this.roadSegments.shift();
        
        // 前方に新しいのを追加
        const newest = this.roadSegments[this.roadSegments.length - 1];
        const newZ = newest.zPos - this.segmentLength;
        this.spawnRoadSegment(newZ, true);
        
        // プレイヤーのはるか後方になった古いコリジョンターゲットを定期清掃
        this.cleanOldCollisions();
      }
    }

    // 11. 衝突判定
    this.checkCollisions();
    
    // 12. HUD表示の更新
    this.updateHUD();
  }

  // 通り過ぎた不要なコリジョンデータの掃除
  cleanOldCollisions() {
    const limitZ = this.player.position.z + 20;
    this.obstacles = this.obstacles.filter(obs => obs.worldZ < limitZ);
    this.candies = this.candies.filter(c => c.worldZ < limitZ);
  }

  // 衝突判定ロジック
  checkCollisions() {
    const playerZ = this.player.position.z;
    const playerZRadius = 0.5; // キャラ厚み
    
    // A. 障害物とのコリジョン
    for (let obs of this.obstacles) {
      if (!obs.collisionActive) continue;
      
      // プレイヤーが障害物のZ位置に到達したか判定
      const zDist = Math.abs(obs.worldZ - playerZ);
      if (zDist < 0.6) {
        // レーンが一致しているか
        if (obs.lane === this.currentLane) {
          
          let collided = false;
          
          if (obs.type === 'zombie_stand') {
            // 立っているゾンビ: 高いジャンプで回避可能（高さ1.3以上必要）
            if (this.playerY < 1.3) {
              collided = true;
            }
          } else if (obs.type === 'zombie_crawl') {
            // 這うゾンビ: 低いジャンプでも回避可能（高さ0.6以上必要）
            if (this.playerY < 0.6) {
              collided = true;
            }
          } else if (obs.type === 'zombie_hang') {
            // 首吊りゾンビ: スライディングでのみ回避可能
            if (!this.isSliding) {
              collided = true;
            }
          }
          
          if (collided) {
            obs.collisionActive = false; // 重複ヒット防止
            this.handleObstacleHit();
          }
        }
      }
    }
    
    // B. キャンディとのコリジョン
    for (let c of this.candies) {
      if (!c.active) continue;
      
      const zDist = Math.abs(c.worldZ - playerZ);
      if (zDist < 0.8) {
        if (c.lane === this.currentLane) {
          
          // ジャンプ中はキャンディの位置と高さが合っているか
          // (基本的にジャンプ中のキャンディは浮かせるなどして調整するが、簡易的にy=0〜1.8の間なら取得可能に)
          if (this.playerY < 1.8) {
            c.active = false;
            c.mesh.visible = false; // 非表示
            
            // キャンディ加算と効果音
            state.candy++;
            SE.candy();
            
            // ポップアップ演出
            const candyVal = document.getElementById('candy-val');
            candyVal.classList.remove('combo-pop');
            void candyVal.offsetWidth;
            candyVal.classList.add('combo-pop');
          }
        }
      }
      
      // キャンディをくるくる回転させる
      if (c.mesh && c.active) {
        c.mesh.rotation.y += 3.0 * this.clock.getDelta(); // スピン
      }
    }
  }

  // 障害物に衝突した際のペナルティ処理 (即ゲームオーバー)
  handleObstacleHit() {
    // 赤色フラッシュエフェクト起動
    const flash = document.getElementById('damage-flash');
    if (flash) {
      flash.classList.remove('flash');
      void flash.offsetWidth;
      flash.classList.add('flash');
    }
    
    this.endGame(false); // 即座に捕獲ゲームオーバー
  }

  // HUD UI描画更新
  updateHUD() {
    document.getElementById('distance-val').textContent = Math.floor(this.runDistance);
    document.getElementById('candy-val').textContent = state.candy;
    
    // スコアは暫定的に (距離 + キャンディ*10)
    const currentScore = Math.floor(this.runDistance) + state.candy * 10;
    document.getElementById('score-val').textContent = currentScore;
  }



  // リサイズハンドラ
  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// 起動開始
window.addEventListener('DOMContentLoaded', () => {
  new SpookyRunGame();
});
