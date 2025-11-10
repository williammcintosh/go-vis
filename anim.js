export function launchConfetti() {
  const confetti = document.createElement('canvas');
  confetti.id = 'confettiCanvas';
  confetti.style.position = 'fixed';
  confetti.style.left = 0;
  confetti.style.top = 0;
  confetti.style.pointerEvents = 'none';
  confetti.width = window.innerWidth;
  confetti.height = window.innerHeight;
  document.body.appendChild(confetti);

  const ctx = confetti.getContext('2d');
  const pieces = Array.from({ length: 100 }, () => ({
    x: Math.random() * confetti.width,
    y: Math.random() * confetti.height - confetti.height,
    r: Math.random() * 6 + 2,
    d: Math.random() * 2 + 1,
    color: `hsl(${Math.random() * 360}, 100%, 50%)`,
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, confetti.width, confetti.height);
    pieces.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    });
    update();
    if (frame++ < 150) requestAnimationFrame(draw);
    else confetti.remove();
  }

  function update() {
    pieces.forEach((p) => {
      p.y += p.d * 3;
      p.x += Math.sin(p.y * 0.02);
      if (p.y > confetti.height) p.y = -10;
    });
  }

  draw();
}
