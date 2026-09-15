import { Icon } from './Icon';

export function NoPet({ onDemo, address, claimHref = null }: { onDemo: () => void; address: string; claimHref?: string | null }) {
  return (
    <main className="nopet">
      <div className="shell"><div className="empty-room">
        <div className="empty-dots" />
        <div className="empty-floor" />
        <div className="empty-card">
          <Icon name="thought" size={64} />
          <h2>No Emogotchi in this wallet</h2>
          <p className="tnum">{address.slice(0, 6)}…{address.slice(-4)} doesn't hold one yet.</p>
          <div className="empty-actions">
            {claimHref ? <a className="btn btn-pink" href={claimHref}>Claim · am I on the list?</a> : <button className="btn btn-ghost" disabled>Claim · airdrop soon</button>}
            <button className="btn btn-ghost" disabled>Marketplace · soon</button>
          </div>
          <button className="link" onClick={onDemo}>Play with the demo cat meanwhile →</button>
        </div>
      </div></div>
    </main>
  );
}
