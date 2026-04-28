export type Relation<T> = T | T[] | null | undefined;

export function unwrapRelation<T>(relation: Relation<T>): T | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }

  return relation ?? null;
}
