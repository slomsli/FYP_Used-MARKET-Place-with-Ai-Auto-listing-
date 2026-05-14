export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type ReverseGeocodeAddress = {
  city?: string;
  city_district?: string;
  county?: string;
  municipality?: string;
  neighbourhood?: string;
  quarter?: string;
  state?: string;
  state_district?: string;
  suburb?: string;
  town?: string;
  village?: string;
};

export type ReverseGeocodeResponse = {
  display_name?: string;
  address?: ReverseGeocodeAddress;
};

export type LocationOption = {
  id: number;
  name: string;
};

const LOCATION_ALIASES: Record<string, string[]> = {
  johor: ['johore'],
  johore: ['johor'],
  melaka: ['malacca'],
  malacca: ['melaka'],
  penang: ['pulau pinang'],
  'pulau pinang': ['penang'],
  'kuala lumpur': ['wilayah persekutuan kuala lumpur'],
  labuan: ['wilayah persekutuan labuan'],
  putrajaya: ['wilayah persekutuan putrajaya'],
};

export function normalizeLocationName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(daerah|district|municipality|state|negeri|wilayah|persekutuan|mukim)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function getLocationVariants(value: string): string[] {
  const normalized = normalizeLocationName(value);
  if (!normalized) {
    return [];
  }

  return Array.from(new Set([normalized, ...(LOCATION_ALIASES[normalized] ?? [])]));
}

export function collectLocationCandidates(values: Array<string | undefined>): string[] {
  const candidates = values.flatMap((value) => (value ? getLocationVariants(value) : []));
  return Array.from(new Set(candidates));
}

export function matchLocationOption<TOption extends LocationOption>(
  options: TOption[],
  candidates: string[]
): TOption | null {
  if (candidates.length === 0) {
    return null;
  }

  const candidatesSet = new Set(candidates);
  const optionsWithVariants = options.map((option) => ({
    option,
    variants: getLocationVariants(option.name),
  }));

  const exactMatch = optionsWithVariants.find(({ variants }) =>
    variants.some((variant) => candidatesSet.has(variant))
  );

  if (exactMatch) {
    return exactMatch.option;
  }

  const sortedOptions = [...optionsWithVariants].sort(
    (first, second) => second.option.name.length - first.option.name.length
  );

  const containsMatch = sortedOptions.find(({ variants }) =>
    variants.some((variant) =>
      variant.length > 3 &&
      candidates.some(
        (candidate) =>
          candidate.length > 3 &&
          (candidate.includes(variant) || variant.includes(candidate))
      )
    )
  );

  return containsMatch?.option ?? null;
}

export async function reverseGeocodeCoordinates(
  coordinates: Coordinates
): Promise<ReverseGeocodeResponse> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(coordinates.latitude),
    lon: String(coordinates.longitude),
    zoom: '18',
    addressdetails: '1',
    'accept-language': 'en',
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Reverse geocoding failed');
  }

  return (await response.json()) as ReverseGeocodeResponse;
}
