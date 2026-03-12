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
        btn.textContent = '\u2713 Copied!';
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
          body.offsetHeight;
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

    const jsDay = new Date().getDay();
    const idx   = jsDay === 0 ? 6 : jsDay - 1;

    function renderTip(elId, tip) {
      const el = document.getElementById(elId);
      if (!el || !tip) return;
      el.innerHTML =
        `<strong>${tip.day}:</strong> ${tip.tip}` +
        (tip.example ? `<code>${tip.example}</code>` : '') +
        (tip.link    ? `<a href="${tip.link}">Learn more \u2192</a>` : '');
    }

    if (data.setup)     renderTip('sd-tip-setup',      data.setup[idx]);
    if (data.practices) renderTip('sd-tip-practices',  data.practices[idx]);
    if (data.news)      renderTip('sd-tip-news',       data.news[idx]);

    document.querySelectorAll('.sidebar-daily').forEach(el => el.classList.add('open'));

  } catch (e) {
    document.querySelectorAll('.sidebar-daily-content').forEach(el => {
      el.textContent = 'Tips unavailable';
    });
  }
}

/* ---------- Digest Tab Switcher ---------- */
function switchDigestTab(panel, btn) {
  document.querySelectorAll('.digest-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.digest-tab').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('digest-' + panel);
  if (el) el.classList.add('active');
  if (btn) btn.classList.add('active');
}

/* ---------- Load Digest (updates.html) ---------- */
async function loadDigest() {
  try {
    const res  = await fetch('assets/data/updates.json');
    const data = await res.json();
    const all  = data.updates || [];

    const research  = all.filter(u => u.category === 'research')
                         .sort((a,b) => new Date(b.date) - new Date(a.date))
                         .slice(0, 5);
    const articles  = all.filter(u => ['release','feature','update','security'].includes(u.category))
                         .sort((a,b) => new Date(b.date) - new Date(a.date))
                         .slice(0, 5);
    const community = all.filter(u => u.category === 'community')
                         .sort((a,b) => new Date(b.date) - new Date(a.date))
                         .slice(0, 5);

    function renderDigestList(containerId, items) {
      const el = document.getElementById(containerId);
      if (!el) return;
      el.innerHTML = items.map((item, i) => {
        const url  = item.arxivUrl || item.sourceUrl || '#';
        const srcCls = item.source === 'arxiv'    ? 'dsb-arxiv'
                     : item.source === 'official' ? 'dsb-official'
                     : item.source === 'reddit'   ? 'dsb-reddit'
                     : 'dsb-community';
        const srcLabel = item.source === 'arxiv' ? 'arXiv'
                       : item.source === 'official' ? 'Official'
                       : item.source === 'reddit'   ? 'Reddit'
                       : item.source;
        return `
          <div class="digest-ranked-item">
            <span class="digest-rank">#${i+1}</span>
            <span class="digest-item-icon">${item.icon || ''}</span>
            <div class="digest-item-body">
              <a href="${url}" target="_blank" rel="noopener" class="digest-item-title">${item.title}</a>
              <div class="digest-item-excerpt">${item.excerpt}</div>
              <span class="digest-source-badge ${srcCls}">${srcLabel}</span>
            </div>
          </div>`;
      }).join('');
    }

    renderDigestList('digest-research',  research);
    renderDigestList('digest-articles',  articles);
    renderDigestList('digest-community', community);

  } catch(e) {
    ['digest-research','digest-articles','digest-community'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<p style="color:var(--text-muted);padding:16px">Could not load digest.</p>';
    });
  }
}

