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
