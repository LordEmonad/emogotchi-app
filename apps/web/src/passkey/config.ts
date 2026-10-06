/**
 * The chain the passkey account signs for. Built from the same env as the rest of the site, in its own module so the
 * passkey code never imports game/chain.ts (which would make a cycle the day chain.ts needs to know the wallet kind).
 */
import { configFromEnv } from '@emo-pets/chain';

export const cfg = configFromEnv(import.meta.env as unknown as Record<string, string | undefined>);
