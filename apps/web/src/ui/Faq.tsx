/**
 * The questions people actually ask.
 *
 * This lives in its own component because it is needed in two places: inside the landing page for
 * someone who has not connected yet, and on /faq for everyone else. It used to exist only inside the
 * landing page, which meant that the moment you connected a wallet with a cat in it the FAQ became
 * unreachable, which is exactly when people start having questions.
 */
export function Faq() {
  return (
    <section className="faq" id="faq" aria-label="Questions">
      <h2>Questions people ask</h2>
      <details><summary>How often do I have to feed it?</summary><p>Every feed fills the bowl and restarts the clock. The bowl empties over 24 hours, then the cat is hungry, and 48 hours after its last meal it dies. Feed it every two days and it lives; every day and it thrives.</p></details>
      <details><summary>What happens when it dies?</summary><p>It becomes a ghost over a little grave, in the app and in your wallet's picture. Reviving costs 1,000 MON and brings every meter back to 60. The death stays on its record forever.</p></details>
      <details><summary>Do washing, playing and sleeping matter?</summary><p>Each one fills its meter and is due again 24 hours later, same rhythm as feeding. They don't keep it alive, they keep it happy. Happy cats score higher, and the top 100 cats each week wear the crown, on the site and on the NFT. Ties at the 100th place extend the list.</p></details>
      <details><summary>Why does my wallet still show it alive (or hungry)?</summary><p>Wallets cache pictures and refresh when you open the NFT or pull to refresh. Marketplaces update within minutes of any action. The app is always live.</p></details>
      <details><summary>Where does the MON go?</summary><p>80% of every interaction buys $EMO and burns it on the spot. The 0.d that selects an action on direct transfers goes to the giveaway treasury.</p></details>
      <details><summary>Can I use it without this site?</summary>
        <p>Yes. Send MON straight to the contract from the wallet that holds your cats. The whole number is how many cats, the decimal is the action:</p>
        <table className="faq-table"><tbody>
          <tr><td><b>N.0</b></td><td>feeds N cats, hungriest first</td></tr>
          <tr><td><b>N.1</b></td><td>plays with N cats, most bored first</td></tr>
          <tr><td><b>N.2</b></td><td>washes N cats, dirtiest first</td></tr>
          <tr><td><b>N.3</b></td><td>puts N cats to sleep, most tired first</td></tr>
          <tr><td><b>N.4</b></td><td>cleans up N poops</td></tr>
          <tr><td><b>1000.0</b></td><td>revives your longest-dead cat</td></tr>
        </tbody></table>
        <p>Anything else reverts and you keep your MON. Every function is also on the verified contract, so a block explorer works as a full interface. The site itself is pinned to IPFS with its hash stored in the contract.</p>
      </details>
      <details><summary>I have ten cats. Do I tap forty times?</summary><p>No. Cats show as tabs, and "Feed all" or "Full care" does the whole household in one transaction. Direct transfers batch the same way: 10.0 feeds all ten.</p></details>
      <details><summary>What are Items?</summary><p>Costumes, room themes and tools from the <a href="/shop">item shop</a>, a second contract that can only ever add items and never change one. Each item says how many exist, what it costs and who can claim it. The first, the witch outfit, is free for anyone with a living, named cat: one per cat, 200 in all. One copy dresses every cat in your wallet; sell it and they undress by themselves. Items are normal NFTs you can trade.</p></details>
      <details><summary>What moves with the NFT if I sell it?</summary><p>Everything. Meters, name, streak, score, crown and the whole record of feeds, pets and deaths belong to the cat, not the wallet.</p></details>
      <details><summary>Which wallets work on a phone?</summary><p>Any wallet with a built-in browser. Open <b>emogotchi.emonad.lol</b> inside MetaMask, Rabby, SafePal, Trust or your wallet of choice, rather than in Safari or Chrome, and the site will see it. A wallet app on its own cannot reach a page open in a different browser.</p></details>
    </section>
  );
}
