// Lightbox – fullscreen on image click
(function initLightbox() {
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.innerHTML = '<div class="lightbox__inner"><button type="button" class="lightbox__close" aria-label="Close">&times;</button><img class="lightbox__img" src="" alt=""><p class="lightbox__title"></p></div>';
  document.body.appendChild(lightbox);
  const img = lightbox.querySelector('.lightbox__img');
  const closeBtn = lightbox.querySelector('.lightbox__close');
  const titleEl = lightbox.querySelector('.lightbox__title');

  function open(src, rotationClass, title) {
    img.src = src;
    img.alt = title || '';
    img.className = 'lightbox__img';
    if (rotationClass) img.classList.add(rotationClass);
    if (titleEl) {
      titleEl.textContent = title || '';
      titleEl.style.display = title ? 'block' : 'none';
    }
    lightbox.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    lightbox.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  document.querySelectorAll('.gallery .artwork-frame').forEach(frame => {
    frame.style.cursor = 'pointer';
    frame.addEventListener('click', (e) => {
      if (e.target.closest('.artwork-rotate-btn')) return;
      const im = frame.querySelector('img');
      if (!im || !im.src) return;
      const artwork = frame.closest('.artwork');
      const titleEl = artwork?.querySelector('.artwork-title');
      const title = (titleEl && !titleEl.classList.contains('artwork-title--hidden')) ? titleEl.textContent.trim() : '';
      const rot = frame.classList.contains('artwork-frame--rotate-cw') ? 'lightbox__img--rotate-cw' :
        frame.classList.contains('artwork-frame--rotate-180') ? 'lightbox__img--rotate-180' :
        (frame.classList.contains('artwork-frame--rotate-270') || frame.classList.contains('artwork-frame--rotate-ccw')) ? 'lightbox__img--rotate-270' : null;
      open(im.src, rot, title);
    });
  });
})();

// Mobile navigation toggle
document.querySelectorAll('.nav-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('.nav-links')?.classList.toggle('open');
  });
});

// Close mobile nav when clicking a link
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelector('.nav-links')?.classList.remove('open');
  });
});

// Edit mode – password-protected reordering only
const PASSWORD_HASH = '64fdd8b8fa16baaf65e380d1ab90e373bd567811ca37b22ed66afab7ebe3f11e'; // SHA-256 of "author"
const STORAGE_KEY = 'artPortfolioEdits';
const EDIT_SESSION_KEY = 'artPortfolioEditMode';

function getStoredEdits() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveEdit(key, field, value) {
  const sanitized = String(value).replace(/<[^>]*>/g, '');
  const edits = getStoredEdits();
  if (!edits[key]) edits[key] = {};
  edits[key][field] = sanitized;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
}

function makeEditable(el, storageKey, field) {
  if (!el) return;
  el.contentEditable = 'true';
  el.addEventListener('blur', () => saveEdit(storageKey, field, el.textContent.trim()));
}

function updateUnnamedVisibility() {
  document.querySelectorAll('.artwork .artwork-title').forEach(t => {
    t.classList.toggle('artwork-title--hidden', t.textContent.trim() === 'Unnamed');
  });
}

function saveGalleryOrder(galleryId, order) {
  const edits = getStoredEdits();
  const key = galleryId === 'photographyGallery' ? 'photographyOrder' : 'artworksOrder';
  edits[key] = order;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
}

const ROTATIONS = ['0', '90', '180', '270'];
function getNextRotation(current) {
  const i = ROTATIONS.indexOf(String(current || '0'));
  return ROTATIONS[(i + 1) % 4];
}

function applyRotation(frame, deg) {
  frame.classList.remove('artwork-frame--rotate-cw', 'artwork-frame--rotate-ccw', 'artwork-frame--rotate-180', 'artwork-frame--rotate-270');
  if (deg === '90') frame.classList.add('artwork-frame--rotate-cw');
  else if (deg === '180') frame.classList.add('artwork-frame--rotate-180');
  else if (deg === '270') frame.classList.add('artwork-frame--rotate-270');
}

