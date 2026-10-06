/** Every notification kind, grouped as the sheet shows them. Mirrors worker/push.js `KINDS` (every one on by default). */
export type Kind = 'bowl' | 'dying' | 'died' | 'poop' | 'crown' | 'dm' | 'follow' | 'mention' | 'reply' | 'react' | 'pic' | 'fightAccepted' | 'fightResult';
export type Group = { title: string; note?: string; kinds: { kind: Kind; label: string; hint: string }[] };

export const GROUPS: Group[] = [
  {
    title: 'Pets',
    note: 'Read off the chain every ten minutes, one message per event.',
    kinds: [
      { kind: 'bowl', label: 'Bowl empty', hint: '24 hours after the last meal, with the time left.' },
      { kind: 'dying', label: 'Starving', hint: 'Six hours before it dies. Always gets through quiet hours.' },
      { kind: 'died', label: 'Died', hint: 'When a pet of yours dies, and what a revive costs.' },
      { kind: 'poop', label: 'Poop', hint: 'When there is something to clean up.' },
      { kind: 'crown', label: 'Crown', hint: 'Won or lost a place in the top 100.' },
    ],
  },
  {
    title: 'Emotown',
    note: 'Only on a device where you are signed in to Emotown.',
    kinds: [
      { kind: 'dm', label: 'Messages', hint: 'A new DM.' },
      { kind: 'follow', label: 'Followers', hint: 'Someone follows you.' },
      { kind: 'mention', label: 'Mentions', hint: 'Your name in the square.' },
      { kind: 'reply', label: 'Replies', hint: 'A reply to your message.' },
      { kind: 'react', label: 'Reactions', hint: 'A reaction to your message.' },
      { kind: 'pic', label: 'Pictures', hint: 'Your uploaded picture approved or refused.' },
    ],
  },
  {
    title: 'Fight Club',
    kinds: [
      { kind: 'fightAccepted', label: 'Challenge accepted', hint: 'Someone took your fight.' },
      { kind: 'fightResult', label: 'Fight decided', hint: 'Won, lost, or called off.' },
    ],
  },
];
export const ALL_KINDS: Kind[] = GROUPS.flatMap((g) => g.kinds.map((k) => k.kind));
export const defaultKinds = (): Record<Kind, boolean> => Object.fromEntries(ALL_KINDS.map((k) => [k, true])) as Record<Kind, boolean>;
