import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';

const grid = document.querySelector<HTMLElement>('#photo-grid');
if (grid) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const lightbox = new PhotoSwipeLightbox({
    gallery: '#photo-grid',
    children: 'a.photo-card',
    pswpModule: () => import('photoswipe'),
    // Largest served candidate; PhotoSwipe generates `sizes` and re-adjusts on zoom.
    showHideAnimationType: reduceMotion ? 'none' : 'zoom',
    bgOpacity: 0.92,
  });

  const esc = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

  // Caption from data-caption / alt, read off the originating anchor.
  lightbox.on('uiRegister', () => {
    lightbox.pswp!.ui!.registerElement({
      name: 'caption',
      order: 9,
      isButton: false,
      appendTo: 'root',
      onInit: (el) => {
        el.className = 'pswp-caption';
        lightbox.pswp!.on('change', () => {
          const anchor = lightbox.pswp!.currSlide?.data.element as HTMLAnchorElement | undefined;
          const img = anchor?.querySelector('img');
          const text = anchor?.dataset.caption || img?.alt || '';
          el.innerHTML = text ? `<span>${esc(text)}</span>` : '';
        });
      },
    });
  });

  // --- Deep linking (PhotoSwipe v5 dropped v4's history module) ---
  const anchors = () => [...grid.querySelectorAll<HTMLAnchorElement>('a.photo-card')];
  const currentParams = () => new URLSearchParams(location.search);
  let preOpenUrl: string | null = null;

  lightbox.on('beforeOpen', () => {
    preOpenUrl = location.pathname + location.search;
  });

  // On slide change, sync ?photo=<id> while preserving existing filter params.
  lightbox.on('change', () => {
    const anchor = lightbox.pswp!.currSlide?.data.element as HTMLAnchorElement | undefined;
    const id = anchor?.dataset.pswpId;
    if (!id) return;
    const params = currentParams();
    params.set('photo', id);
    history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
  });

  // On close, restore the pre-open URL (drops ?photo).
  lightbox.on('close', () => {
    if (preOpenUrl) history.replaceState(null, '', preOpenUrl);
  });

  lightbox.init();

  const openFromUrl = () => {
    const id = currentParams().get('photo');
    if (!id) return;
    const index = anchors().findIndex((a) => a.dataset.pswpId === id);
    if (index >= 0 && !lightbox.pswp) lightbox.loadAndOpen(index);
  };

  // Back/forward: open or close to match the URL.
  window.addEventListener('popstate', () => {
    const id = currentParams().get('photo');
    if (id && !lightbox.pswp) openFromUrl();
    else if (!id && lightbox.pswp) lightbox.pswp.close();
  });

  // Cold-load deep link.
  openFromUrl();

  // Fade each thumbnail in once it decodes (color placeholder shows until then).
  for (const img of grid.querySelectorAll<HTMLImageElement>('img')) {
    if (img.complete) img.classList.add('is-loaded');
    else img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
  }
}