function applyGalleryOrder(gallery) {
  if (!gallery) return;
  const edits = getStoredEdits();
  const key = gallery.id === 'photographyGallery' ? 'photographyOrder' : 'artworksOrder';
  const order = edits[key];
  const artworks = [...gallery.querySelectorAll('.artwork')];
  const bySrc = {};
  artworks.forEach(a => {
    const img = a.querySelector('.artwork-frame img');
    if (img) {
      bySrc[img.getAttribute('src')] = a;
      const frame = a.querySelector('.artwork-frame');
      if (frame) {
        applyRotation(frame, '0');
      }
    }
  });
  const sorted = order && Array.isArray(order)
    ? order.filter(src => bySrc[src]).concat(Object.keys(bySrc).filter(src => !order.includes(src)))
    : Object.keys(bySrc);
  sorted.forEach(src => { if (bySrc[src]) gallery.appendChild(bySrc[src]); });
}

async function hash(str) {
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function isEditMode() {
  return sessionStorage.getItem(EDIT_SESSION_KEY) === '1';
}

function enterEditMode() {
  sessionStorage.setItem(EDIT_SESSION_KEY, '1');
  document.body.classList.add('edit-mode');
  const btn = document.getElementById('editModeBtn');
  if (btn) {
    btn.textContent = 'Done editing';
    btn.classList.add('edit-mode');
  }

  [document.getElementById('artworksGallery'), document.getElementById('photographyGallery')].forEach(gallery => {
    if (!gallery) return;

    gallery.querySelectorAll('.artwork').forEach(artwork => {
      const frame = artwork.querySelector('.artwork-frame');
      const img = frame?.querySelector('img');
      if (!frame || !img) return;
      let handle = frame.querySelector('.artwork-drag-handle');
      if (!handle) {
        handle = document.createElement('div');
        handle.className = 'artwork-drag-handle';
        frame.prepend(handle);
      }
      handle.draggable = true;
      img.draggable = false;

      let rotBtn = frame.querySelector('.artwork-rotate-btn');
      if (!rotBtn) {
        rotBtn = document.createElement('button');
        rotBtn.type = 'button';
        rotBtn.className = 'artwork-rotate-btn';
        rotBtn.title = 'Rotate';
        rotBtn.innerHTML = '↻';
        rotBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const imgSrc = img.getAttribute('src');
          const edits = getStoredEdits();
          const current = edits[imgSrc]?.rotation || '0';
          const next = getNextRotation(current);
          saveEdit(imgSrc, 'rotation', next);
          applyRotation(frame, next);
        });
        frame.appendChild(rotBtn);
      }

      const title = artwork.querySelector('.artwork-title');
      if (title) {
        title.contentEditable = 'true';
        title.addEventListener('blur', () => {
          saveEdit(img.getAttribute('src'), 'title', title.textContent.trim());
          updateUnnamedVisibility();
        });
      }
    });

    document.querySelectorAll('.artwork-title--hidden').forEach(t => t.classList.remove('artwork-title--hidden'));

    let placeholder = null;
    const key = gallery.id === 'photographyGallery' ? 'photographyOrder' : 'artworksOrder';

    const getInsertIndex = (x, y) => {
      const items = [...gallery.querySelectorAll('.artwork:not(.artwork-dragging)')];
      if (!items.length) return 0;
      for (let i = 0; i < items.length; i++) {
        const r = items[i].getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          return y < r.top + r.height / 2 ? i : i + 1;
        }
      }
      let best = 0, bestDist = Infinity;
      for (let i = 0; i < items.length; i++) {
        const r = items[i].getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const d = Math.hypot(x - cx, y - cy);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      const r = items[best].getBoundingClientRect();
      return y < r.top + r.height / 2 ? best : best + 1;
    };

    const showPlaceholder = (x, y) => {
      const items = [...gallery.querySelectorAll('.artwork:not(.artwork-dragging)')];
      const idx = getInsertIndex(x, y);
      if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.className = 'artwork-drop-placeholder';
      }
      gallery.insertBefore(placeholder, items[idx] || null);
      placeholder.classList.add('artwork-drop-placeholder--visible');
    };

    const hidePlaceholder = () => {
      if (placeholder?.parentNode) {
        placeholder.classList.remove('artwork-drop-placeholder--visible');
        placeholder.remove();
      }
    };

    gallery.ondragstart = (e) => {
      const handle = e.target.closest('.artwork-drag-handle');
      if (!handle) return;
      const artwork = handle.closest('.artwork');
      if (!artwork) return;
      artwork.classList.add('artwork-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
      const frame = artwork.querySelector('.artwork-frame');
      if (frame) {
        const ghost = frame.cloneNode(true);
        ghost.querySelector('.artwork-drag-handle')?.remove();
        ghost.querySelector('.artwork-rotate-btn')?.remove();
        ghost.style.cssText = 'position:absolute;top:-9999px;left:0;width:' + frame.offsetWidth + 'px;height:' + frame.offsetHeight + 'px;opacity:0.9;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,0.15);';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, frame.offsetWidth / 2, frame.offsetHeight / 2);
        setTimeout(() => ghost.remove(), 0);
      }
    };

    gallery.ondragend = () => {
      gallery.querySelectorAll('.artwork-dragging').forEach(a => a.classList.remove('artwork-dragging'));
      hidePlaceholder();
    };

    gallery.ondragover = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (gallery.querySelector('.artwork-dragging')) showPlaceholder(e.clientX, e.clientY);
    };

    gallery.ondragleave = (e) => {
      if (!gallery.contains(e.relatedTarget)) hidePlaceholder();
    };

    gallery.ondrop = (e) => {
      e.preventDefault();
      const artwork = gallery.querySelector('.artwork-dragging');
      if (!artwork) return;
      hidePlaceholder();
      const items = [...gallery.querySelectorAll('.artwork:not(.artwork-dragging)')];
      const idx = getInsertIndex(e.clientX, e.clientY);
      gallery.insertBefore(artwork, items[idx] || null);
      const order = [...gallery.querySelectorAll('.artwork')].map(a => a.querySelector('.artwork-frame img')?.getAttribute('src')).filter(Boolean);
      saveGalleryOrder(gallery.id, order);
    };
  });

  makeEditable(document.getElementById('navLogo'), 'global', 'navLogo');
  makeEditable(document.getElementById('navLinkArtworks'), 'global', 'navLinkArtworks');
  makeEditable(document.getElementById('navLinkPhotography'), 'global', 'navLinkPhotography');
  makeEditable(document.getElementById('navLinkContact'), 'global', 'navLinkContact');
  makeEditable(document.getElementById('footerText'), 'global', 'footerText');
  makeEditable(document.getElementById('contactLabel'), 'contactPage', 'label');
  const contactEmailEl = document.getElementById('contactEmail');
  if (contactEmailEl) {
    contactEmailEl.contentEditable = 'true';
    contactEmailEl.addEventListener('blur', () => {
      const email = contactEmailEl.textContent.trim();
      saveEdit('contactPage', 'email', email);
      contactEmailEl.href = 'mailto:' + email;
    });
  }
  makeEditable(document.getElementById('contactBox'), 'contactPage', 'box');
}

