const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const paddle = {
  x: 40,
  y: HEIGHT / 2 - 50,
  width: 15,
  height: 100,
  speed: 300,
  dy: 0
};

const ball = {
  x: WIDTH / 2,
  y: HEIGHT / 2,
  radius: 10,
  vx: 250,
  vy: 180
};

let lastTime = performance.now();

function update(dt) {
  // move paddle
  paddle.y += paddle.dy * dt;
  if (paddle.y < 0) paddle.y = 0;
  if (paddle.y + paddle.height > HEIGHT) paddle.y = HEIGHT - paddle.height;

  // move ball
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // bounce top/bottom
  if (ball.y - ball.radius < 0 || ball.y + ball.radius > HEIGHT) {
    ball.vy *= -1;
  }

  // bounce off right wall
  if (ball.x + ball.radius > WIDTH) {
    ball.vx *= -1;
  }

  // ball–paddle collision
  if (
    ball.x - ball.radius < paddle.x + paddle.width &&
    ball.y > paddle.y &&
    ball.y < paddle.y + paddle.height
  ) {
    ball.vx = Math.abs(ball.vx); // ensure it goes right
    // add some angle variation based on hit position
    const hitPos = (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);
    ball.vy = hitPos * 200;
  }

  // ball reset if it goes off left edge
  if (ball.x + ball.radius < 0) {
    resetBall();
  }
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = 'white';

  // draw paddle
  ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);

  // draw ball
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();
}

function resetBall() {
  ball.x = WIDTH / 2;
  ball.y = HEIGHT / 2;
  ball.vx = 250 * (Math.random() > 0.5 ? 1 : -1);
  ball.vy = 180 * (Math.random() > 0.5 ? 1 : -1);
}

function loop(timestamp) {
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// input
document.addEventListener('keydown', e => {
  if (e.code === 'ArrowUp') paddle.dy = -paddle.speed;
  else if (e.code === 'ArrowDown') paddle.dy = paddle.speed;
});

document.addEventListener('keyup', e => {
  if (e.code === 'ArrowUp' || e.code === 'ArrowDown') paddle.dy = 0;
});

requestAnimationFrame(loop);
