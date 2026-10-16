import { RecentSearchService } from './recent-search.service';
import { vi } from 'vitest';

describe('RecentSearchService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records only normalized non-empty searches', () => {
    const service = new RecentSearchService();
    service.record('   ');
    service.record('  monitor   Dell  ');
    expect(service.searches()).toEqual(['monitor Dell']);
  });

  it('moves a repeated case-insensitive search to the front', () => {
    const service = new RecentSearchService();
    service.record('Monitor Dell');
    service.record('Laptop');
    service.record('  monitor dell ');
    expect(service.searches()).toEqual(['monitor dell', 'Laptop']);
  });

  it('keeps only the ten most recent searches', () => {
    const service = new RecentSearchService();
    for (let index = 1; index <= 11; index += 1) {
      service.record(`Búsqueda ${index}`);
    }
    expect(service.searches()).toHaveLength(10);
    expect(service.searches()[0]).toBe('Búsqueda 11');
    expect(service.searches()).not.toContain('Búsqueda 1');
  });

  it('persists, restores, removes and clears searches', () => {
    const firstService = new RecentSearchService();
    firstService.record('Laptop');
    firstService.record('Monitor');

    const restoredService = new RecentSearchService();
    expect(restoredService.searches()).toEqual(['Monitor', 'Laptop']);
    restoredService.remove('monitor');
    expect(restoredService.searches()).toEqual(['Laptop']);
    restoredService.clear();
    expect(new RecentSearchService().searches()).toEqual([]);
  });

  it('ignores invalid stored data', () => {
    localStorage.setItem('markettec.recent-searches', '{invalid');
    expect(new RecentSearchService().searches()).toEqual([]);
  });

  it('sanitizes and deduplicates stored data', () => {
    localStorage.setItem(
      'markettec.recent-searches',
      JSON.stringify([
        '  Monitor  Dell ',
        42,
        '',
        'monitor dell',
        'Laptop'
      ])
    );
    expect(new RecentSearchService().searches())
      .toEqual(['Monitor Dell', 'Laptop']);
  });

  it('keeps working in memory when storage is unavailable', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('Storage disabled');
      });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('Storage disabled');
      });

    const service = new RecentSearchService();
    service.record('Laptop');

    expect(service.searches()).toEqual(['Laptop']);
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });
});