function exitEditMode() {
  sessionStorage.removeItem(EDIT_SESSION_KEY);
  document.body.classList.remove('edit-mode');
  const btn = document.getElementById('editModeBtn');
  if (btn) {
    btn.textContent = 'Edit';
    btn.classList.remove('edit-mode');
  }
  document.querySelectorAll('.artwork-drag-handle').forEach(h => { h.draggable = false; });
  document.querySelectorAll('.gallery .artwork-frame img').forEach(img => { img.draggable = true; });
  [document.getElementById('artworksGallery'), document.getElementById('photographyGallery')].forEach(g => {
    if (g) { g.ondragstart = g.ondragend = g.ondragover = g.ondragleave = g.ondrop = null; }
  });
  updateUnnamedVisibility();
  ['.artwork-title', '#navLogo', '#navLinkArtworks', '#navLinkPhotography', '#navLinkContact', '#footerText', '#contactLabel', '#contactEmail', '#contactBox'].forEach(sel => {
    document.querySelectorAll(sel).forEach(el => { if (el) el.contentEditable = 'false'; });
  });
  saveEditsToFiles();
}

function saveEditsToFiles() {
  const edits = getStoredEdits();
  fetch('/api/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(edits),
  }).then((res) => {
    if (res.ok) {
      const msg = document.createElement('div');
      msg.textContent = 'Changes saved to files.';
      msg.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:0.5rem 1rem;border-radius:4px;font-size:0.9rem;z-index:9999;';
      document.body.appendChild(msg);
      setTimeout(() => msg.remove(), 2500);
    }
  }).catch(() => {});
}

