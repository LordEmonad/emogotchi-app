// The cut. 120 beats a minute: a beat is half a second, 30 frames; every cut lands on a beat (or a half).
// A clip: { id, layout: 'card' | 'full' | 'room' | 'phone', beats, take, from (seconds into the take), … }.
export const BEAT = 30;

const fit = (take, chip, from = 0, o = {}) => ({ id: take, layout: 'room', beats: 2, take, from, chip, ...o });
const FACES = ['pfp/cat/content-crown.png', 'pfp/frog/happy.png', 'pfp/sahur/content-crown.png', 'pfp/thiccums/happy-crown.png', 'pfp/r3tards/content.png'];
const TX = ['Every action is a transaction', 'on Monad.'];
const FROK = { side: 'left', kicker: 'THE FROK · FREE', title: 'inversebrah', sub: ['Slap it. Squeeze it.', 'Set it on fire.'] };
const RING = [0.146, 0.02, 0.848, 0.98];   // the fight's window on the Fight Club page
const STREET = [0.36, 0.0, 1.0, 1.0];       // Emotown: the pet beside its card
const DRAWER = [0.42, 0.0, 1.0, 1.0];      // Emotown: the street's edge and the messages drawer

const CLIPS = [
  // ---- what it is ----
  { id: 'open', layout: 'card', beats: 5, logo: true, sub: 'Pets that live in your wallet.' },
  { id: 'home', layout: 'full', beats: 10, take: 'home', from: 0 },

  // ---- the five pets, each doing its own thing through ----
  { id: 'cat', layout: 'room', beats: 7, take: 'pet-cat', from: 3.9, kicker: 'THE CAT', title: 'Emogotchi', sub: 'The one that started it.' },
  { id: 'frok', layout: 'room', beats: 5, take: 'pet-frok', from: 0.9, ...FROK, flash: true },
  { id: 'frok-fire', layout: 'room', beats: 6, take: 'pet-frok-burn', from: 5.0, ...FROK, still: true },
  { id: 'sahur', layout: 'room', beats: 7, take: 'pet-sahur', from: 0.8, kicker: 'THE SAHUR · FREE', title: ['Tung Tung', 'Tung Sahur'], sub: 'Tung. Tung. Tung.', flash: true },
  { id: 'thicc', layout: 'room', beats: 7, take: 'pet-thicc', from: 0.1, side: 'left', kicker: 'THE SEAL · FREE', title: 'Thiccums', sub: 'The butt bounces.', flash: true },
  { id: 'r3', layout: 'room', beats: 7, take: 'pet-r3', from: 4.4, kicker: 'THE R3TARD · FREE', title: 'r3tardgotchi', sub: 'A face on a stick. It kicks.', flash: true },

  // ---- looking after one ----
  { id: 'feed', layout: 'phone', beats: 7, take: 'phone-feed', from: 0.1, title: ['Feed it.'], sub: TX },
  { id: 'wash', layout: 'phone', beats: 6, take: 'phone-wash', from: 2.2, title: ['Wash it.'], sub: TX, still: true },
  { id: 'play', layout: 'phone', beats: 6, take: 'phone-play', from: 4.2, title: ['Play with it.'], sub: TX, still: true },
  { id: 'sleep', layout: 'phone', beats: 5, take: 'phone-sleep', from: 0.1, title: ['Put it to bed.'], sub: TX, still: true },
  { id: 'die', layout: 'room', beats: 6, take: 'life-die', from: 0.3, side: 'left', title: ['Forget it', '*and it dies.'], sub: 'For real. On chain.' },
  { id: 'revive', layout: 'room', beats: 5, take: 'life-revive', from: 0.2, side: 'left', title: ['Or bring', '*it back.'], flash: true },

  // ---- on chain, and the burn ----
  { id: 'nft', layout: 'full', beats: 6, take: 'nft', from: 0.4, title: 'Everything is on chain.', sub: 'Even the picture in your wallet.' },
  { id: 'stats', layout: 'full', beats: 7, take: 'stats', from: 0.3, title: 'Care for a cat, burn EMO.', sub: '80% of every interaction buys EMO and burns it.' },

  // ---- dressing up ----
  { id: 'dress', layout: 'card', beats: 3, title: ['Dress them up.'] },
  fit('fit-cat-witch', 'Witch outfit'),
  fit('fit-frok-pumpkin', 'Pumpkin head'),
  fit('fit-sahur-mummy', 'Mummy wraps'),
  fit('fit-thicc-zombie', 'Zombie'),
  fit('fit-r3-hair', 'Emo hair'),
  fit('fit-cat-habibi', 'Keffiyeh and bisht'),
  fit('fit-frok-kippah', 'Kippah and Star of David'),
  fit('fit-sahur-witch', 'Spooky theme'),
  fit('fit-thicc-pumpkin', 'Golden pumpkin'),
  fit('fit-r3-habibi', 'The Majlis'),
  { id: 'dreidel', layout: 'room', beats: 7, take: 'toy-dreidel', from: 4.4, chip: 'Spin the dreidel' },
  { id: 'darbuka', layout: 'room', beats: 6, take: 'toy-darbuka', from: 2.8, chip: 'Play the darbuka' },
  { id: 'falcon', layout: 'room', beats: 8, take: 'toy-falcon', from: 0.5, chip: 'Call the falcon' },
  { id: 'kapparot', layout: 'room', beats: 6, take: 'toy-kapparot', from: 2.6, chip: 'Kapparot' },
  { id: 'shop', layout: 'full', beats: 7, take: 'shop', from: 0.7, title: 'The item shop.', sub: 'Outfits, rooms and toys. Every item on chain.' },

  // ---- Emotown ----
  { id: 'town', layout: 'card', beats: 3, kicker: 'EMOTOWN', title: ['Where they', '*all hang out.'] },
  { id: 'town-night', layout: 'full', beats: 10, take: 'town-night', from: 0.6, title: 'Emotown.', sub: 'Every pet cared for today, out on one street. Live.' },
  { id: 'chat', layout: 'full', beats: 20, take: 'town-chat', from: 0.2, title: 'The town square.', sub: 'What you say goes up over your pet.' },
  { id: 'town-feed', layout: 'room', beats: 11, take: 'town-feed', from: 1.6, crop: STREET, h: 900, side: 'left', kicker: 'EMOTOWN', title: ['Care for it', '*on the street.'], sub: ['Feed, wash, play and more,', 'without leaving town.'] },
  { id: 'town-slap', layout: 'room', beats: 8, take: 'town-slap', from: 0.3, crop: STREET, h: 900, side: 'left', kicker: 'EMOTOWN', title: ['Care for it', '*on the street.'], sub: ['Feed, wash, play and more,', 'without leaving town.'], still: true },
  { id: 'dm', layout: 'room', beats: 17, take: 'dm', from: 0.3, crop: DRAWER, h: 900, kicker: 'EMOTOWN', title: ['Direct', 'messages.'], sub: ['Follow an owner,', 'talk in private.'] },
  { id: 'town-day', layout: 'full', beats: 5, take: 'town-day', from: 1.2, title: 'Emotown.', sub: 'It keeps your time of day.' },
  { id: 'town-winter', layout: 'full', beats: 5, take: 'town-winter', from: 1.2, title: 'Emotown.', sub: 'And your season.' },
  { id: 'town-furnace', layout: 'full', beats: 5, take: 'town-furnace', from: 1.0, title: 'The Furnace.', sub: 'Every EMO burned, counted live.' },
  { id: 'town-tavern', layout: 'full', beats: 4, take: 'town-tavern', from: 1.2, title: "Emo's Tavern.", sub: 'Fights happen in the basement.' },

  // ---- Fight Club: one real fight from the record ----
  { id: 'fight', layout: 'room', beats: 6, take: 'fight-long', from: 1.2, crop: RING, h: 900, side: 'left', kicker: 'FIGHT CLUB', title: ['Pet against', 'pet.'], sub: ['Both put up the same MON.'] },
  { id: 'fight-mid', layout: 'room', beats: 5, take: 'fight-long', from: 8.2, crop: RING, h: 900, side: 'left', kicker: 'FIGHT CLUB', title: ['Pet against', 'pet.'], sub: ['Both put up the same MON.'], still: true },
  { id: 'fight-ko', layout: 'room', beats: 10, take: 'fight-long', from: 16.7, crop: RING, h: 900, side: 'left', kicker: 'FIGHT CLUB', title: ['The winner', '*takes the pot.'], sub: ['And wears the belt for a day.'], still: true },

  // ---- everything else ----
  { id: 'gallery', layout: 'full', beats: 5, take: 'gallery', from: 0.7, title: 'Every pet, live.', sub: 'Read from the chain as you look.' },
  { id: 'board', layout: 'full', beats: 4, take: 'board', from: 0.8, title: 'The leaderboard.', sub: 'The best kept wear the crown.' },
  { id: 'pfps', layout: 'full', beats: 5, take: 'pfps', from: 1.0, title: 'Profile pictures.', sub: 'Hundreds of them, free to save.' },
  { id: 'profile', layout: 'full', beats: 5, take: 'profile', from: 0.6, title: 'Profiles.', sub: 'Follows, DMs and a town square.' },
  { id: 'mine', layout: 'phone', beats: 8, take: 'mine', from: 0.5, title: ['All your pets,', 'one page.'], sub: ['Each in its own room.'] },
  { id: 'mine-items', layout: 'phone', beats: 3, take: 'mine', from: 6.6, title: ['All your pets,', 'one page.'], sub: ['Each in its own room.'], still: true },
  { id: 'send-name', layout: 'phone', beats: 19, take: 'send-name', from: 1.6, vis: 772, side: 'left', title: ['Send a pet', '*to a name.'], sub: ['Type who it is for.', 'The site checks before you sign.'] },
  { id: 'send-addr', layout: 'phone', beats: 16, take: 'send-addr', from: 2.9, until: 10.05, vis: 772, side: 'left', title: ['Or an item', '*to any address.'], sub: ['Pets and items,', 'straight from your wallet.'] },
  { id: 'notif', layout: 'phone', beats: 6, take: 'notif', from: 1.9, side: 'left', title: ['It tells you', "when it's hungry."], sub: ['Push notifications,', 'on your home screen.'] },
  { id: 'join', layout: 'card', beats: 3, title: ['Getting in', '*takes a minute.'] },
  { id: 'wallets', layout: 'phone', beats: 6, take: 'signup', from: 0.3, vis: 800, scale: 1.2, title: ['Bring your', 'wallet.'], sub: ['MetaMask, WalletConnect,', 'or none at all.'] },
  { id: 'passkey', layout: 'phone', beats: 9, take: 'signup', from: 3.8, vis: 800, scale: 1.2, title: ['No wallet?', '*Use Face ID.'], sub: ['A real Monad account', 'from a passkey. Nothing to install.'] },
  { id: 'starter', layout: 'phone', beats: 7, take: 'signup', from: 8.9, vis: 800, scale: 1.2, title: ['Your first gas', '*is on us.'], sub: ['A new account arrives funded:', 'enough to mint a pet.'] },
  { id: 'firstpet', layout: 'phone', beats: 10, take: 'signup', from: 13.2, vis: 800, scale: 1.2, title: ['Your first pet,', '*seconds later.'], sub: ['Free to mint.', 'Yours on chain.'] },

  // ---- the end ----
  { id: 'end', layout: 'end', beats: 10, faces: FACES, sub: 'Four of the five pets are free. Live on Monad.', url: 'emogotchi.emonad.lol' },
];

export function build() {
  let at = 0;
  const clips = CLIPS.map((c) => {
    const start = Math.round(at * BEAT);
    at += c.beats;
    const len = Math.round(at * BEAT) - start;
    return { ...c, start, len, lenMs: len * 1000 / 60 };
  });
  return { fps: 60, frames: Math.round(at * BEAT), clips };
}
