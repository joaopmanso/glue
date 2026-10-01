/* Right-click on a filter (ADR 0067): a group in the Filter menu or a column's ▾, a value in it, or a
   "Showing only" chip; each can be hidden from the Filter menu, and brought back. */
import { whatsThis } from './guide.svelte';
import { view, FILTER_GROUPS, type FilterGroup } from './view.svelte';
import { SEP, tidy, type MenuEntry } from './menu.svelte';

const titleOf = (g: FilterGroup) => FILTER_GROUPS.find(x => x.g === g)?.title ?? g;

/** A group, and the value under the pointer if there's one. */
export function filterMenu(g: FilterGroup, value?: string | null): MenuEntry[] {
  const on = view.filters[g], t = titleOf(g);
  return tidy([
    { head: value ? t + ' · ' + value : t },
    !!value && { label: on.includes(value) ? 'Stop showing only this' : 'Show only this', attrs: { 'data-m': 'only' }, run: () => view.toggleFilter(g, value) },
    !!value && !(on.length === 1 && on[0] === value) && { label: 'Show only this, nothing else', run: () => view.setFilter(g, [value]) },
    on.length > 0 && { label: 'Clear the ' + t + ' filter', run: () => view.clearFilters(g) },
    view.filtering && { label: 'Clear all filters', run: () => view.clearFilters() },
    SEP,
    !view.hiddenFilters.includes(g) && { label: 'Hide the ' + t + ' filter', attrs: { 'data-m': 'hide-filter' }, title: 'Take it out of the Filter menu (its column’s ▾ keeps it); bring it back from “Filters shown”', run: () => view.hideFilter(g) },
    { label: 'Filters shown', sub: shownFilters },
    ...whatsThis('library'),
  ]);
}

/** Which groups the Filter menu shows: tick to show, untick to hide. */
export function shownFilters(): MenuEntry[] {
  return tidy([
    ...FILTER_GROUPS.map(({ g, title }) => {
      const shown = !view.hiddenFilters.includes(g);
      return { label: title, checked: shown, stay: true, attrs: { 'data-filter-shown': g }, run: () => (shown ? view.hideFilter(g) : view.showFilter(g)) };
    }),
    view.hiddenFilters.length > 0 && SEP,
    view.hiddenFilters.length > 0 && { label: 'Show them all', run: () => view.showFilter() },
  ]);
}
