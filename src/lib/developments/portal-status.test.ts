import { expect, it } from 'vitest';
import { summarizeDevelopmentPortal, summarizeStoriaDevelopment, type DevelopmentPortalStateCell } from './portal-status';

const cells: Record<string, DevelopmentPortalStateCell[]> = {
  u1: [{ portalId: 'cauta', state: 'in_feed', selected: true }],
  u2: [{ portalId: 'cauta', state: 'error', selected: true }],
  u3: [{ portalId: 'cauta', state: 'selected', selected: true }],
  outside: [{ portalId: 'cauta', state: 'published', selected: true }],
};

it('agregă publicate, erori și nepublicate numai pentru unitățile ansamblului', () => {
  const result = summarizeDevelopmentPortal({ portalId: 'cauta', unitIds: ['u1', 'u2', 'u3'], states: new Map(Object.entries(cells)) });
  expect(result).toMatchObject({ portalId: 'cauta', total: 3, published: 1, errors: 1, unpublished: 1, covered: true, selected: 3 });
});

it('Storia numără unitățile din tabela dedicată și păstrează separat starea ansamblului', () => {
  const result = summarizeStoriaDevelopment({
    unitIds: ['u1', 'u2', 'u3'],
    rows: [
      { property_id: 'u1', status: 'published' },
      { property_id: 'u2', status: 'published' },
      { property_id: 'u2', status: 'error' },
      { property_id: 'u3', status: 'pending' },
      { property_id: 'outside', status: 'published' },
    ],
    developmentStatus: 'published',
  });
  expect(result).toMatchObject({ total: 3, published: 1, errors: 1, unpublished: 1, developmentState: 'published' });
});

it('un portal neacoperit arată numai câte unități îl au bifat, fără stări inventate', () => {
  const result = summarizeDevelopmentPortal({ portalId: 'necunoscut', unitIds: ['u1', 'u2', 'u3'], states: new Map(Object.entries(cells)), selectedCount: 2 });
  expect(result).toEqual({ portalId: 'necunoscut', total: 3, published: 0, errors: 0, unpublished: 0, covered: false, selected: 2 });
});
