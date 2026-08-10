/**
 * Client-side tag filtering. The full grid is server-rendered; this only HIDES
 * non-matching cards (never fetches or builds DOM), so it degrades to the full
 * unfiltered grid with JS off. State lives in the `tags` query param (AND
 * semantics), synced with history.replaceState so URLs are copyable.
 */
const bar = document.querySelector<HTMLElement>('.filter-bar');
const grid = document.querySelector<HTMLElement>('#photo-grid');

if (bar && grid) {
  const total = Number(bar.dataset.total || '0');
  const chips = [...bar.querySelectorAll<HTMLButtonElement>('.filter-chip')];
  const status = bar.querySelector<HTMLElement>('[data-filter-status]');
  const clearBtn = bar.querySelector<HTMLButtonElement>('[data-filter-clear]');
  const emptyMsg = document.querySelector<HTMLElement>('.filter-empty');
  const cards = [...grid.querySelectorAll<HTMLAnchorElement>('a.photo-card')];

  const readActive = () =>
    new Set(
      (new URLSearchParams(location.search).get('tags') || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );

  let active = readActive();

  const apply = () => {
    let shown = 0;
    for (const card of cards) {
      const tags = (card.dataset.tags || '').split(',').filter(Boolean);
      // AND: a card shows only if it has every active tag.
      const match = [...active].every((t) => tags.includes(t));
      card.classList.toggle('is-hidden', !match);
      if (match) shown++;
    }

    for (const chip of chips) {
      chip.setAttribute('aria-pressed', active.has(chip.dataset.tag!) ? 'true' : 'false');
    }

    if (status) {
      status.textContent =
        active.size === 0
          ? `${total} ${total === 1 ? 'photo' : 'photos'}`
          : `${shown} of ${total} · tagged ${[...active].join(' and ')}`;
    }
    if (clearBtn) clearBtn.hidden = active.size === 0;

    const isEmpty = active.size > 0 && shown === 0;
    if (emptyMsg) emptyMsg.hidden = !isEmpty;
    grid.hidden = isEmpty;
  };

  const syncUrl = () => {
    const params = new URLSearchParams(location.search);
    if (active.size) params.set('tags', [...active].join(','));
    else params.delete('tags');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : ''));
  };

  const toggle = (tag: string) => {
    if (active.has(tag)) active.delete(tag);
    else active.add(tag);
    syncUrl();
    apply();
  };

  const clear = () => {
    active.clear();
    syncUrl();
    apply();
  };

  chips.forEach((chip) => chip.addEventListener('click', () => toggle(chip.dataset.tag!)));
  clearBtn?.addEventListener('click', clear);
  document.querySelector('.filter-empty-clear')?.addEventListener('click', clear);
  window.addEventListener('popstate', () => {
    active = readActive();
    apply();
  });

  apply();
}
