const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// Base constants
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

let scorePlayer = 0;
let scoreBot = 0;
let lastTime = performance.now();

// Difficulty
let baseDifficulty = 1.0;         // baseline the multiplier snaps to on resetBall()
let difficultyMultiplier = 1.0;   // current, grows over time from baseDifficulty
const DIFFICULTY_RATE = 0.2;      // per second growth
const BASE_DIFF_INC_PER_RESET = 0.08; // how much baseDifficulty bumps each ball reset

let gameState = 'start'; // 'start' | 'playing' | 'paused' | 'gameover'

function update(dt) {
  if (gameState !== 'playing') return;

  // Grow difficulty smoothly over time from the current base
  difficultyMultiplier += DIFFICULTY_RATE * dt;

  // Paddle power scales with current scores
  player.speed = player.baseSpeed + scorePlayer * 30;
  bot.speed = bot.baseSpeed + scoreBot * 30;

  // Ball speed scales with difficulty
  const currentBallSpeed = ball.baseSpeed * difficultyMultiplier;
  const dirX = Math.sign(ball.vx) || 1;
  const dirY = Math.sign(ball.vy) || 1;
  ball.vx = dirX * currentBallSpeed;
  ball.vy = dirY * Math.min(Math.abs(ball.vy), currentBallSpeed);

  // Player movement
  player.y += player.dy * dt;
  player.y = Math.max(0, Math.min(HEIGHT - player.height, player.y));

  // Bot movement
  const botCenter = bot.y + bot.height / 2;
  if (ball.y < botCenter - 10) bot.y -= bot.speed * dt;
  else if (ball.y > botCenter + 10) bot.y += bot.speed * dt;
  bot.y = Math.max(0, Math.min(HEIGHT - bot.height, bot.y));

  // Ball movement
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Wall bounce
  if (ball.y - ball.radius < 0 || ball.y + ball.radius > HEIGHT) {
    ball.vy *= -1;
  }

  // Player collision
  if (
    ball.x - ball.radius < player.x + player.width &&
    ball.y > player.y &&
    ball.y < player.y + player.height
  ) {
    ball.vx = Math.abs(ball.vx);
    const hit = (ball.y - (player.y + player.height / 2)) / (player.height / 2);
    ball.vy = hit * 200;
  }

  // Bot collision
  if (
    ball.x + ball.radius > bot.x &&
    ball.y > bot.y &&
    ball.y < bot.y + bot.height
  ) {
    ball.vx = -Math.abs(ball.vx);
    const hit = (ball.y - (bot.y + bot.height / 2)) / (bot.height / 2);
    ball.vy = hit * 200;
  }

  // Scoring
  if (ball.x + ball.radius < 0) {
    scoreBot++;
    resetBall(-1);
  } else if (ball.x - ball.radius > WIDTH) {
    scorePlayer++;
    resetBall(1);
  }

  checkWin();
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = 'white';
  ctx.font = '32px monospace';
  ctx.textAlign = 'center';

  if (gameState === 'start') {
    ctx.fillText('PONG', WIDTH / 2, HEIGHT / 2 - 40);
    ctx.font = '20px monospace';
    ctx.fillText('Press SPACE to start', WIDTH / 2, HEIGHT / 2 + 10);
    return;
  }

  if (gameState === 'gameover') {
    ctx.fillText('GAME OVER', WIDTH / 2, HEIGHT / 2 - 40);
    ctx.font = '20px monospace';
    const winner = scorePlayer > scoreBot ? 'You Win!' : 'Bot Wins!';
    ctx.fillText(winner, WIDTH / 2, HEIGHT / 2);
    ctx.fillText('Press SPACE to restart', WIDTH / 2, HEIGHT / 2 + 40);
    return;
  }

  // Mid line
  for (let y = 0; y < HEIGHT; y += 30) {
    ctx.fillRect(WIDTH / 2 - 1, y, 2, 20);
  }

  // Paddles
  ctx.fillRect(player.x, player.y, player.width, player.height);
  ctx.fillRect(bot.x, bot.y, bot.width, bot.height);

  // Ball (color reflects difficulty)
  ctx.beginPath();
  ctx.fillStyle = getBallColor(difficultyMultiplier);
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();

  // Scores
  ctx.fillStyle = 'white';
  ctx.font = '28px monospace';
  ctx.fillText(scorePlayer, WIDTH / 2 - 60, 40);
  ctx.fillText(scoreBot, WIDTH / 2 + 60, 40);

  if (gameState === 'paused') {
    ctx.font = '24px monospace';
    ctx.fillText('Paused', WIDTH / 2, HEIGHT / 2);
  }
}

function getBallColor(multiplier) {
  const hue = Math.max(0, 120 - (multiplier - 1) * 60); // green->red
  return `hsl(${hue}, 100%, 60%)`;
}

function resetBall(direction = 1, bumpBase = true) {
  if (bumpBase) {
    baseDifficulty += BASE_DIFF_INC_PER_RESET;
  }
  difficultyMultiplier = baseDifficulty;

  ball.x = WIDTH / 2;
  ball.y = HEIGHT / 2;

  const speed = ball.baseSpeed * difficultyMultiplier;
  ball.vx = speed * direction;
  ball.vy = 150 * (Math.random() > 0.5 ? 1 : -1);
}

function checkWin() {
  if (scorePlayer >= 5 || scoreBot >= 5) {
    gameState = 'gameover';
  }
}

function resetGame() {
  // Recompute base speeds from the *final* scores of the last match
  const totalScore = scorePlayer + scoreBot;
  const scoreFactor = 1 + totalScore * 0.05;

  ball.baseSpeed   = ORIGINAL_BALL_SPEED   * scoreFactor;
  bot.baseSpeed    = ORIGINAL_BOT_SPEED    * scoreFactor;
  player.baseSpeed = ORIGINAL_PLAYER_SPEED * scoreFactor;

  // Re-seed the difficulty baseline from the new score-adjusted base (not from the last peak)
  baseDifficulty = 1.0 * scoreFactor;
  difficultyMultiplier = baseDifficulty;

  // Reset scores and start new round without bumping base again here
  scorePlayer = 0;
  scoreBot = 0;

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

document.addEventListener('keydown', e => {
  if (e.code === 'ArrowUp') player.dy = -player.speed;
  else if (e.code === 'ArrowDown') player.dy = player.speed;

  if (e.code === 'Escape' && gameState === 'playing') gameState = 'paused';
  else if (e.code === 'Escape' && gameState === 'paused') gameState = 'playing';

  if (e.code === 'Space') {
    if (gameState === 'start' || gameState === 'gameover') resetGame();
  }
});

document.addEventListener('keyup', e => {
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') player.dy = 0;
});

requestAnimationFrame(loop);
