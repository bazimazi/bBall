const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const ORIGINAL_BALL_SPEED = 250;
const ORIGINAL_BOT_SPEED = 250;
const ORIGINAL_PLAYER_SPEED = 300;

const player = {
  x: 40,
  y: HEIGHT / 2 - 50,
  width: 15,
  height: 100,
  baseSpeed: ORIGINAL_PLAYER_SPEED,
  speed: ORIGINAL_PLAYER_SPEED,
  dy: 0
};

const bot = {
  x: WIDTH - 55,
  y: HEIGHT / 2 - 50,
  width: 15,
  height: 100,
  baseSpeed: ORIGINAL_BOT_SPEED,
  speed: ORIGINAL_BOT_SPEED
};

const ball = {
  x: WIDTH / 2,
  y: HEIGHT / 2,
  radius: 10,
  baseSpeed: ORIGINAL_BALL_SPEED,
  vx: 250,
  vy: 180
};

const trail = [];
const MAX_TRAIL = 15;
const particles = [];

let scorePlayer = 0;
let scoreBot = 0;
let lastTime = performance.now();

let baseDifficulty = 1.0;
let difficultyMultiplier = 1.0;
const DIFFICULTY_RATE = 0.2;
const BASE_DIFF_INC_PER_RESET = 0.08;

let gameState = 'start';
let nextServeDirection = 1;

let paddlesResetting = false;
let paddleResetProgress = 0;
const PADDLE_RESET_DURATION = 0.4;

let shakeTime = 0;
let shakeIntensity = 0;

