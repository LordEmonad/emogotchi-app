/**
 * Roles (2026-09-28): the tags admins hand out (worker/social/roles.js). Each has an emoji that goes by its holders'
 * names wherever a name is shown, and a tag for their profile and card. No powers.
 *
 * The whole list is one small read: once a page, again every five minutes while the page is showing, at once when the
 * square's room says it changed (chat.ts), and straight from the answer when an admin changes it here.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import type { RoleColor } from './rules';

export type Role = { id: number; name: string; emoji: string; color: RoleColor };
export type RoleSnap = { v: number; roles: Role[]; holders: [string, number[]][] };

const NONE: Role[] = [];
let order: Role[] = [];
let byAddress = new Map<string, Role[]>();
let seen = -1;
let version = 0;
let started = false;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();

/** Take a list (the Worker's answer, or the one an admin's change came back with); an older one arriving late is dropped. */
export function applyRoles(s: RoleSnap | null | undefined) {
  if (!s || !Array.isArray(s.roles) || !Array.isArray(s.holders) || s.v < seen) return;
  seen = s.v;
  const byId = new Map(s.roles.map((r) => [r.id, r]));
  order = s.roles;
  byAddress = new Map(s.holders.map(([a, ids]) => [a.toLowerCase(), ids.map((i) => byId.get(i)).filter((r): r is Role => !!r)]));
  version++;
  for (const f of subs) f();
}

/** Read the list again (`newer`: only if the room's version is past the one we have). */
export function loadRoles(newer?: number): Promise<void> {
  if (newer !== undefined && newer <= seen) return Promise.resolve();
  loading ??= api.get<RoleSnap>('/roles').then(applyRoles).catch(() => { /* Emotown resting: names show without roles */ }).finally(() => { loading = null; });
  return loading;
}

function start() {
  if (started) return;
  started = true;
  void loadRoles();
  setInterval(() => { if (document.visibilityState === 'visible') void loadRoles(); }, 5 * 60_000);
}

/** Someone's roles, in the admins' order. */
export const rolesOf = (address: string | null | undefined): Role[] => (address ? byAddress.get(address.toLowerCase()) ?? NONE : NONE);
export const allRoles = () => order;

/** Subscribe to the roles (re-renders when they change); the first use on a page reads them. */
export function useRoles(): number {
  useEffect(start, []);
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => version);
}
