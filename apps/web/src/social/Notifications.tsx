/**
 * The bell: a new follower, a new message, a mention, a verdict on a picture you uploaded. Opening it marks what it
 * showed as read.
 */
import { useEffect, useState } from 'react';
import { api } from './api';
import { openInbox } from './Inbox';
import { social } from './store';
import type { Note } from './types';
import { Avatar, ago, nameOf } from './ui';
import { RoleMarks } from './RoleMarks';

type Props = { onClose: () => void; onPerson: (address: string) => void; onMention?: (messageId: number) => void };

export function Notifications({ onClose, onPerson, onMention }: Props) {
  const [items, setItems] = useState<Note[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    const load = () => api.get<{ items: Note[] }>('/notifications').then((r) => {
      if (off) return;
      setItems(r.items);
      const top = r.items.reduce((m, n) => Math.max(m, n.read ? 0 : n.id), 0);
      if (top) void api.post('/notifications/read', { upTo: top }).then(() => social.recount()).catch(() => {});
    }).catch((e) => { if (!off) setErr((e as Error).message); });
    void load();
    const stop = social.on((e) => { if (e.t === 'notification') void load(); });
    return () => { off = true; stop(); };
  }, []);
  const open = (n: Note) => {
    onClose();
    if (n.kind === 'dm') openInbox(n.actor);
    else if ((n.kind === 'mention' || n.kind === 'reply' || n.kind === 'like' || n.kind.startsWith('react:')) && n.ref?.startsWith('chat:') && onMention) onMention(Number(n.ref.slice(5)));
    else if (n.kind === 'pic') { const me = social.get().me; if (me?.signedIn) location.href = `/u/${me.profile.name ?? me.address}`; }
    else onPerson(n.actor);
  };
  return (
    <div className="town-ui so-pop so-notes" role="dialog" aria-label="Notifications">
      <header><h2>Notifications</h2><button className="tc-close" onClick={onClose} aria-label="Close">×</button></header>
      {err && <p className="so-empty">{err}</p>}
      {items === null && !err && <p className="so-empty">…</p>}
      {items?.length === 0 && <p className="so-empty">Nothing yet. When someone follows you, messages you or mentions you in the square, it shows up here.</p>}
      <ul>
        {items?.map((n) => (
          <li key={n.id} className={n.read ? '' : 'unread'}>
            <button type="button" onClick={() => open(n)}>
              {n.kind === 'pic' ? <span className="so-av so-note-pic" style={{ width: 34, height: 34 }}><i aria-hidden>{n.ref?.endsWith(':live') ? '✓' : '✕'}</i></span> : <Avatar pet={n.pet} pic={n.pic} size={34} />}
              <span className="so-note-text">
                {n.kind === 'pic' ? picNote(n.ref) : <><b>{nameOf({ name: n.name, address: n.actor })}<RoleMarks address={n.actor} /></b>{' '}
                {n.kind === 'follow' ? 'followed you' : n.kind === 'dm' ? (n.count > 1 ? `sent you ${n.count} messages` : 'sent you a message') : n.kind === 'reply' ? 'replied to you in the square' : n.kind === 'like' ? 'liked your message in the square' : n.kind.startsWith('react:') ? `reacted ${n.kind.slice(6)} to your message in the square` : 'mentioned you in the square'}</>}
              </span>
              <time>{ago(n.at)}</time>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A verdict on a picture you uploaded, from its `ref` ('avatar:live', 'banner:refused'). */
function picNote(ref: string | null) {
  const [kind, verdict] = (ref ?? '').split(':');
  const what = kind === 'banner' ? 'banner' : kind === 'card' ? 'link card' : 'picture';
  return verdict === 'live' ? <>Your new <b>{what}</b> passed its check and is up.</> : <>Your new <b>{what}</b> was not approved, so it is not shown. Try another.</>;
}
