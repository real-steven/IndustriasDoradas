export function scopedQueryKey(
  name: string,
  profileId: string,
  organizationId: string,
  ...details: readonly unknown[]
): readonly unknown[] {
  return [name, profileId, organizationId, ...details];
}
