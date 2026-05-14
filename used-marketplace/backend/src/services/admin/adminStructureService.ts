import { supabaseAdmin } from '../../config/supabase';
import {
  type AdminStructureCategoryNode,
  type AdminStructureLocationItem,
  type AdminStructureQuery,
  type AdminStructureResponse,
  type CreateCategoryInput,
  type CreateLocationInput,
  type RawArea,
  type RawCategory,
  type RawCategoryListing,
  type RawState,
  AdminServiceError,
  normalizeId,
  slugify,
} from './shared';

function filterCategoryTree(
  categories: AdminStructureCategoryNode[],
  search: string
): AdminStructureCategoryNode[] {
  if (!search) {
    return categories;
  }

  return categories
    .map((category) => {
      const parentMatches = category.name.toLowerCase().includes(search);
      const matchingChildren = category.children.filter((child) =>
        child.name.toLowerCase().includes(search)
      );

      if (!parentMatches && matchingChildren.length === 0) {
        return null;
      }

      return {
        ...category,
        children: parentMatches ? category.children : matchingChildren,
      };
    })
    .filter((category): category is AdminStructureCategoryNode => category !== null);
}

function filterLocations(
  locations: AdminStructureLocationItem[],
  search: string
): AdminStructureLocationItem[] {
  if (!search) {
    return locations;
  }

  return locations.filter((location) => {
    if (location.name.toLowerCase().includes(search)) {
      return true;
    }

    return location.previewAreas.some((area) => area.toLowerCase().includes(search));
  });
}

async function resolveUniqueSlug(
  table: 'categories' | 'states',
  baseValue: string
): Promise<string> {
  const baseSlug = slugify(baseValue);

  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();

    if (error) {
      console.error(`[Admin] Failed to check ${table} slug availability:`, error);
      throw new AdminServiceError(`Unable to validate ${table} slug`, 500);
    }

    if (!data) {
      return candidate;
    }
  }

  throw new AdminServiceError(`Unable to generate a unique ${table} slug`, 500);
}

