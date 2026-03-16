// ─────────────────────────────────────────────────────────────
//  NitroRush — Game Engine
//  Top-down 2D car racing with canvas rendering
// ─────────────────────────────────────────────────────────────

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const W = canvas.width;   // 480
const H = canvas.height;  // 640

// ─── Player data ─────────────────────────────────────────────
const playerName = sessionStorage.getItem('playerName') || 'Racer';
document.getElementById('hudName').textContent = playerName.toUpperCase().slice(0, 10);

// ─── Game state ──────────────────────────────────────────────
let gameState = 'countdown';   // countdown | running | over
let score = 0;
let frameCount = 0;
let speedMultiplier = 1;
let animId;
let scoreSaved = false;

// ─── Road geometry ───────────────────────────────────────────
const ROAD_LEFT  = 60;
const ROAD_RIGHT = W - 60;
const ROAD_W     = ROAD_RIGHT - ROAD_LEFT;

const NUM_LANES  = 3;
const LANE_W     = ROAD_W / NUM_LANES;

function laneCenter(lane) { // lane = 0,1,2
  return ROAD_LEFT + LANE_W * lane + LANE_W / 2;
}

// ─── Road animation ──────────────────────────────────────────
let roadOffset = 0;
const DASH_HEIGHT = 40;
const DASH_GAP    = 60;

// ─── Player car ──────────────────────────────────────────────
const CAR_W  = 36;
const CAR_H  = 60;

const player = {
  x: W / 2,
  y: H - 110,
  w: CAR_W,
  h: CAR_H,
  lane: 1,
  targetX: W / 2,
  speed: 6,
  moving: false
};

// ─── Enemy cars ──────────────────────────────────────────────
const ENEMY_COLORS = [
  '#e74c3c', '#e67e22', '#9b59b6',
  '#1abc9c', '#3498db', '#e91e63'
];

let enemies = [];
let enemySpawnTimer = 0;
let enemySpawnInterval = 90; // frames between spawns

// ─── Particles (exhaust, crash) ──────────────────────────────
let particles = [];

// ─── Stars background ────────────────────────────────────────
const stars = Array.from({ length: 60 }, () => ({
  x: Math.random() * W,
  y: Math.random() * H,
  r: Math.random() * 1.5 + 0.5,
  opacity: Math.random() * 0.5 + 0.2
}));

// ─── Input: Keyboard ─────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => keys[e.key] = true);
document.addEventListener('keyup',   e => keys[e.key] = false);

// ─── Input: Touch buttons ────────────────────────────────────
function touchStart(dir) {
  if (gameState !== 'running') return;
  const btn = document.getElementById(dir === 'left' ? 'btnLeft' : 'btnRight');
  if (btn) btn.classList.add('pressed');
  if (dir === 'left' && player.lane > 0) {
    player.lane--;
    player.targetX = laneCenter(player.lane);
  } else if (dir === 'right' && player.lane < NUM_LANES - 1) {
    player.lane++;
    player.targetX = laneCenter(player.lane);
  }
}

function touchEnd(dir) {
  const btn = document.getElementById(dir === 'left' ? 'btnLeft' : 'btnRight');
  if (btn) btn.classList.remove('pressed');
}

// ─── Input: Swipe gestures ───────────────────────────────────
let swipeStartX = 0;
let swipeStartY = 0;

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  swipeStartX = e.touches[0].clientX;
  swipeStartY = e.touches[0].clientY;
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (gameState !== 'running') return;
  const dx = e.changedTouches[0].clientX - swipeStartX;
  const dy = Math.abs(e.changedTouches[0].clientY - swipeStartY);
  if (Math.abs(dx) > 30 && dy < 60) {
    if (dx < 0 && player.lane > 0) {
      player.lane--;
      player.targetX = laneCenter(player.lane);
    } else if (dx > 0 && player.lane < NUM_LANES - 1) {
      player.lane++;
      player.targetX = laneCenter(player.lane);
    }
  }
}, { passive: false });

// ─── Countdown ───────────────────────────────────────────────
let countdown = 3;
const countdownEl  = document.getElementById('countdownNum');
const countdownOverlay = document.getElementById('countdownOverlay');