function spawnParticles(x, y, color, count = 15, speed = 150) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const vx = Math.cos(angle) * (Math.random() * speed);
    const vy = Math.sin(angle) * (Math.random() * speed);
    particles.push({
      x,
      y,
      vx,
      vy,
      life: 0.5 + Math.random() * 0.3,
      color,
      age: 0
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.95;
    p.vy *= 0.95;
    if (p.age >= p.life) {
      particles.splice(i, 1);
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    const alpha = 1 - p.age / p.life;
    ctx.save();
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function startShake(baseIntensity = 4, duration = 0.15) {
  const speedFactor = Math.min(1.2, Math.abs(ball.vx) / 400);
  shakeIntensity = baseIntensity * speedFactor;
  shakeTime = duration;
}

function applyCameraShake() {
  if (shakeTime > 0) {
    const dx = (Math.random() - 0.5) * shakeIntensity;
    const dy = (Math.random() - 0.5) * shakeIntensity;
    ctx.translate(dx, dy);
  }
}

function update(dt) {
  if (shakeTime > 0) {
    shakeTime -= dt;
    if (shakeTime < 0) {
      shakeTime = 0;
    }
  }

  if (paddlesResetting) {
    paddleResetProgress += dt / PADDLE_RESET_DURATION;
    const t = Math.min(paddleResetProgress, 1);
    const targetY = HEIGHT / 2 - player.height / 2;
    player.y += (targetY - player.y) * t;
    bot.y += (targetY - bot.y) * t;
    if (paddleResetProgress >= 1) {
      paddlesResetting = false;
      const speed = ball.baseSpeed * difficultyMultiplier;
      ball.vx = speed * nextServeDirection;
      ball.vy = 150 * (Math.random() > 0.5 ? 1 : -1);
    }
  }

  if (gameState !== 'playing') {
    updateParticles(dt);
    return;
  }

  difficultyMultiplier += DIFFICULTY_RATE * dt;
  player.speed = player.baseSpeed + scorePlayer * 30;
  bot.speed = bot.baseSpeed + scoreBot * 30;

  const currentBallSpeed = ball.baseSpeed * difficultyMultiplier;
  const dirX = Math.sign(ball.vx) || 1;
  const dirY = Math.sign(ball.vy) || 1;
  ball.vx = dirX * currentBallSpeed;
  ball.vy = dirY * Math.min(Math.abs(ball.vy), currentBallSpeed);

  player.y += player.dy * dt;
  player.y = Math.max(0, Math.min(HEIGHT - player.height, player.y));

  const botCenter = bot.y + bot.height / 2;
  if (ball.y < botCenter - 10) {
    bot.y -= bot.speed * dt;
  } else if (ball.y > botCenter + 10) {
    bot.y += bot.speed * dt;
  }
  bot.y = Math.max(0, Math.min(HEIGHT - bot.height, bot.y));

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  trail.push({ x: ball.x, y: ball.y });
  if (trail.length > MAX_TRAIL) {
    trail.shift();
  }

  if (ball.y - ball.radius < 0 || ball.y + ball.radius > HEIGHT) {
    ball.vy *= -1;
    startShake(3.5, 0.12);
  }

  if (
    ball.x - ball.radius < player.x + player.width &&
    ball.y > player.y &&
    ball.y < player.y + player.height
  ) {
    ball.vx = Math.abs(ball.vx);
    const hit = (ball.y - (player.y + player.height / 2)) / (player.height / 2);
    ball.vy = hit * 200;
    spawnParticles(ball.x, ball.y, getBallColor(difficultyMultiplier));
    startShake(2.75, 0.11);
  }

  if (
    ball.x + ball.radius > bot.x &&
    ball.y > bot.y &&
    ball.y < bot.y + bot.height
  ) {
    ball.vx = -Math.abs(ball.vx);
    const hit = (ball.y - (bot.y + bot.height / 2)) / (bot.height / 2);
    ball.vy = hit * 200;
    spawnParticles(ball.x, ball.y, getBallColor(difficultyMultiplier));
    startShake(2.75, 0.11);
  }

  if (ball.x + ball.radius < 0) {
    scoreBot += 1;
    spawnParticles(WIDTH / 2, HEIGHT / 2, 'red', 40, 200);
    nextServeDirection = -1;
    gameState = 'waiting';
    startShake(4, 0.25);
  } else if (ball.x - ball.radius > WIDTH) {
    scorePlayer += 1;
    spawnParticles(WIDTH / 2, HEIGHT / 2, 'lime', 40, 200);
    nextServeDirection = 1;
    gameState = 'waiting';
    startShake(4, 0.25);
  }

  updateParticles(dt);
  checkWin();
}

function draw() {
  ctx.save();
  applyCameraShake();
  ctx.fillStyle = getBackgroundColor(difficultyMultiplier);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = 'white';
  ctx.font = '32px monospace';
  ctx.textAlign = 'center';
  if (gameState === 'start') {
    ctx.fillText('PONG', WIDTH / 2, HEIGHT / 2 - 40);
    ctx.font = '20px monospace';
    ctx.fillText('Press SPACE to start', WIDTH / 2, HEIGHT / 2 + 10);
    ctx.restore();
    return;
  }
  if (gameState === 'gameover') {
    ctx.fillText('GAME OVER', WIDTH / 2, HEIGHT / 2 - 40);
    ctx.font = '20px monospace';
    const winner = scorePlayer > scoreBot ? 'You Win!' : 'Bot Wins!';
    ctx.fillText(winner, WIDTH / 2, HEIGHT / 2);
    ctx.fillText('Press SPACE to restart', WIDTH / 2, HEIGHT / 2 + 40);
    ctx.restore();
    return;
  }
  for (let y = 0; y < HEIGHT; y += 30) {
    ctx.fillRect(WIDTH / 2 - 1, y, 2, 20);
  }
  ctx.fillRect(player.x, player.y, player.width, player.height);
  ctx.fillRect(bot.x, bot.y, bot.width, bot.height);
  drawBallTrail();
  drawParticles();
  ctx.beginPath();
  ctx.fillStyle = getBallColor(difficultyMultiplier);
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '28px monospace';
  ctx.fillStyle = 'white';
  ctx.fillText(scorePlayer, WIDTH / 2 - 60, 40);
  ctx.fillText(scoreBot, WIDTH / 2 + 60, 40);
  if (gameState === 'paused') {
    ctx.font = '24px monospace';
    ctx.fillText('Paused', WIDTH / 2, HEIGHT / 2);
  }
  if (gameState === 'waiting') {
    ctx.font = '20px monospace';
    ctx.fillText('Point scored!', WIDTH / 2, HEIGHT / 2 - 20);
    ctx.fillText('Press SPACE to continue', WIDTH / 2, HEIGHT / 2 + 20);
  }
  ctx.restore();
}

function drawBallTrail() {
  const n = trail.length;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1 || 1);
    const alpha = t * 0.18;
    const size = ball.radius * (0.55 + 0.35 * t);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = getBallColor(difficultyMultiplier);
    ctx.beginPath();
    ctx.arc(trail[i].x, trail[i].y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function getBallColor(multiplier) {
  const hue = Math.max(0, 120 - (multiplier - 1) * 60);
  return `hsl(${hue}, 100%, 60%)`;
}

function getBackgroundColor(multiplier) {
  const hue = Math.max(20, 140 - (multiplier - 1) * 80);
  const lightness = Math.max(10, 40 - (multiplier - 1) * 10);
  return `hsl(${hue}, 60%, ${lightness}%)`;
}

function resetBall(direction = 1, bumpBase = true) {
  if (bumpBase) {
    baseDifficulty += BASE_DIFF_INC_PER_RESET;
  }
  difficultyMultiplier = baseDifficulty;
  trail.length = 0;
  paddlesResetting = true;
  paddleResetProgress = 0;
  ball.x = WIDTH / 2;
  ball.y = HEIGHT / 2;
  ball.vx = 0;
  ball.vy = 0;
  nextServeDirection = direction;
}

function checkWin() {
  if (scorePlayer >= 5 || scoreBot >= 5) {
    gameState = 'gameover';
  }
}

function resetGame() {
  const totalScore = scorePlayer + scoreBot;
  const scoreFactor = 1 + totalScore * 0.05;
  ball.baseSpeed = ORIGINAL_BALL_SPEED * scoreFactor;
  bot.baseSpeed = ORIGINAL_BOT_SPEED * scoreFactor;
  player.baseSpeed = ORIGINAL_PLAYER_SPEED * scoreFactor;
  baseDifficulty = 1.0 * scoreFactor;
  difficultyMultiplier = baseDifficulty;
  scorePlayer = 0;
  scoreBot = 0;
  player.y = HEIGHT / 2 - player.height / 2;
  bot.y = HEIGHT / 2 - bot.height / 2;
  bot.speed = bot.baseSpeed;
  player.speed = player.baseSpeed;
  resetBall(Math.random() > 0.5 ? 1 : -1, false);
  gameState = 'playing';
}

function loop(timestamp) {
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

document.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowUp') {
    player.dy = -player.speed;
  } else if (e.code === 'ArrowDown') {
    player.dy = player.speed;
  }
  if (e.code === 'Escape' && gameState === 'playing') {
    gameState = 'paused';
  } else if (e.code === 'Escape' && gameState === 'paused') {
    gameState = 'playing';
  }
  if (e.code === 'Space') {
    if (gameState === 'start' || gameState === 'gameover') {
      resetGame();
    } else if (gameState === 'waiting') {
      resetBall(nextServeDirection);
      gameState = 'playing';
    }
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
    player.dy = 0;
  }
});

requestAnimationFrame(loop);
