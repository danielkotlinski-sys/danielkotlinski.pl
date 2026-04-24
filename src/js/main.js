// ===== NAVBAR SCROLL EFFECT =====
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
});

// ===== MOBILE MENU =====
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');
const mobileClose = document.getElementById('mobile-close');

if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    mobileMenu.classList.add('active');
    document.body.style.overflow = 'hidden';
  });

  const closeMenu = () => {
    mobileMenu.classList.remove('active');
    document.body.style.overflow = '';
  };

  if (mobileClose) mobileClose.addEventListener('click', closeMenu);

  // Close on link click
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMenu);
  });
}

// ===== SCROLL REVEAL ANIMATION =====
const revealElements = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.1,
  rootMargin: '0px 0px -40px 0px'
});

revealElements.forEach(el => revealObserver.observe(el));

// ===== PROCESS TIMELINE TOGGLE =====
document.querySelectorAll('.process-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const card = btn.closest('.pricing-card');
    const timeline = card.querySelector('.process-timeline');
    const isOpen = btn.getAttribute('aria-expanded') === 'true';

    // Close all other open timelines
    document.querySelectorAll('.process-toggle[aria-expanded="true"]').forEach(otherBtn => {
      if (otherBtn !== btn) {
        otherBtn.setAttribute('aria-expanded', 'false');
        otherBtn.querySelector('.process-toggle__text').textContent = 'Zobacz jak wygląda proces';
        const otherTimeline = otherBtn.closest('.pricing-card').querySelector('.process-timeline');
        otherTimeline.classList.remove('is-open');
      }
    });

    // Toggle current
    btn.setAttribute('aria-expanded', !isOpen);
    btn.querySelector('.process-toggle__text').textContent = isOpen ? 'Zobacz jak wygląda proces' : 'Ukryj proces';
    timeline.classList.toggle('is-open', !isOpen);

    // Reset scroll to start when opening
    if (!isOpen) {
      var inner = timeline.querySelector('.process-timeline__inner');
      if (inner) inner.scrollLeft = 0;
    }
  });
});

// ===== CONTACT DRAWER =====
const drawer = document.getElementById('contact-drawer');
const overlay = document.getElementById('drawer-overlay');
const drawerClose = document.getElementById('drawer-close');
const serviceName = document.getElementById('drawer-service-name');
const serviceInput = document.getElementById('drawer-service-input');

function openDrawer(service) {
  if (!drawer) return;
  serviceName.textContent = service;
  serviceInput.value = service;
  // Reset form state if previously submitted
  if (drawerForm && drawerFormSuccess) {
    drawerForm.hidden = false;
    drawerForm.reset();
    var btn = drawerForm.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = false; btn.textContent = 'Wyślij zapytanie'; }
    drawerFormSuccess.hidden = true;
  }
  drawer.classList.add('is-open');
  drawer.setAttribute('aria-hidden', 'false');
  overlay.classList.add('is-active');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  if (!drawer) return;
  drawer.classList.remove('is-open');
  drawer.setAttribute('aria-hidden', 'true');
  overlay.classList.remove('is-active');
  document.body.style.overflow = '';
}

// Trigger buttons
document.querySelectorAll('.drawer-trigger').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    openDrawer(btn.dataset.service);
  });
});

// Close handlers
if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
if (overlay) overlay.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
});

// ===== LEAD MAGNET POPUP =====
const lmPopup = document.getElementById('lead-magnet-popup');
const lmOverlay = document.getElementById('lead-magnet-overlay');
const lmOpen = document.getElementById('lead-magnet-open');
const lmClose = document.getElementById('lead-magnet-close');

function openPopup() {
  if (!lmPopup) return;
  lmPopup.classList.add('is-open');
  lmPopup.setAttribute('aria-hidden', 'false');
  lmOverlay.classList.add('is-active');
  document.body.style.overflow = 'hidden';
}

function closePopup() {
  if (!lmPopup) return;
  lmPopup.classList.remove('is-open');
  lmPopup.setAttribute('aria-hidden', 'true');
  lmOverlay.classList.remove('is-active');
  document.body.style.overflow = '';
}

if (lmOpen) lmOpen.addEventListener('click', openPopup);
if (lmClose) lmClose.addEventListener('click', closePopup);
if (lmOverlay) lmOverlay.addEventListener('click', closePopup);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && lmPopup && lmPopup.classList.contains('is-open')) closePopup();
});

// ===== ANTI-SPAM + FORM SUBMIT HELPERS =====
const FORM_MIN_FILL_MS = 3000;
const URL_PATTERN = /(https?:\/\/|www\.|<a\s|\[url)/i;

function isLikelySpam(form) {
  const hp = form.querySelector('input[name="_gotcha"]');
  if (hp && hp.value) return true;

  const startedAt = Number(form.dataset.startedAt || 0);
  if (startedAt && Date.now() - startedAt < FORM_MIN_FILL_MS) return true;

  const nameFields = form.querySelectorAll('input[name="firstName"], input[name="lastName"], input[name="name"]');
  for (const field of nameFields) {
    if (URL_PATTERN.test(field.value)) return true;
  }
  return false;
}

function initForm(form, successEl) {
  if (!form || !successEl) return;
  form.dataset.startedAt = String(Date.now());

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');

    if (isLikelySpam(form)) {
      // Silently "succeed" — don't give bots feedback.
      form.hidden = true;
      successEl.hidden = false;
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Wysyłanie...';

    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { 'Accept': 'application/json' }
    }).then(function(response) {
      if (response.ok) {
        form.hidden = true;
        successEl.hidden = false;
      } else {
        btn.disabled = false;
        btn.textContent = 'Wyślij zapytanie';
        alert('Coś poszło nie tak. Spróbuj ponownie.');
      }
    }).catch(function() {
      btn.disabled = false;
      btn.textContent = 'Wyślij zapytanie';
      alert('Błąd połączenia. Spróbuj ponownie.');
    });
  });
}

const contactForm = document.getElementById('contactForm');
const contactFormSuccess = document.getElementById('contactFormSuccess');
initForm(contactForm, contactFormSuccess);

const drawerForm = document.getElementById('drawer-form');
const drawerFormSuccess = document.getElementById('drawer-form-success');
initForm(drawerForm, drawerFormSuccess);

// ===== SMOOTH SCROLL FOR ANCHOR LINKS =====
document.querySelectorAll('a[href^="/#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    // Only handle if we're on the homepage
    if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
      e.preventDefault();
      const targetId = this.getAttribute('href').replace('/', '');
      const target = document.querySelector(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });
});