function runCountdown() {
  countdownEl.textContent = countdown;
  countdownEl.style.animation = 'none';
  void countdownEl.offsetWidth; // reflow to retrigger animation
  countdownEl.style.animation = 'countPulse 0.8s ease';

  if (countdown > 0) {
    countdown--;
    setTimeout(runCountdown, 900);
  } else {
    countdownEl.textContent = 'GO!';
    countdownEl.style.color = '#00f5ff';
    setTimeout(() => {
      countdownOverlay.classList.add('hidden');
      gameState = 'running';
    }, 700);
  }
}

setTimeout(runCountdown, 300);

// ─── Spawn enemy ─────────────────────────────────────────────
function spawnEnemy() {
  const lane = Math.floor(Math.random() * NUM_LANES);

  // Prevent stacking on same lane at top
  const tooClose = enemies.some(e => e.lane === lane && e.y < 0 + CAR_H * 2);
  if (tooClose) return;

  enemies.push({
    x: laneCenter(lane),
    y: -CAR_H,
    w: CAR_W,
    h: CAR_H,
    lane,
    color: ENEMY_COLORS[Math.floor(Math.random() * ENEMY_COLORS.length)],
    speed: (2.5 + Math.random() * 1.5) * speedMultiplier
  });
}

// ─── Collision detection (AABB) ──────────────────────────────
function collides(a, b) {
  const margin = 6; // slight forgiveness
  return (
    a.x - a.w / 2 + margin < b.x + b.w / 2 - margin &&
    a.x + a.w / 2 - margin > b.x - b.w / 2 + margin &&
    a.y - a.h / 2 + margin < b.y + b.h / 2 - margin &&
    a.y + a.h / 2 - margin > b.y - b.h / 2 + margin
  );
}

// ─── Crash particles ─────────────────────────────────────────
function spawnCrashParticles(x, y) {
  for (let i = 0; i < 24; i++) {
    const angle = (Math.PI * 2 * i) / 24 + Math.random() * 0.5;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: 3 + Math.random() * 5,
      life: 1,
      decay: 0.03 + Math.random() * 0.04,
      color: Math.random() > 0.5 ? '#ff6b1a' : '#ff2244'
    });
  }
}

// ─── Exhaust particles ───────────────────────────────────────
function spawnExhaust() {
  if (frameCount % 4 !== 0) return;
  particles.push({
    x: player.x - 4 + Math.random() * 8,
    y: player.y + player.h / 2,
    vx: (Math.random() - 0.5) * 0.8,
    vy: 1.5 + Math.random(),
    r: 3 + Math.random() * 2,
    life: 1,
    decay: 0.05,
    color: '#888899'
  });
}

// ─── Update particles ────────────────────────────────────────
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= p.decay;
    p.r *= 0.97;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ─── Draw road ───────────────────────────────────────────────
