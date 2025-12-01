document.addEventListener('DOMContentLoaded', function () {
  const startOverlay = document.getElementById('start-overlay');
  const openLetter = document.getElementById('open-letter');
  const modal = document.getElementById('letter-modal');
  const modalClose = document.getElementById('modal-close');
  const slidesContainer = document.querySelector('#slideshow .slides');
  const nextBtn = document.querySelector('#slideshow .next');
  const prevBtn = document.querySelector('#slideshow .prev');

  // Audio context and state
  let audioCtx = null;
  let musicPlaying = false;
  let melodyTimeout = null;
  let melodyRunning = false;
  let micStream = null;
  let analyser = null;
  let rafId = null;

  // Simple Happy Birthday melody (approx values)
  const melody = [
    [392, 350], [392, 350], [440, 700], [392, 700], [523, 700], [494, 1400],
    [392, 350], [392, 350], [440, 700], [392, 700], [587, 700], [523, 1400],
    [392, 350], [392, 350], [784, 700], [659, 700], [523, 700], [494, 700], [440, 1400],
    [698, 350], [698, 350], [659, 700], [523, 700], [587, 700], [523, 1400]
  ];

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function playTone(freq, duration, time=0) {
    ensureAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime + time;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration / 1000 - 0.02);
    osc.start(now);
    osc.stop(now + duration / 1000 + 0.02);
  }

  function playMelodyLoop() {
    if (melodyRunning) return;
    melodyRunning = true;
    (function loop() {
      let t = 0;
      melody.forEach(([f,d]) => {
        playTone(f, d, t/1000);
        t += d + 40;
      });
      melodyTimeout = setTimeout(() => {
        if (melodyRunning) loop();
      }, t);
    })();
  }

  function stopMelody() {
    melodyRunning = false;
    if (melodyTimeout) clearTimeout(melodyTimeout);
  }

  // short puff noise
  function playPuff() {
    ensureAudio();
    const bufferSize = audioCtx.sampleRate * 0.2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.6;
    src.connect(gain); gain.connect(audioCtx.destination);
    src.start();
    src.stop(audioCtx.currentTime + 0.2);
  }

  // Mic-based blow detection
  let blowDetected = false;
  function startMicProcessing() {
    if (!navigator.mediaDevices || blowDetected) return;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      micStream = stream;
      ensureAudio();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      let highCount = 0;
      function monitor() {
        analyser.getByteTimeDomainData(data);
        // compute normalized RMS
        let sum = 0;
        for (let i=0;i<data.length;i++) { const v = (data[i]-128)/128; sum += v*v; }
        const rms = Math.sqrt(sum / data.length);
        // blowing often creates strong low-frequency energy; threshold tuned for mobile mics
        if (rms > 0.12) { highCount++; } else { highCount = Math.max(0, highCount-1); }
        if (highCount > 6 && !blowDetected) {
          blowDetected = true;
          extinguishCandles();
        }
        rafId = requestAnimationFrame(monitor);
      }
      monitor();
    }).catch(err => {
      console.warn('Microphone permission denied or error', err);
    });
  }

  function stopMic() {
    if (rafId) cancelAnimationFrame(rafId);
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    micStream = null;
  }

  function extinguishCandles() {
    // play puff, stop music, add extinguish class and show smoke
    playPuff();
    stopMelody();
    document.body.classList.add('extinguished');
    // create smoke
    const puff = document.createElement('div');
    puff.className = 'smoke';
    document.body.appendChild(puff);
    setTimeout(()=> puff.remove(), 2200);
    // after extinguish we can stop mic to be polite
    stopMic();
  }

  // Start on first user interaction
  function startAll() {
    if (musicPlaying) return;
    musicPlaying = true;
    ensureAudio();
    if (audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume();
    playMelodyLoop();
    startMicProcessing();
    if (startOverlay) startOverlay.style.display = 'none';
  }

  // click/tap on overlay or anywhere to start
  startOverlay.addEventListener('click', startAll);
  document.body.addEventListener('touchstart', startAll, { once: true });
  document.body.addEventListener('click', function startOnce() { startAll(); document.body.removeEventListener('click', startOnce); });

  // Modal + slideshow logic
  const slidePaths = [
    './assets/photo1.jpg', './assets/photo2.jpg', './assets/photo3.jpg',
    './assets/photo4.jpg', './assets/photo5.jpg', './assets/photo6.jpg'
  ];
  let slides = [];
  let current = 0;

  function loadSlides() {
    // try to load each image, add only loaded ones
    let loaded = 0;
    slidePaths.forEach((p, i) => {
      const img = new Image();
      img.src = p;
      img.onload = () => {
        slides.push(p);
        loaded++;
        if (i === slidePaths.length-1) renderSlides();
      };
      img.onerror = () => {
        // ignore missing files
        if (i === slidePaths.length-1) renderSlides();
      };
    });
    // safety render in 600ms if images don't call onload
    setTimeout(renderSlides, 600);
  }

  function renderSlides() {
    slidesContainer.innerHTML = '';
    if (slides.length === 0) {
      slidesContainer.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">No photos found.<br>Add <code>photo1.jpg</code>..<code>photo6.jpg</code> to <code>assets/</code></div>';
      return;
    }
    slides.forEach((src, idx) => {
      const img = document.createElement('img');
      img.src = src;
      img.dataset.index = idx;
      img.style.display = (idx===current)?'block':'none';
      slidesContainer.appendChild(img);
    });
  }

  function showSlide(i) {
    const imgs = slidesContainer.querySelectorAll('img');
    if (imgs.length===0) return;
    if (i < 0) i = imgs.length-1; if (i >= imgs.length) i = 0;
    current = i;
    imgs.forEach((im, idx) => im.style.display = (idx===current)?'block':'none');
  }

  nextBtn.addEventListener('click', ()=> { showSlide(current+1); });
  prevBtn.addEventListener('click', ()=> { showSlide(current-1); });

  openLetter.addEventListener('click', ()=>{
    modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
    loadSlides();
  });
  modalClose.addEventListener('click', ()=>{ modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); });
  modal.addEventListener('click', (e)=>{ if (e.target === modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); } });

  // Basic swipe support for slides
  let touchStartX = 0;
  slidesContainer.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; });
  slidesContainer.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (dx > 30) showSlide(current-1);
    else if (dx < -30) showSlide(current+1);
  });

});
