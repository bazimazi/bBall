const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const player = {
  x: 40,
  y: HEIGHT / 2 - 50,
  width: 15,
  height: 100,
  speed: 300,
  dy: 0
};

const bot = {
  x: WIDTH - 55,
  y: HEIGHT / 2 - 50,
  width: 15,
  height: 100,
  speed: 250
};

const ball = {
  x: WIDTH / 2,
  y: HEIGHT / 2,
  radius: 10,
  vx: 250,
  vy: 180
};

let scoreBot = 0;
let scorePlayer = 0;
let lastTime = performance.now();

function update(dt) {
  // move player
  player.y += player.dy * dt;
  if (player.y < 0) player.y = 0;
  if (player.y + player.height > HEIGHT) player.y = HEIGHT - player.height;

  // move bot (simple tracking)
  const botCenter = bot.y + bot.height / 2;
  if (ball.y < botCenter - 10) bot.y -= bot.speed * dt;
  else if (ball.y > botCenter + 10) bot.y += bot.speed * dt;
  if (bot.y < 0) bot.y = 0;
  if (bot.y + bot.height > HEIGHT) bot.y = HEIGHT - bot.height;

  // move ball
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // bounce top/bottom
  if (ball.y - ball.radius < 0 || ball.y + ball.radius > HEIGHT) {
    ball.vy *= -1;
  }

  // player collision
  if (
    ball.x - ball.radius < player.x + player.width &&
    ball.y > player.y &&
    ball.y < player.y + player.height
  ) {
    ball.vx = Math.abs(ball.vx);
    const hit = (ball.y - (player.y + player.height / 2)) / (player.height / 2);
    ball.vy = hit * 200;
  }

  // bot collision
  if (
    ball.x + ball.radius > bot.x &&
    ball.y > bot.y &&
    ball.y < bot.y + bot.height
  ) {
    ball.vx = -Math.abs(ball.vx);
    const hit = (ball.y - (bot.y + bot.height / 2)) / (bot.height / 2);
    ball.vy = hit * 200;
  }

  // scoring
  if (ball.x + ball.radius < 0) {
    scoreBot++;
    resetBall(-1);
  } else if (ball.x - ball.radius > WIDTH) {
    scorePlayer++;
    resetBall(1);
  }
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = 'white';

  // mid line
  for (let y = 0; y < HEIGHT; y += 30) {
    ctx.fillRect(WIDTH / 2 - 1, y, 2, 20);
  }

  // paddles
  ctx.fillRect(player.x, player.y, player.width, player.height);
  ctx.fillRect(bot.x, bot.y, bot.width, bot.height);

  // ball
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();

  // scores
  ctx.font = '32px monospace';
  ctx.fillText(scorePlayer, WIDTH / 2 - 60, 40);
  ctx.fillText(scoreBot, WIDTH / 2 + 40, 40);
}

function resetBall(direction = 1) {
  ball.x = WIDTH / 2;
  ball.y = HEIGHT / 2;
  ball.vx = 250 * direction;
  ball.vy = 150 * (Math.random() > 0.5 ? 1 : -1);
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
});

document.addEventListener('keyup', e => {
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') player.dy = 0;
});

requestAnimationFrame(loop);
