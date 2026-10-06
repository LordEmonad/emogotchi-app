/**
 * What a role looks like: its emoji by a name (RoleMarks: the first ROLE_LIMITS.shown of someone's roles, in the admins'
 * order) and its tag (RoleChip). Only the roles store is imported here, so ui.tsx can use these without a cycle.
 */
import { ROLE_LIMITS } from './rules';
import { rolesOf, useRoles, type Role } from './roles';

export function RoleMarks({ address, max = ROLE_LIMITS.shown }: { address: string | null | undefined; max?: number }) {
  useRoles();
  const rs = rolesOf(address).slice(0, max);
  if (!rs.length) return null;
  return (
    <span className="so-rolemarks" role="img" aria-label={rs.map((r) => r.name).join(', ')}>
      {rs.map((r) => <span key={r.id} title={r.name}>{r.emoji}</span>)}
    </span>
  );
}

export function RoleChip({ r }: { r: Role }) {
  return <span className={`so-role c-${r.color}`} title={`${r.name}: a role from Emotown's admins`}><i aria-hidden>{r.emoji}</i>{r.name}</span>;
}

/** Every tag someone holds, for their profile and card (null when they hold none). */
export function RoleTags({ address }: { address: string }) {
  useRoles();
  const rs = rolesOf(address);
  return rs.length ? <>{rs.map((r) => <RoleChip key={r.id} r={r} />)}</> : null;
}
