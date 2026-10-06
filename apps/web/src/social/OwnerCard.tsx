/**
 * A person's card in town, over the street: who owns this pet (or who said that). Their name, their pet, a few words,
 * their links, and what you can do: follow them, message them, see their whole profile, find their pets in town, or
 * block and report. You follow the OWNER here, never a pet.
 */
import { useState } from 'react';
import { FollowButton, SocialLinks, badgesOf, dmClosed, fallbackAvatar, useProfile, usePets } from './profile';
import { openInbox } from './Inbox';
import { reportSheet } from './Report';
import { social } from './store';
import { Avatar, SafeText, bannerBg, nameOf, profileHref, short, useSocial } from './ui';
import { RoleMarks, RoleTags } from './RoleMarks';
import { roleSheet } from './RolesAdmin';
import { rolesOf, useRoles } from './roles';

type Props = { address: string; onClose: () => void; onBack?: () => void; onFindPet?: (key: string) => void; isInTown?: (key: string) => boolean };

export function OwnerCard({ address, onClose, onBack, onFindPet, isInTown }: Props) {
  const { p, err, reload } = useProfile(address);
  const { pets, worn } = usePets(address);
  const s = useSocial();
  useRoles();
  const [more, setMore] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const mine = s.me?.address === address.toLowerCase();
  const who = p ? nameOf(p) : short(address);
  // no avatar chosen and no named pet on record (they may never have signed in): one of the pets they hold
  const avatar = p?.avatar ?? fallbackAvatar(pets);
  const avatarView = avatar ? pets?.find((v) => v.col === avatar.col && v.id === avatar.id) ?? null : null;
  const inTown = (pets ?? []).filter((v) => isInTown?.(`${v.col}:${v.id}`));
  const closed = p ? dmClosed(p, !!s.me) : null;
  const badges = p ? badgesOf(p, pets).slice(0, 4) : [];
  const hasRoles = rolesOf(address).length > 0;
  // an admin gets the menu on anyone's card, their own included (Roles…)
  const admin = !!s.me?.admin;
  return (
    <aside className="town-ui town-card so-owner" role="dialog" aria-label={`${who}'s card`}>
      {p && <div className="so-owner-banner" style={{ backgroundImage: bannerBg(p) }} />}
      {onBack && <button className="so-back" onClick={onBack} aria-label="Back to the pet">‹</button>}
      <button className="tc-close" onClick={onClose} aria-label="Close">×</button>
      {p && s.me && (!mine || admin) && <button type="button" className="so-owner-more" aria-label="More" aria-expanded={more} onClick={() => setMore(!more)}>⋯</button>}
      <div className="so-owner-head">
        <Avatar pet={avatar} view={avatarView} worn={avatar ? worn[`${avatar.col}:${avatar.id}`] : undefined} pic={p?.pic} size={72} className="ring" />
        <div className="so-owner-title">
          <h2>{who}<RoleMarks address={address} /></h2>
          <p className="tc-sub tnum">{p?.name ? short(address) : 'no name yet'}{p?.resident ? <> · resident #{p.resident}</> : null}</p>
        </div>
      </div>
      {err && <p className="tc-line">{err}</p>}
      {!p && !err && <p className="tc-line">Looking them up…</p>}
      {p && (
        <>
          {(hasRoles || badges.length > 0) && <div className="tc-chips"><RoleTags address={address} />{badges.map((b) => <span key={b.key} className="chip chip-gold" title={b.tip}>{b.icon} {b.label}</span>)}</div>}
          {p.bio ? <p className="so-owner-bio"><SafeText text={p.bio} from={who} /></p> : !p.joinedAt ? <p className="so-owner-bio muted">{mine ? 'You have not signed in to Emotown here yet.' : 'Has not moved in to Emotown yet: no profile, but you can still follow them.'}</p> : null}
          <SocialLinks socials={p.socials} who={who} />
          <div className="so-owner-nums">
            <div><b>{pets ? pets.length : '…'}</b><span>{pets?.length === 1 ? 'pet' : 'pets'}</span></div>
            <div><b>{p.followers.toLocaleString('en-US')}</b><span>followers</span></div>
            <div><b>{p.following.toLocaleString('en-US')}</b><span>following</span></div>
          </div>
          {inTown.length > 0 && onFindPet && (
            <div className="so-owner-pets">
              <span>In town now</span>
              {inTown.slice(0, 6).map((v) => <button key={`${v.col}:${v.id}`} type="button" onClick={() => onFindPet(`${v.col}:${v.id}`)} title={v.name || `#${v.id}`}><Avatar pet={{ col: v.col, id: v.id }} view={v} worn={worn[`${v.col}:${v.id}`]} size={34} /></button>)}
            </div>
          )}
          <div className="tc-actions">
            {!mine && <FollowButton p={p} onChange={() => void reload()} />}
            {!mine && <button type="button" className="so-btn" disabled={!!s.me && !!closed} title={closed ?? undefined} onClick={() => { if (!s.me) { setNote(null); openInbox(p.address); return; } if (!closed) openInbox(p.address); }}>Message</button>}
            <a className="so-btn" href={profileHref(p)}>{mine ? 'My profile' : 'Profile'}</a>
          </div>
          {closed && s.me && !mine && <p className="so-note">{closed}</p>}
          {note && <p className="so-note">{note}</p>}
          {more && (
            <div className="so-menu inline">
              {admin && <button onClick={() => { setMore(false); roleSheet({ address: p.address, who }); }}>Roles…</button>}
              {!mine && <button onClick={() => { setMore(false); void social.block(p.address, !p.me?.blocked).then(() => reload()).catch((e) => setNote((e as Error).message)); }}>{p.me?.blocked ? `Unblock ${who}` : `Block ${who}`}</button>}
              {!mine && <button onClick={() => { setMore(false); reportSheet({ kind: 'profile', address: p.address, who }); }}>Report {who}</button>}
            </div>
          )}
        </>
      )}
    </aside>
  );
}