function loadStoredEdits() {
  const edits = getStoredEdits();
  const g = document.getElementById('galleryTitle');
  if (g && edits.galleryHeader?.title) g.textContent = edits.galleryHeader.title;
  const p = document.getElementById('photographyTitle');
  if (p && edits.photographyHeader?.title) p.textContent = edits.photographyHeader.title;
  const gl = edits.global;
  if (gl) {
    const nl = document.getElementById('navLogo'); if (nl && gl.navLogo) nl.textContent = gl.navLogo;
    const na = document.getElementById('navLinkArtworks'); if (na && gl.navLinkArtworks) na.textContent = gl.navLinkArtworks;
    const np = document.getElementById('navLinkPhotography'); if (np && gl.navLinkPhotography) np.textContent = gl.navLinkPhotography;
    const nc = document.getElementById('navLinkContact'); if (nc && gl.navLinkContact) nc.textContent = gl.navLinkContact;
    const ft = document.getElementById('footerText'); if (ft && gl.footerText) ft.textContent = gl.footerText;
  }
  const cp = edits.contactPage;
  if (cp) {
    const cl = document.getElementById('contactLabel'); if (cl && cp.label) cl.textContent = cp.label;
    const ce = document.getElementById('contactEmail');
    if (ce && cp.email) {
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      ce.href = 'mailto:' + esc(cp.email);
      ce.textContent = cp.email;
    }
    const cb = document.getElementById('contactBox'); if (cb && cp.box) cb.textContent = cp.box;
  }
  document.querySelectorAll('.gallery .artwork').forEach(artwork => {
    const img = artwork.querySelector('.artwork-frame img');
    const title = artwork.querySelector('.artwork-title');
    if (img && title && edits[img.getAttribute('src')]?.title) {
      title.textContent = edits[img.getAttribute('src')].title;
    }
  });
}

function initEditMode() {
  const btn = document.getElementById('editModeBtn');
  if (!btn) return;

  loadStoredEdits();
  const edits = getStoredEdits();
  let rotationCleared = false;
  for (const key of Object.keys(edits)) {
    if (edits[key] && typeof edits[key].rotation !== 'undefined') {
      delete edits[key].rotation;
      rotationCleared = true;
    }
  }
  if (rotationCleared) localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
  updateUnnamedVisibility();
  [document.getElementById('artworksGallery'), document.getElementById('photographyGallery')].forEach(g => {
    if (g) applyGalleryOrder(g);
  });

  if (isEditMode()) enterEditMode();

  btn.addEventListener('click', async () => {
    if (isEditMode()) {
      exitEditMode();
    } else {
      const password = prompt('Enter password to edit:');
      if (password !== null) {
        if ((await hash(password)) === PASSWORD_HASH) {
          enterEditMode();
        } else {
          alert('Incorrect password.');
        }
      }
    }
  });
}

initEditMode();
