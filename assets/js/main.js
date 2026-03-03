/* ============================================================
   CLAUDE CODE GUIDE — Main JavaScript
   Navigation, particles, animations, utilities
   ============================================================ */

/* ---------- AOS (Animate on Scroll) — simple implementation ---------- */
const AOS = {
  init() {
    const els = document.querySelectorAll('[data-aos]');
    if (!els.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const delay = entry.target.dataset.aosDelay || 0;
          setTimeout(() => {
            entry.target.classList.add('aos-animate');
          }, parseInt(delay));
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

    els.forEach(el => observer.observe(el));
  }
};

/* ---------- Sidebar Navigation ---------- */
function initSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const toggle  = document.querySelector('.menu-toggle');
  const overlay = document.querySelector('.sidebar-overlay');

  if (toggle) {
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('visible');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
    });
  }

  // Highlight current page
  const current = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.sidebar-nav a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === current || (current === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
}

/* ---------- Particle Canvas Hero ---------- */
function initParticles(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let particles = [];
  let W, H;

  function resize() {
    W = canvas.width  = canvas.parentElement.offsetWidth;
    H = canvas.height = canvas.parentElement.offsetHeight;
  }

  function Particle() {
    this.x = Math.random() * W;
    this.y = Math.random() * H;
    this.r = Math.random() * 1.5 + 0.5;
    this.vx = (Math.random() - 0.5) * 0.4;
    this.vy = (Math.random() - 0.5) * 0.4;
    this.alpha = Math.random() * 0.6 + 0.2;
    this.color = Math.random() > 0.5 ? '0,212,255' : '124,58,237';
  }

  function spawn(n) {
    particles = [];
    for (let i = 0; i < n; i++) particles.push(new Particle());
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Draw connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 110) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(0,212,255,${0.08 * (1 - dist / 110)})`;
          ctx.lineWidth = 0.8;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Draw particles
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.color},${p.alpha})`;
      ctx.fill();

      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    });

    requestAnimationFrame(draw);
  }

  resize();
  spawn(70);
  draw();
  window.addEventListener('resize', () => { resize(); spawn(70); });
}

/* ---------- Code Copy ---------- */
function initCodeCopy() {
  document.querySelectorAll('.code-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const pre = btn.closest('.code-block').querySelector('pre');
      navigator.clipboard.writeText(pre.innerText).then(() => {
        const orig = btn.textContent;
        btn.textContent = '✓ Copied!';
        btn.style.color = '#10b981';
        setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2000);
      });
    });
  });
}

/* ---------- ELI5 animation on open ---------- */
function initELI5() {
  document.querySelectorAll('.eli5-card').forEach(details => {
    details.addEventListener('toggle', () => {
      if (details.open) {
        const body = details.querySelector('.eli5-body');
        if (body) {
          body.style.animation = 'none';
          body.offsetHeight; // reflow
          body.style.animation = 'eli5Reveal 0.35s ease-out forwards';
        }
      }
    });
  });
}

/* ---------- Sidebar Daily Sections ---------- */
function toggleDaily(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
}

async function initDailyTip() {
  try {
    const res  = await fetch('assets/data/daily-tips.json');
    const data = await res.json();

    // day 0=Sun…6=Sat → map to Mon=0…Sun=6 index
    const jsDay = new Date().getDay();
    const idx   = jsDay === 0 ? 6 : jsDay - 1;

    function renderTip(elId, tip) {
      const el = document.getElementById(elId);
      if (!el || !tip) return;
      el.innerHTML =
        `<strong>${tip.day}:</strong> ${tip.tip}` +
        (tip.example ? `<code>${tip.example}</code>` : '') +
        (tip.link    ? `<a href="${tip.link}">Learn more →</a>` : '');
    }

    if (data.setup)     renderTip('sd-tip-setup',      data.setup[idx]);
    if (data.practices) renderTip('sd-tip-practices',  data.practices[idx]);
    if (data.news)      renderTip('sd-tip-news',       data.news[idx]);

    // Auto-open all daily sections
    document.querySelectorAll('.sidebar-daily').forEach(el => el.classList.add('open'));

  } catch (e) {
    document.querySelectorAll('.sidebar-daily-content').forEach(el => {
      el.textContent = 'Tips unavailable';
    });
  }
}

/* ---------- Updates Feed (updates.html) ---------- */
async function loadUpdates() {
  const feed = document.getElementById('news-feed');
  if (!feed) return;

  try {
    const res  = await fetch('assets/data/updates.json');
    const data = await res.json();

    const filterBtns = document.querySelectorAll('[data-filter]');
    let current = 'all';
    let sourceCurrent = 'all';

    const sourceBtns = document.querySelectorAll('[data-source]');

    function render(catFilter, srcFilter) {
      feed.innerHTML = '';
      let items = catFilter === 'all'
        ? data.updates
        : data.updates.filter(u => u.category === catFilter);
      if (srcFilter && srcFilter !== 'all') {
        items = items.filter(u => u.source === srcFilter);
      }

      if (!items.length) {
        feed.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px 0">No updates in this category yet.</p>';
        return;
      }

      // Update filter button counts
      filterBtns.forEach(btn => {
        const f = btn.dataset.filter;
        if (f === 'all') { btn.dataset.count = data.updates.length; return; }
        const cnt = data.updates.filter(u => u.category === f).length;
        btn.dataset.count = cnt;
      });

      items.forEach((item, i) => {
        const el = document.createElement('article');
        el.className = `news-item ${item.category}`;
        el.setAttribute('data-aos', 'fade-up');
        el.setAttribute('data-aos-delay', i * 60);

        el.innerHTML = `
          <div class="news-meta">
            <span class="badge badge-${categoryBadge(item.category)}">${item.category}</span>
            ${item.source ? `<span class="badge badge-${item.source}">${item.source}</span>` : ''}
            <span class="news-date">${formatDate(item.date)}</span>
            ${item.readTime ? `<span class="news-read-time">⏱ ${item.readTime}</span>` : ''}
          </div>
          <div class="news-title">${item.icon || ''} ${item.title}</div>
          <div class="news-excerpt">${item.excerpt}</div>
          ${item.sourceUrl ? `<a href="${item.sourceUrl}" target="_blank" rel="noopener" class="news-source-link">View original →</a>` : ''}
          ${item.content ? `
            <details style="margin-top:12px">
              <summary style="cursor:pointer;color:var(--accent-cyan);font-size:0.82rem;font-weight:600">Read more ▾</summary>
              <div class="news-detail">${item.content}</div>
            </details>
          ` : ''}
        `;
        feed.appendChild(el);
      });

      AOS.init();
    }

    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        current = btn.dataset.filter;
        render(current, sourceCurrent);
      });
    });

    sourceBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        sourceBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        sourceCurrent = btn.dataset.source;
        render(current, sourceCurrent);
      });
    });

    render('all', 'all');

  } catch (e) {
    feed.innerHTML = '<p style="color:var(--text-muted);padding:24px">Could not load updates. Make sure updates.json is present.</p>';
  }
}

function categoryBadge(cat) {
  const map = { release: 'green', feature: 'cyan', update: 'purple', security: 'red', community: 'orange' };
  return map[cat] || 'cyan';
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/* ---------- CSS keyframe injected for ELI5 ---------- */
const style = document.createElement('style');
style.textContent = `
  @keyframes eli5Reveal {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;
document.head.appendChild(style);

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  AOS.init();
  initCodeCopy();
  initELI5();
  initParticles('hero-canvas');
  loadUpdates();
  initDailyTip();
});