export async function getAdminStructure(
  query: AdminStructureQuery
): Promise<AdminStructureResponse> {
  const search = (query.search ?? '').trim().toLowerCase();
  const [
    { data: categories, error: categoryError },
    { data: states, error: stateError },
    { data: areas, error: areaError },
    { data: listings, error: listingError },
  ] = await Promise.all([
    supabaseAdmin.from('categories').select('id, name, slug, parent_id, created_at').order('name'),
    supabaseAdmin.from('states').select('id, name, slug').order('name'),
    supabaseAdmin.from('areas').select('id, state_id, name, slug, created_at').order('name'),
    supabaseAdmin.from('listings').select('category_id, state_id, area_id').is('deleted_at', null),
  ]);

  if (categoryError) {
    console.error('[Admin] Failed to load categories:', categoryError);
    throw new AdminServiceError('Unable to load categories', 500);
  }

  if (stateError) {
    console.error('[Admin] Failed to load states:', stateError);
    throw new AdminServiceError('Unable to load states', 500);
  }

  if (areaError) {
    console.error('[Admin] Failed to load areas:', areaError);
    throw new AdminServiceError('Unable to load areas', 500);
  }

  if (listingError) {
    console.error('[Admin] Failed to load listings for admin structure:', listingError);
    throw new AdminServiceError('Unable to load structure statistics', 500);
  }

  const listingCategoryCounts = new Map<number, number>();
  const listingStateCounts = new Map<number, number>();
  const listingsWithoutLocation = ((listings ?? []) as RawCategoryListing[]).filter(
    (listing) => normalizeId(listing.state_id) === null || normalizeId(listing.area_id) === null
  ).length;

  ((listings ?? []) as RawCategoryListing[]).forEach((listing) => {
    const categoryId = normalizeId(listing.category_id);
    const stateId = normalizeId(listing.state_id);

    if (categoryId !== null) {
      listingCategoryCounts.set(categoryId, (listingCategoryCounts.get(categoryId) ?? 0) + 1);
    }

    if (stateId !== null) {
      listingStateCounts.set(stateId, (listingStateCounts.get(stateId) ?? 0) + 1);
    }
  });

  const categoryRecords = (categories ?? []) as RawCategory[];
  const childCategoryMap = new Map<number | null, RawCategory[]>();

  categoryRecords.forEach((category) => {
    const parentId = normalizeId(category.parent_id);
    const currentChildren = childCategoryMap.get(parentId) ?? [];
    currentChildren.push(category);
    childCategoryMap.set(parentId, currentChildren);
  });

  const categoryNodes = (childCategoryMap.get(null) ?? [])
    .map((category) => {
      const categoryId = normalizeId(category.id) ?? 0;
      const children = (childCategoryMap.get(categoryId) ?? []).map((child) => {
        const childId = normalizeId(child.id) ?? 0;

        return {
          id: childId,
          name: child.name,
          slug: child.slug,
          itemCount: listingCategoryCounts.get(childId) ?? 0,
        };
      });

      const totalItems =
        (listingCategoryCounts.get(categoryId) ?? 0) +
        children.reduce((sum, child) => sum + child.itemCount, 0);

      return {
        id: categoryId,
        name: category.name,
        slug: category.slug,
        totalItems,
        createdAt: category.created_at,
        children,
      } satisfies AdminStructureCategoryNode;
    })
    .sort((left, right) => right.totalItems - left.totalItems || left.name.localeCompare(right.name));

  const stateRecords = (states ?? []) as RawState[];
  const areaRecords = (areas ?? []) as RawArea[];
  const areasByState = new Map<number, RawArea[]>();

  areaRecords.forEach((area) => {
    const stateId = normalizeId(area.state_id);
    if (stateId === null) {
      return;
    }

    const currentAreas = areasByState.get(stateId) ?? [];
    currentAreas.push(area);
    areasByState.set(stateId, currentAreas);
  });

  const locations = stateRecords
    .map((state) => {
      const stateId = normalizeId(state.id) ?? 0;
      const relatedAreas = areasByState.get(stateId) ?? [];
      const listingCount = listingStateCounts.get(stateId) ?? 0;

      return {
        id: stateId,
        name: state.name,
        slug: state.slug,
        areaCount: relatedAreas.length,
        listingCount,
        status: listingCount > 0 ? 'operational' : 'maintenance',
        previewAreas: relatedAreas.slice(0, 3).map((area) => area.name),
      } satisfies AdminStructureLocationItem;
    })
    .sort((left, right) => right.listingCount - left.listingCount || left.name.localeCompare(right.name));

  const recentCategoryEvents = categoryRecords.map((category) => ({
    id: `category-${category.id}`,
    title: `Category "${category.name}" added`,
    detail: normalizeId(category.parent_id)
      ? 'Linked under an existing parent category.'
      : 'Added as a top-level marketplace category.',
    timestamp: category.created_at,
  }));

  const stateNameMap = new Map(stateRecords.map((state) => [normalizeId(state.id) ?? 0, state.name]));
  const recentAreaEvents = areaRecords.map((area) => ({
    id: `area-${area.id}`,
    title: `Location "${area.name}" added`,
    detail: `Mapped under ${stateNameMap.get(normalizeId(area.state_id) ?? 0) ?? 'a region'}.`,
    timestamp: area.created_at,
  }));

  const auditLog = [...recentCategoryEvents, ...recentAreaEvents]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 6);

  const mostActiveCategory = categoryNodes[0]
    ? {
        name: categoryNodes[0].name,
        itemCount: categoryNodes[0].totalItems,
      }
    : null;

  const filteredCategories = filterCategoryTree(categoryNodes, search);
  const filteredLocations = filterLocations(locations, search);

  return {
    overview: {
      totalCategories: categoryRecords.length,
      totalSubcategories: categoryRecords.filter((category) => normalizeId(category.parent_id) !== null).length,
      mostActiveCategory,
      structureHealth: {
        status: listingsWithoutLocation === 0 ? 'optimized' : 'attention',
        detail:
          listingsWithoutLocation === 0
            ? 'All category and location links are connected.'
            : `${listingsWithoutLocation} listing(s) still need a full location mapping.`,
      },
      globalReach: {
        activeRegions: locations.filter((location) => location.listingCount > 0).length,
        totalRegions: locations.length,
        totalListings: (listings ?? []).length,
      },
    },
    forms: {
      parentCategories: categoryNodes
        .map((category) => ({
          id: category.id,
          name: category.name,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    },
    categories: filteredCategories,
    locations: filteredLocations,
    auditLog,
  };
}

export async function createCategory(input: CreateCategoryInput): Promise<{
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
}> {
  const name = input.name.trim();
  const parentId = input.parentId ?? null;

  if (!name) {
    throw new AdminServiceError('Category name is required', 422);
  }

  if (parentId !== null) {
    const { data: parentCategory, error: parentError } = await supabaseAdmin
      .from('categories')
      .select('id')
      .eq('id', parentId)
      .maybeSingle();

    if (parentError) {
      console.error('[Admin] Failed to validate parent category:', parentError);
      throw new AdminServiceError('Unable to validate parent category', 500);
    }

    if (!parentCategory) {
      throw new AdminServiceError('Selected parent category was not found', 422);
    }
  }

  const slug = await resolveUniqueSlug('categories', name);
  const { data, error } = await supabaseAdmin
    .from('categories')
    .insert({
      name,
      slug,
      parent_id: parentId,
    })
    .select('id, name, slug, parent_id')
    .single();

  if (error || !data) {
    console.error('[Admin] Failed to create category:', error);
    throw new AdminServiceError('Unable to create category', 500);
  }

  return {
    id: normalizeId(data.id) ?? 0,
    name: data.name,
    slug: data.slug,
    parentId: normalizeId(data.parent_id),
  };
}

export async function createLocation(input: CreateLocationInput): Promise<{
  state: {
    id: number;
    name: string;
    slug: string;
  };
  areas: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
}> {
  const stateName = input.stateName.trim();
  const areaNames = Array.from(
    new Set((input.areaNames ?? []).map((area) => area.trim()).filter(Boolean))
  );

  if (!stateName) {
    throw new AdminServiceError('Region name is required', 422);
  }

  const stateSlug = slugify(stateName);
  let stateRecord:
    | {
        id: number | string;
        name: string;
        slug: string;
      }
    | null = null;

  const [
    { data: existingStateByName, error: stateByNameError },
    { data: existingStateBySlug, error: stateBySlugError },
  ] = await Promise.all([
    supabaseAdmin.from('states').select('id, name, slug').eq('name', stateName).maybeSingle(),
    supabaseAdmin.from('states').select('id, name, slug').eq('slug', stateSlug).maybeSingle(),
  ]);

  if (stateByNameError || stateBySlugError) {
    console.error('[Admin] Failed to validate region name:', stateByNameError ?? stateBySlugError);
    throw new AdminServiceError('Unable to validate region name', 500);
  }

  const existingState = existingStateByName ?? existingStateBySlug;

  if (existingState) {
    stateRecord = existingState;
  } else {
    const uniqueStateSlug = await resolveUniqueSlug('states', stateName);
    const { data: insertedState, error: insertStateError } = await supabaseAdmin
      .from('states')
      .insert({
        name: stateName,
        slug: uniqueStateSlug,
      })
      .select('id, name, slug')
      .single();

    if (insertStateError || !insertedState) {
      console.error('[Admin] Failed to create region:', insertStateError);
      throw new AdminServiceError('Unable to create region', 500);
    }

    stateRecord = insertedState;
  }

  const stateId = normalizeId(stateRecord.id) ?? 0;
  const { data: existingAreas, error: existingAreasError } = await supabaseAdmin
    .from('areas')
    .select('id, name, slug, state_id')
    .eq('state_id', stateId);

  if (existingAreasError) {
    console.error('[Admin] Failed to load existing areas:', existingAreasError);
    throw new AdminServiceError('Unable to validate areas', 500);
  }

  const existingAreaSlugSet = new Set(
    ((existingAreas ?? []) as RawArea[]).map((area) => area.slug.toLowerCase())
  );

  const insertedAreas: Array<{ id: number; name: string; slug: string }> = [];

  for (const areaName of areaNames) {
    const areaSlug = slugify(areaName);

    if (existingAreaSlugSet.has(areaSlug)) {
      continue;
    }

    const { data: insertedArea, error: insertAreaError } = await supabaseAdmin
      .from('areas')
      .insert({
        state_id: stateId,
        name: areaName,
        slug: areaSlug,
      })
      .select('id, name, slug')
      .single();

    if (insertAreaError || !insertedArea) {
      console.error('[Admin] Failed to create area:', insertAreaError);
      throw new AdminServiceError('Unable to create area', 500);
    }

    existingAreaSlugSet.add(areaSlug);
    insertedAreas.push({
      id: normalizeId(insertedArea.id) ?? 0,
      name: insertedArea.name,
      slug: insertedArea.slug,
    });
  }

  return {
    state: {
      id: stateId,
      name: stateRecord.name,
      slug: stateRecord.slug,
    },
    areas: insertedAreas,
  };
}
