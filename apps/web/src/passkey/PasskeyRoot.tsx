/**
 * The passkey account's place on the page: mounted once beside the app (main.tsx), it registers with the bus so the
 * provider has somebody to ask, and draws nothing until something is asked. The sheets themselves (and mera, and the
 * key module) are a separate chunk, fetched the first time one is needed, so a visitor who never uses a passkey pays
 * for none of it.
 *
 * That chunk is also the one thing here that can fail on its own: this site is served from GitHub Pages behind a
 * cache, so a browser holding yesterday's index.html can 404 on today's hashed chunk. Without the boundary below,
 * that failure would throw during render and take the whole page down at the exact moment somebody pressed a money
 * button, leaving the request waiting for an answer that could never arrive. So it is caught here, every waiting
 * request is refused (nothing is ever signed by a failure), and the person is told to reload.
 */
import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { attachHost, refuseAll, type Pending } from './bus';

const Sheets = lazy(() => import('./Sheets'));

class Boundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="modal-back pk-back" role="alertdialog">
        <div className="modal pk-sheet">
          <div className="modal-head"><h2>Something went wrong</h2></div>
          <p className="modal-sub">The confirmation screen could not be loaded, so nothing was signed and nothing was sent. Reload the page and try again.</p>
          <div className="pk-actions"><button className="btn btn-pink" onClick={() => location.reload()}>Reload</button></div>
        </div>
      </div>
    );
  }
}

/** While the chunk is on its way: covered, but never trapped — this can always be backed out of. */
function Loading({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="modal-back pk-back" aria-busy="true" onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal pk-sheet">
        <div className="modal-head"><h2>One moment…</h2><button className="modal-x" onClick={onCancel} aria-label="Cancel">✕</button></div>
        <p className="modal-sub">Opening your account.</p>
      </div>
    </div>
  );
}

export function PasskeyRoot() {
  const [queue, setQueue] = useState<readonly Pending[]>([]);
  useEffect(() => attachHost(setQueue), []);
  if (queue.length === 0) return null;
  const drop = () => refuseAll(new Error('The confirmation screen could not be opened, so nothing was signed.'));
  return (
    <Boundary onFail={drop}>
      <Suspense fallback={<Loading onCancel={drop} />}><Sheets queue={queue} /></Suspense>
    </Boundary>
  );
}
