import {
  portalStateBucket,
  type PortalFilterBucket,
  type PortalSelectionState,
} from '@/lib/portals/portal-state';

export type DevelopmentPortalStateCell = {
  portalId: string;
  state: PortalSelectionState;
  selected: boolean;
};

export type DevelopmentPortalStatus = {
  portalId: string;
  total: number;
  published: number;
  errors: number;
  unpublished: number;
  /** False when the shared property-state rule does not cover this grid portal. */
  covered: boolean;
  /** Used only for an uncovered portal: units with an enabled publication. */
  selected: number;
  /** Storia's investment state, kept separate so it never inflates unit totals. */
  developmentState?: PortalFilterBucket;
};

function counts(total: number) {
  return { total, published: 0, errors: 0, unpublished: total };
}

/** Aggregate one grid portal using the exact buckets shared with the property filter. */
export function summarizeDevelopmentPortal(input: {
  portalId: string;
  unitIds: string[];
  states: ReadonlyMap<string, DevelopmentPortalStateCell[]>;
  selectedCount?: number;
}): DevelopmentPortalStatus {
  const cells = input.unitIds.map(id => input.states.get(id)?.find(cell => cell.portalId === input.portalId));
  if (cells.some(cell => !cell)) {
    return {
      portalId: input.portalId,
      ...counts(input.unitIds.length),
      published: 0,
      unpublished: 0,
      covered: false,
      selected: input.selectedCount ?? 0,
    };
  }

  const result: DevelopmentPortalStatus = {
    portalId: input.portalId,
    ...counts(input.unitIds.length),
    covered: true,
    selected: cells.filter(cell => cell?.selected).length,
  };
  for (const cell of cells) {
    const bucket = portalStateBucket(cell!.state);
    if (bucket === 'published') {
      result.published += 1;
      result.unpublished -= 1;
    } else if (bucket === 'error') {
      result.errors += 1;
      result.unpublished -= 1;
    }
  }
  return result;
}

/** One unit can have sale and rent rows; an error wins, then a published row. */
export function summarizeStoriaDevelopment(input: {
  unitIds: string[];
  rows: { property_id: string; status: string }[];
  developmentStatus: string | null;
}): DevelopmentPortalStatus {
  const ids = new Set(input.unitIds);
  const statuses = new Map<string, string[]>();
  for (const row of input.rows) {
    if (!ids.has(row.property_id)) continue;
    statuses.set(row.property_id, [...(statuses.get(row.property_id) ?? []), row.status]);
  }
  const result: DevelopmentPortalStatus = {
    portalId: 'storia',
    ...counts(input.unitIds.length),
    covered: true,
    selected: input.unitIds.length,
    developmentState: input.developmentStatus === 'published'
      ? 'published'
      : input.developmentStatus === 'error' ? 'error' : 'unpublished',
  };
  for (const id of input.unitIds) {
    const unitStatuses = statuses.get(id) ?? [];
    if (unitStatuses.includes('error')) {
      result.errors += 1;
      result.unpublished -= 1;
    } else if (unitStatuses.includes('published')) {
      result.published += 1;
      result.unpublished -= 1;
    }
  }
  return result;
}