/* ---------- Load Research Papers (updates.html) ---------- */
async function loadResearchPapers() {
  const container = document.getElementById('research-papers');
  if (!container) return;

  try {
    const res  = await fetch('assets/data/updates.json');
    const data = await res.json();
    const papers = (data.updates || [])
      .filter(u => u.category === 'research')
      .sort((a,b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5);

    const insightMap = {
      'Agentless': "Don't over-engineer your agent pipelines. A simple localise-then-repair loop often outperforms complex multi-step frameworks at a fraction of the cost.",
      'SWE-agent': "Tool interface design is as important as model choice. Constrain your agents to Read/Grep/Edit and watch reliability improve.",
      'ReAct': "The think-then-act loop is the foundation of every Claude Code session. Write CLAUDE.md instructions in step-by-step form to exploit this pattern.",
      'Toolformer': "Write your SKILL.md tool descriptions like Toolformer training examples — clear, consistent, with usage examples. Claude was trained on this pattern.",
      'Constitutional': "Write your CLAUDE.md 'Do Not' rules constitutionally — clear, specific, with the reason stated. This matches how Claude was trained to follow principles."
    };

    function getInsight(title) {
      for (const [k, v] of Object.entries(insightMap)) {
        if (title.includes(k)) return v;
      }
      return paper.excerpt;
    }

    const yearMap = {
      'Agentless': '2024', 'SWE-agent': '2024', 'ReAct': '2022',
      'Toolformer': '2023', 'Constitutional': '2022'
    };
    function getYear(title) {
      for (const [k, v] of Object.entries(yearMap)) {
        if (title.includes(k)) return v;
      }
      return new Date(papers[0].date).getFullYear();
    }

    container.innerHTML = papers.map((paper, i) => `
      <div class="research-card" data-aos="fade-up" data-aos-delay="${i * 80}">
        <div class="research-card-header">
          <a href="${paper.arxivUrl || paper.sourceUrl}" target="_blank" rel="noopener" class="research-title">${paper.title}</a>
          <span class="research-year-badge">${getYear(paper.title)}</span>
        </div>
        <div class="research-authors">${paper.authors || ''}</div>
        <div class="research-abstract">${paper.abstract || paper.excerpt}</div>
        <div class="research-insight">
          <strong>Key Insight for Claude Code:</strong> ${getInsight(paper.title)}
        </div>
        <a href="${paper.arxivUrl || paper.sourceUrl}" target="_blank" rel="noopener" class="research-read-btn">
          Read Paper \u2192
        </a>
      </div>
    `).join('');

    AOS.init();
  } catch(e) {
    container.innerHTML = '<p style="color:var(--text-muted)">Could not load research papers.</p>';
  }
}

/* ---------- Updates Feed (updates.html) ---------- */
async function loadUpdates() {
  const feed = document.getElementById('news-feed');
  if (!feed) return;

  try {
    const res  = await fetch('assets/data/updates.json');
    const data = await res.json();

    const filterBtns  = document.querySelectorAll('[data-filter]');
    const sourceBtns  = document.querySelectorAll('[data-source]');
    let current       = 'all';
    let sourceCurrent = 'all';

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

      filterBtns.forEach(btn => {
        const f = btn.dataset.filter;
        if (!f) return;
        if (f === 'all') { btn.dataset.count = data.updates.length; return; }
        btn.dataset.count = data.updates.filter(u => u.category === f).length;
      });

      items.forEach((item, i) => {
        const el = document.createElement('article');
        el.className = `news-item ${item.category}`;
        el.setAttribute('data-aos', 'fade-up');
        el.setAttribute('data-aos-delay', i * 60);

        const linkUrl = item.arxivUrl || item.sourceUrl;

        // Extra fields for research items
        const authorsHtml = item.authors
          ? `<span style="font-size:0.78rem;color:var(--text-muted);margin-left:8px">${item.authors}</span>` : '';

        el.innerHTML = `
          <div class="news-meta">
            <span class="badge badge-${categoryBadge(item.category)}">${item.category}</span>
            ${item.source ? `<span class="badge badge-${item.source === 'arxiv' ? 'purple' : item.source}">${item.source}</span>` : ''}
            <span class="news-date">${formatDate(item.date)}</span>
            ${item.readTime ? `<span class="news-read-time">\u23f1 ${item.readTime}</span>` : ''}
            ${authorsHtml}
          </div>
          <div class="news-title">${item.icon || ''} ${item.title}</div>
          <div class="news-excerpt">${item.excerpt}</div>
          ${linkUrl ? `<a href="${linkUrl}" target="_blank" rel="noopener" class="news-source-link">View original \u2192</a>` : ''}
          ${item.content ? `
            <details style="margin-top:12px">
              <summary style="cursor:pointer;color:var(--accent-cyan);font-size:0.82rem;font-weight:600">Read more \u25be</summary>
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
  const map = {
    release: 'green', feature: 'cyan', update: 'purple',
    security: 'red', community: 'orange', research: 'purple'
  };
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
  loadDigest();
  loadResearchPapers();
  initDailyTip();
});
