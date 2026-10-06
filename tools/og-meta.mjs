// Rewrites the Open Graph / X card tags in <route>/index.html of the Pages checkout (the current directory) for
// routes with their own link preview: same page, their own title, description and card. Run by pages-deploy.sh.
//   node tools/og-meta.mjs mint inversebrah tung stats nft pfps
import { readFileSync, writeFileSync } from 'node:fs';
const HIM = {
  TITLE: 'inversebrah · Inversegotchi',
  DESC: 'A frok that lives in your wallet, on Monad. Mint him free, one per wallet. Feed him, screenshot him, slap him, squeeze him, set him on fire: all of it free, all of it on chain.',
  IMG: 'https://emogotchi.emonad.lol/brand/inversebrah-og.png',
  ALT: 'inversebrah, a crowned frok. Mint him free. Keep him alive.',
};
const TUNG = {
  TITLE: 'Tung Tung Tung Sahur · Sahuragotchi',
  DESC: 'Tung Tung Tung Sahur, living in your wallet on Monad. Mint him free, one per wallet. Feed him, wash him, play with him, and let him knock: tung tung tung, counted on chain forever. All of it free.',
  IMG: 'https://emogotchi.emonad.lol/brand/sahur-og.png',
  ALT: 'Tung Tung Tung Sahur, crowned, bat in hand. Mint him free. Keep him alive.',
};
const TOWN = {
  TITLE: 'Emotown (beta) · Emogotchi',
  DESC: 'The town where the pets of Emogotchi hang out: every pet cared for today walks the street, live from Monad. Tap one for its whole record, chat in the town square, and take care of your own without leaving.',
  IMG: 'https://emogotchi.emonad.lol/brand/emotown-og.png', W: 1200, H: 630,
  ALT: 'Emotown at night: the town hall, the EMOTOWN sign on the hill, the park and the item shop, and a street full of pets.',
};
// the gallery (nav "Pet gallery" since 2026-09-28) and its old address /cats; the card is tools/og-gallery.mjs
const GALLERY = {
  TITLE: 'Pet gallery · Emogotchi',
  DESC: 'Every cat, frok and Tung Tung Tung Sahur, read live from Monad: their moods, crowns, outfits, names and whole records, the ones that never died and the ones that did. Search by name, number or wallet.',
  IMG: 'https://emogotchi.emonad.lol/brand/gallery-og.png',
  ALT: 'A wall of Emogotchi wallet pictures: cats, froks and Sahurs in every mood, crowned, in outfits, a few ghosts, some marked never died.',
};
// Thiccums (the fourth pet): only asked for once he is launched (pages-deploy.sh passes `thiccums` when his address is set)
const THICC = {
  TITLE: 'Thiccums · Thiccumsgotchi',
  DESC: 'Thiccums the Seal, the $THICCUMS mascot, living in your wallet on Monad. Mint him free, one per wallet. Feed him, wash him, play with him, and bounce that butt: counted on chain forever. All of it free.',
  IMG: 'https://emogotchi.emonad.lol/brand/thiccums-og.png',
  ALT: 'Thiccums the Seal, crowned, on his rock in the sea. Mint him free. Watch it bounce.',
};
const META = {
  mint: HIM, inversebrah: HIM, tung: TUNG, thiccums: THICC, emotown: TOWN, town: TOWN, pets: GALLERY, cats: GALLERY,
  // "Get a pet" (2026-09-28): the three pets on one page; the card is tools/og-adopt.mjs
  adopt: {
    TITLE: 'Get a pet · Emogotchi',
    DESC: 'Adopt a pet on Monad. Emonad, inversebrah, Tung Tung Tung Sahur, Thiccums and the r3tard are free to mint, one each per wallet; the cat is claimed from the list. Everything about them lives on chain, their pictures included.',
    IMG: 'https://emogotchi.emonad.lol/brand/adopt-og-6.png',   // Emonad joined (six pets: tools/og-adopt.mjs --six); a new URL makes X, Discord and Telegram fetch it again (?v=3 was the r3tard, v=2 Thiccums)
    ALT: 'Emonad crowned in his emo bedroom at night, inversebrah crowned at night, Tung Tung Tung Sahur knocking in the Backrooms, Thiccums crowned mid butt-bounce, the r3tard crowned and the crowned cat at home: five free, one to claim.',
  },
  // r3tardgotchi's mint page (2026-10-01, "Coming soon"): the card is tools/r3-brand.mjs (the page's own top: the wall
  // of faces, the word, the offer, him crowned in a framed stage)
  r3tardgotchi: {
    TITLE: 'r3tardgotchi · free mint, live on Monad',
    DESC: 'Meet the r3tard. A r3tard that lives in your wallet, on Monad: feed him, wash him, play with him, put him to bed. Free to mint, no cap, one per wallet.',
    IMG: 'https://emogotchi.emonad.lol/brand/r3tardgotchi-og-live.png?v=2', W: 1200, H: 630,
    ALT: 'r3tardgotchi in big handwriting over a purple wall of r3tard faces; a black card reads Meet the r3tard, Mint him free; the r3tard on his stick figure body, crowned, in his room.',
  },
  // Emonadgotchi's mint page (the sixth pet): only on the site once he is launched (his switch), so it goes out with the live
  // card (tools/eg-brand.mjs). DRAFT words for the operator.
  emonadgotchi: {
    TITLE: 'Emonadgotchi · free mint, live on Monad',
    DESC: 'Emonad, the face of $EMO, lives in your wallet now: feed him, wash him, play with him, put him to bed. Free to mint, no cap, one per wallet.',
    IMG: 'https://emogotchi.emonad.lol/brand/emonadgotchi-og-live.png', W: 1200, H: 630,
    ALT: 'Emonadgotchi: Emonad, the $EMO mascot, as a pet in his emo bedroom at night; free mint, open now.',
  },
  // Fight Club (2026-09-30): the card is tools/og-fightclub.mjs (Sahur's bat landing on the cat in the basement)
  fightclub: {
    TITLE: 'Fight Club · Emogotchi',
    DESC: 'Any pet against any pet. Both owners put up the same MON, 2 to 1,000 a side; the chain picks the winner at random, 50/50, with Pyth Entropy on Monad; the winner takes the pot. A belt for a day for the winner, a black eye for the loser. Pets are never at stake.',
    IMG: 'https://emogotchi.emonad.lol/brand/fightclub-og.png?v=2', W: 1200, H: 630,
    ALT: 'Fight Club: Tung Tung Tung Sahur\'s bat landing on the cat in the tavern\'s basement, a crowd of pets watching. Any pet against any pet. Winner takes the pot.',
  },
  pfps: {
    TITLE: 'Free profile pictures · Emogotchi',
    DESC: 'The cat, the frok, Tung Tung Tung Sahur and Thiccums in every mood, outfit and room, and in the middle of things: dinner, bath time, the slap, the tung tung tung, the butt bounce. Free, not on chain, just for fun. Pick one, save it, wear it.',
    IMG: 'https://emogotchi.emonad.lol/brand/pfps-og.png?v=2',   // v2 (2026-10-01): four pets, the packs; a new URL so previews refetch
    ALT: 'A wall of round Emogotchi profile pictures: the cat, inversebrah, Tung Tung Tung Sahur and Thiccums in outfits, crowns and rooms. Wear your pet.',
  },
  stats: {
    TITLE: 'Emogotchi, in numbers',
    DESC: 'Every care, name, crank and stunt on every pet, and every claim in the item shop, folded from Monad\'s own event log and read live. EMO burned, records, the latest events. Nothing is estimated.',
    IMG: 'https://emogotchi.emonad.lol/brand/stats-og.png?v=2',   // v2 (2026-09-28): the still card with no numbers; a new URL so previews refetch
    ALT: 'Emogotchi, in numbers: the cat, inversebrah and Tung Tung Tung Sahur in front of a rising chart in their colours.',
  },
  'shop/jewish': {
    TITLE: 'The Jewish pack · Emogotchi',
    DESC: 'A kippah with payot, a Star of David, the Western Wall, a dreidel and the kapparot hen: five items for every pet, and the story behind each one. 36 MON each, 613 of each.',
    IMG: 'https://emogotchi.emonad.lol/brand/jewish-pack-og.png',
    ALT: 'The Jewish pack: the cat, inversebrah, Tung Tung Tung Sahur and a seal at the Western Wall in kippahs and Stars of David, a dreidel spinning and a hen overhead.',
  },
  'shop/habibi': {
    TITLE: 'The Habibi pack · Emogotchi',
    DESC: 'The keffiyeh, the bisht, the majlis, a darbuka and a falcon: five items for every pet, and the story behind each one. Free, one of each for every living, named pet, 1,001 of each.',
    IMG: 'https://emogotchi.emonad.lol/brand/habibi-pack-og.png',
    ALT: 'The Habibi pack: inversebrah, the cat and Tung Tung Tung Sahur in a majlis with Dubai through the window, in keffiyehs and bishts, a darbuka and a falcon flying in.',
  },
  'shop/emo': {
    TITLE: 'The emo pack · Emogotchi',
    DESC: 'A beanie, the fit, wristbands, lip piercings, an emo bedroom, a guitar and a flip phone: seven items for every pet. 30 MON each, or free and soulbound for wallets holding 7,000 $EMO.',
    IMG: 'https://emogotchi.emonad.lol/brand/emo-pack-og.png',
    ALT: 'The emo pack: the cat, the frok, Sahur, Thiccums and the r3tard in beanies and the emo fit, playing guitars in the emo bedroom at night.',
  },
  nft: {
    TITLE: 'The art, from the contract · Emogotchi',
    DESC: 'Nine moods and a crown for every pet, composed on chain by the contract from the pet\'s live state. No IPFS, no server. Every image read from the art contracts; save one as PNG or SVG and wear it.',
    IMG: 'https://emogotchi.emonad.lol/brand/art-og.png?v=2',   // v2 (2026-10-01): all four pets; a new URL so previews refetch
    ALT: 'Twelve wallet pictures read from the art contracts: the cat, inversebrah, Tung Tung Tung Sahur and Thiccums, three states each, crowned on top.',
  },
};
for (const route of process.argv.slice(2)) {
  const { TITLE, DESC, IMG, ALT, W = 2400, H = 1260 } = META[route] ?? (() => { throw new Error(`no meta for ${route}`); })();
  const file = `${route}/index.html`;
  let h = readFileSync(file, 'utf8');
  const set = (re, val) => { if (!re.test(h)) throw new Error(`${file}: no match for ${re}`); h = h.replace(re, val); };
  set(/<title>[^<]*<\/title>/, `<title>${TITLE}</title>`);
  set(/(<meta name="description" content=")[^"]*(")/, `$1${DESC}$2`);
  set(/(<meta property="og:title" content=")[^"]*(")/, `$1${TITLE}$2`);
  set(/(<meta property="og:description" content=")[^"]*(")/, `$1${DESC}$2`);
  set(/(<meta property="og:image" content=")[^"]*(")/, `$1${IMG}$2`);
  set(/(<meta property="og:image:alt" content=")[^"]*(")/, `$1${ALT}$2`);
  // the card's true size (the page's own tags say 2400x1260, the home card's; a card drawn at 1200x630 says so)
  set(/(<meta property="og:image:width" content=")[^"]*(")/, `$1${W}$2`);
  set(/(<meta property="og:image:height" content=")[^"]*(")/, `$1${H}$2`);
  set(/(<meta property="og:url" content=")[^"]*(")/, `$1https://emogotchi.emonad.lol/${route}/$2`);
  set(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${TITLE}$2`);
  set(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${DESC}$2`);
  set(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${IMG}$2`);
  writeFileSync(file, h);
  console.log('og meta:', file);
}