function drawRoad() {
  // Asphalt base
  ctx.fillStyle = '#1c1c2e';
  ctx.fillRect(ROAD_LEFT, 0, ROAD_W, H);

  // Road edge lines
  ctx.strokeStyle = '#f5e642';
  ctx.lineWidth = 4;
  ctx.shadowColor = '#f5e642';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(ROAD_LEFT, 0);
  ctx.lineTo(ROAD_LEFT, H);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ROAD_RIGHT, 0);
  ctx.lineTo(ROAD_RIGHT, H);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Lane dividers (dashed)
  for (let lane = 1; lane < NUM_LANES; lane++) {
    const x = ROAD_LEFT + LANE_W * lane;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([DASH_HEIGHT, DASH_GAP]);
    ctx.lineDashOffset = -roadOffset;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ─── Draw scenery (roadside) ─────────────────────────────────
function drawScenery() {
  // Left roadside
  const grad1 = ctx.createLinearGradient(0, 0, ROAD_LEFT, 0);
  grad1.addColorStop(0, '#0a1a0a');
  grad1.addColorStop(1, '#0d1a0d');
  ctx.fillStyle = grad1;
  ctx.fillRect(0, 0, ROAD_LEFT, H);

  // Right roadside
  const grad2 = ctx.createLinearGradient(ROAD_RIGHT, 0, W, 0);
  grad2.addColorStop(0, '#0d1a0d');
  grad2.addColorStop(1, '#0a1a0a');
  ctx.fillStyle = grad2;
  ctx.fillRect(ROAD_RIGHT, 0, W - ROAD_RIGHT, H);

  // Stars
  for (const s of stars) {
    ctx.fillStyle = `rgba(255,255,255,${s.opacity})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Draw player car ─────────────────────────────────────────
function drawPlayerCar(x, y) {
  const w = player.w;
  const h = player.h;
  const cx = x;
  const cy = y;

  ctx.save();
  ctx.translate(cx, cy);

  // Body shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(2, 6, w/2 - 2, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main body
  const bodyGrad = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2);
  bodyGrad.addColorStop(0, '#f5e642');
  bodyGrad.addColorStop(0.4, '#e6c800');
  bodyGrad.addColorStop(1, '#c8aa00');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.roundRect(-w/2, -h/2, w, h, [6, 6, 4, 4]);
  ctx.fill();

  // Windshield
  ctx.fillStyle = 'rgba(0,240,255,0.6)';
  ctx.beginPath();
  ctx.roundRect(-w/2 + 5, -h/2 + 8, w - 10, h * 0.28, 3);
  ctx.fill();
  // Shine
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.roundRect(-w/2 + 7, -h/2 + 10, w/2 - 8, 5, 2);
  ctx.fill();

  // Rear window
  ctx.fillStyle = 'rgba(0,180,200,0.5)';
  ctx.beginPath();
  ctx.roundRect(-w/2 + 5, h/2 - 20, w - 10, 12, 3);
  ctx.fill();

  // Center stripe
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(-2, -h/2 + 4, 4, h - 8);

  // Headlights
  ctx.fillStyle = '#fff7aa';
  ctx.shadowColor = '#f5e642';
  ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.ellipse(-w/2 + 6, -h/2 + 4, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(w/2 - 6, -h/2 + 4, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Tail lights
  ctx.fillStyle = '#ff4444';
  ctx.shadowColor = '#ff2200';
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.ellipse(-w/2 + 6, h/2 - 4, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(w/2 - 6, h/2 - 4, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Wheels
  ctx.fillStyle = '#222';
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1.5;
  [[-w/2 - 3, -h/2 + 12], [w/2 + 3, -h/2 + 12], [-w/2 - 3, h/2 - 12], [w/2 + 3, h/2 - 12]].forEach(([wx, wy]) => {
    ctx.beginPath(); ctx.roundRect(wx - 4, wy - 8, 8, 16, 2); ctx.fill(); ctx.stroke();
  });

  ctx.restore();
}

// ─── Draw enemy car ──────────────────────────────────────────
function drawEnemyCar(e) {
  const cx = e.x;
  const cy = e.y;
  const w  = e.w;
  const h  = e.h;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI); // enemies face downward

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(2, 6, w/2 - 2, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  const grad = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2);
  grad.addColorStop(0, e.color);
  grad.addColorStop(1, shadeColor(e.color, -30));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(-w/2, -h/2, w, h, [6, 6, 4, 4]);
  ctx.fill();

  // Windshield
  ctx.fillStyle = 'rgba(150,220,255,0.5)';
  ctx.beginPath();
  ctx.roundRect(-w/2 + 5, -h/2 + 8, w - 10, h * 0.28, 3);
  ctx.fill();

  // Headlights
  ctx.fillStyle = '#fffde0';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.ellipse(-w/2 + 6, -h/2 + 4, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(w/2 - 6, -h/2 + 4, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Wheels
  ctx.fillStyle = '#222';
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1.5;
  [[-w/2 - 3, -h/2 + 12], [w/2 + 3, -h/2 + 12], [-w/2 - 3, h/2 - 12], [w/2 + 3, h/2 - 12]].forEach(([wx, wy]) => {
    ctx.beginPath(); ctx.roundRect(wx - 4, wy - 8, 8, 16, 2); ctx.fill(); ctx.stroke();
  });

  ctx.restore();
}

// Shade color helper
function shadeColor(color, amount) {
  let c = parseInt(color.slice(1), 16);
  let r = Math.max(0, Math.min(255, (c >> 16) + amount));
  let g = Math.max(0, Math.min(255, ((c >> 8) & 0xff) + amount));
  let b = Math.max(0, Math.min(255, (c & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ─── Draw particles ──────────────────────────────────────────
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ─── Update score HUD ────────────────────────────────────────
const hudScore = document.getElementById('hudScore');
const hudSpeed = document.getElementById('hudSpeed');

function updateHUD() {
  hudScore.textContent = score;
  hudSpeed.textContent = speedMultiplier.toFixed(1) + 'x';
}

function popScore() {
  hudScore.classList.remove('pop');
  void hudScore.offsetWidth;
  hudScore.classList.add('pop');
  setTimeout(() => hudScore.classList.remove('pop'), 150);
}

// ─── Game Over ───────────────────────────────────────────────
async function triggerGameOver(crashX, crashY) {
  gameState = 'over';
  cancelAnimationFrame(animId);

  spawnCrashParticles(crashX, crashY);

  // Draw one last frame with crash particles
  requestAnimationFrame(() => {
    ctx.clearRect(0, 0, W, H);
    drawScenery();
    drawRoad();
    drawParticles();
  });

  // Save score
  if (!scoreSaved) {
    scoreSaved = true;
    try {
      await fetch('/api/save-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerName, score })
      });
    } catch (e) {
      console.warn('Could not save score (is server running?):', e);
    }
  }

  // Show game over overlay
  document.getElementById('goPlayerName').textContent = playerName;
  document.getElementById('finalScore').textContent = score;
  document.getElementById('gameOverOverlay').classList.remove('hidden');
}

// ─── Restart ─────────────────────────────────────────────────
function restartGame() {
  document.getElementById('gameOverOverlay').classList.add('hidden');
  document.getElementById('countdownOverlay').classList.remove('hidden');

  // Reset state
  score = 0;
  frameCount = 0;
  speedMultiplier = 1;
  enemies = [];
  particles = [];
  enemySpawnTimer = 0;
  enemySpawnInterval = 90;
  scoreSaved = false;
  gameState = 'countdown';

  player.x = W / 2;
  player.targetX = W / 2;
  player.lane = 1;

  countdown = 3;
  countdownEl.style.color = '#f5e642';
  updateHUD();
  setTimeout(runCountdown, 300);
  requestAnimationFrame(gameLoop);
}

// ─── Main game loop ──────────────────────────────────────────
function gameLoop() {
  if (gameState === 'over') return;

  animId = requestAnimationFrame(gameLoop);
  frameCount++;

  // ── Clear ──
  ctx.clearRect(0, 0, W, H);

  // ── Scenery ──
  drawScenery();

  // ── Road scroll ──
  roadOffset = (roadOffset + 6 * speedMultiplier) % (DASH_HEIGHT + DASH_GAP);
  drawRoad();

  if (gameState !== 'running') {
    // Still animate road during countdown
    return;
  }

  // ── Score ──
  const prevScore = score;
  score = Math.floor(frameCount / 6);
  if (Math.floor(score / 10) > Math.floor(prevScore / 10)) popScore();
  updateHUD();

  // ── Speed ramp ──
  speedMultiplier = 1 + score / 300;
  if (score > 0 && score % 50 === 0 && enemySpawnInterval > 40) {
    enemySpawnInterval = Math.max(40, 90 - score / 5);
  }

  // ── Input: move by lane ──
  if ((keys['ArrowLeft'] || keys['a']) && player.lane > 0) {
    player.lane--;
    player.targetX = laneCenter(player.lane);
    keys['ArrowLeft'] = false; keys['a'] = false;
  }
  if ((keys['ArrowRight'] || keys['d']) && player.lane < NUM_LANES - 1) {
    player.lane++;
    player.targetX = laneCenter(player.lane);
    keys['ArrowRight'] = false; keys['d'] = false;
  }

  // Smooth slide to target lane
  player.x += (player.targetX - player.x) * 0.18;

  // ── Exhaust ──
  spawnExhaust();

  // ── Spawn enemies ──
  enemySpawnTimer++;
  if (enemySpawnTimer >= enemySpawnInterval) {
    spawnEnemy();
    enemySpawnTimer = 0;
  }

  // ── Update enemies ──
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.y += e.speed * speedMultiplier;
    e.x += (laneCenter(e.lane) - e.x) * 0.2;

    // Remove off-screen
    if (e.y > H + CAR_H) {
      enemies.splice(i, 1);
      continue;
    }

    // Collision
    if (collides(player, e)) {
      triggerGameOver(player.x, player.y);
      return;
    }
  }

  // ── Draw everything ──
  updateParticles();
  drawParticles();

  // Draw enemies
  for (const e of enemies) drawEnemyCar(e);

  // Draw player
  drawPlayerCar(player.x, player.y);
}

// Start
requestAnimationFrame(gameLoop);
