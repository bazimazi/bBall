const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

// Ball object
const ball = {
  x: WIDTH / 2,
  y: HEIGHT / 2,
  radius: 12,
  vx: 200,
  vy: 150
};

let lastTime = performance.now();

function update(dt) {
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // bounce on walls
  if (ball.x - ball.radius < 0 || ball.x + ball.radius > WIDTH) {
    ball.vx *= -1;
  }
  if (ball.y - ball.radius < 0 || ball.y + ball.radius > HEIGHT) {
    ball.vy *= -1;
  }
}

function draw() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();
}

function loop(timestamp) {
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
