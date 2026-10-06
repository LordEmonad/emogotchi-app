/**
 * Editing your profile: a display name (also your vanity link, /u/name), a short bio, your picture (your pet's head, or
 * one you upload), your pet (one of your own, checked on chain when you save: the one your speech bubbles go over), a
 * banner (one of Emotown's streets, or one you upload), and your links elsewhere. Every field is checked here with the
 * same rules the Worker uses, so a mistake shows before the save, not after. Pictures are staged here and sent on Save
 * (pics.ts), so Cancel undoes all of it.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { fallbackName } from '../pets';
import { api, ApiError } from './api';
import { BANNER_LABEL, BANNER_SRC } from './banners';
import { usePets } from './profile';
import { BANNERS, LIMITS, PLATFORMS, charCount, checkName, cleanText, normalizeSocial, socialLink, type BannerId, type Platform } from './rules';
import { PicCropper } from './PicCropper';
import { picUrl, uploadPic, usePrivatePic, type PicKind } from './pics';
import { social } from './store';
import type { PetRef, Profile } from './types';
import { Avatar, useSocial } from './ui';

/** What happens to a picture on Save: stays as it is, comes off (back to the pet / the banner), or a new one goes up. */
type PicChoice = { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; blob: Blob; url: string };
const KEEP: PicChoice = { kind: 'keep' };

const LABEL: Record<Platform, [string, string]> = {
  x: ['X', '@handle or x.com/handle'], telegram: ['Telegram', '@username or t.me/username'], discord: ['Discord', 'username, or your numeric user id'],
  farcaster: ['Farcaster', '@username'], github: ['GitHub', 'username'], website: ['Website', 'https://…'],
};

export function ProfileEditor({ p, onClose, onSaved }: { p: Profile; onClose: () => void; onSaved: (p: Profile) => void }) {
  const [name, setName] = useState(p.name ?? '');
  const [bio, setBio] = useState(p.bio);
  const [avatar, setAvatar] = useState<PetRef | null>(p.avatarChosen ? p.avatar : null);
  const [banner, setBanner] = useState<BannerId>(p.banner);
  const [socials, setSocials] = useState<Record<Platform, string>>(() => Object.fromEntries(PLATFORMS.map((pf) => [pf, p.socials[pf] ?? ''])) as Record<Platform, string>);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { pets, worn } = usePets(p.address);
  const me = useSocial().me;
  const canUpload = !!me && (me.gate.ok || me.admin);
  const [pic, setPic] = useState<PicChoice>(KEEP);
  const [bannerPic, setBannerPic] = useState<PicChoice>(KEEP);
  const [cropping, setCropping] = useState<PicKind | null>(null);
  // a picture still waiting for its check is shown to its owner through the API, never the public host
  const heldPicUrl = usePrivatePic(p.held?.avatar);
  const heldBannerUrl = usePrivatePic(p.held?.banner);
  const curPic = heldPicUrl ?? (p.pic ? picUrl(p.pic) : null);
  const curBanner = heldBannerUrl ?? (p.bannerPic ? picUrl(p.bannerPic) : null);
  const petShown = pic.kind === 'remove' || (pic.kind === 'keep' && !curPic);
  const ownBannerShown = bannerPic.kind === 'new' || (bannerPic.kind === 'keep' && !!curBanner);
  // staged pictures are blob: URLs: free each one when it is replaced or the sheet closes
  useEffect(() => () => { if (pic.kind === 'new') URL.revokeObjectURL(pic.url); }, [pic]);
  useEffect(() => () => { if (bannerPic.kind === 'new') URL.revokeObjectURL(bannerPic.url); }, [bannerPic]);
  const staged = (blob: Blob): PicChoice => ({ kind: 'new', blob, url: URL.createObjectURL(blob) });

  const nameCheck = name.trim() ? checkName(name) : null;
  const bioLeft = LIMITS.bio - charCount(cleanText(bio, { multiline: true }));
  const socialChecks = useMemo(() => Object.fromEntries(PLATFORMS.map((pf) => [pf, normalizeSocial(pf, socials[pf])])) as Record<Platform, ReturnType<typeof normalizeSocial>>, [socials]);
  const localBad = (nameCheck && !nameCheck.ok) || bioLeft < 0 || PLATFORMS.some((pf) => !socialChecks[pf].ok);

  const save = async () => {
    setBusy(true); setErr(null); setErrors({});
    // pictures first, one at a time: a refused one keeps the sheet open with its reason under it
    let picsChanged = false;
    for (const [kind, choice, set, field] of [['avatar', pic, setPic, 'pic'], ['banner', bannerPic, setBannerPic, 'bannerPic']] as const) {
      try {
        if (choice.kind === 'remove') { await api.post('/pic/remove', { kind }); picsChanged = true; set(KEEP); }
        if (choice.kind === 'new') { await uploadPic(kind, choice.blob); picsChanged = true; set(KEEP); }
      } catch (e) {
        setErrors({ [field]: (e as Error).message });
        setBusy(false);
        return;
      }
    }
    const body: Record<string, unknown> = {};
    if ((p.name ?? '') !== name.trim()) body.name = name.trim() || null;
    if (p.bio !== bio) body.bio = bio;
    const chosen = p.avatarChosen ? p.avatar : null;
    if ((chosen?.col ?? null) !== (avatar?.col ?? null) || (chosen?.id ?? null) !== (avatar?.id ?? null)) body.avatar = avatar;
    if (p.banner !== banner) body.banner = banner;
    const changed = PLATFORMS.filter((pf) => (p.socials[pf] ?? '') !== socials[pf]);
    if (changed.length) body.socials = Object.fromEntries(changed.map((pf) => [pf, socials[pf]]));
    if (!Object.keys(body).length && !picsChanged) { onClose(); return; }
    try {
      const next = Object.keys(body).length ? await api.post<Profile>('/profile', body) : await api.get<Profile>(`/profile/${p.address}`);
      void social.refresh();
      onSaved(next);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.extra.errors) setErrors(e.extra.errors as Record<string, string>);
      else setErr((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal so-editor" role="dialog" aria-modal="true" aria-label="Edit your profile">
        <div className="modal-head"><h2>Your profile</h2><button className="modal-x" onClick={onClose} aria-label="Close">✕</button></div>
        <p className="modal-sub">Everything here is public. Plain text only.</p>

        <label className="so-field">
          <span>Name</span>
          <div className="so-prefix"><em>emogotchi.emonad.lol/u/</em><input value={name} onChange={(e) => setName(e.target.value.replace(/\s/g, ''))} placeholder="your_name" maxLength={LIMITS.nameMax} autoCapitalize="off" autoCorrect="off" spellCheck={false} /></div>
          {errors.name ? <b className="so-err">{errors.name}</b> : nameCheck && !nameCheck.ok ? <b className="so-err">{nameCheck.error}</b> : <small>3 to 20 letters, numbers or underscores. You can change it once a day.</small>}
        </label>

        <label className="so-field">
          <span>Bio</span>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={LIMITS.bio * 3} placeholder="A few words about you and your pets" />
          {errors.bio ? <b className="so-err">{errors.bio}</b> : <small className={bioLeft < 0 ? 'so-err' : ''}>{bioLeft} left</small>}
        </label>

        <div className="so-field">
          <span>Picture</span>
          <small>Shown next to your name everywhere in Emotown: your pet's head, or a picture of your own.</small>
          <div className="so-pick-pets">
            <button type="button" className={petShown ? 'on' : ''} onClick={() => setPic(curPic ? { kind: 'remove' } : KEEP)}><Avatar pet={avatar ?? p.avatar} size={52} /><span>My pet</span></button>
            {curPic && pic.kind !== 'new' && <button type="button" className={pic.kind === 'keep' ? 'on' : ''} onClick={() => setPic(KEEP)}><span className="so-av" style={{ width: 52, height: 52 }}><img src={curPic} alt="" /></span><span>{p.held?.avatar ? 'Being checked' : 'Mine'}</span></button>}
            {pic.kind === 'new' && <button type="button" className="on" onClick={() => setCropping('avatar')}><span className="so-av" style={{ width: 52, height: 52 }}><img src={pic.url} alt="" /></span><span>New</span></button>}
            <button type="button" className="so-pick-add" disabled={!canUpload} onClick={() => setCropping('avatar')}><span className="so-av" style={{ width: 52, height: 52 }}><i aria-hidden>＋</i></span><span>Upload</span></button>
          </div>
          {errors.pic ? <b className="so-err">{errors.pic}</b> : !canUpload ? <small>Uploading a picture needs a pet with a name, like talking in the square.</small> : p.held?.avatar && pic.kind === 'keep' ? <small>Your picture is waiting for a quick check. Your pet shows until then.</small> : null}
        </div>

        <div className="so-field">
          <span>Your pet</span>
          <small>The pet your speech bubbles go over in town{curPic || pic.kind === 'new' ? '' : ', and your picture'}.</small>
          <div className="so-pick-pets">
            <button type="button" className={avatar === null ? 'on' : ''} onClick={() => setAvatar(null)} title="Your named pet, whichever it is"><Avatar pet={p.avatarChosen ? null : p.avatar} size={52} /><span>Auto</span></button>
            {pets === null && <span className="so-hint">Reading your pets…</span>}
            {pets?.map((v) => {
              const on = avatar?.col === v.col && avatar.id === v.id;
              return <button type="button" key={`${v.col}:${v.id}`} className={on ? 'on' : ''} onClick={() => setAvatar({ col: v.col, id: v.id })} title={v.name || fallbackName(v.col, v.id)}><Avatar pet={{ col: v.col, id: v.id }} view={v} worn={worn[`${v.col}:${v.id}`]} size={52} /><span>{v.name || `#${v.id}`}</span></button>;
            })}
          </div>
          {errors.avatar && <b className="so-err">{errors.avatar}</b>}
        </div>

        <div className="so-field">
          <span>Banner</span>
          <div className="so-pick-banners">
            <button type="button" className="so-pick-add" disabled={!canUpload} onClick={() => setCropping('banner')} title="Upload your own banner"><i aria-hidden>＋</i><span>Upload your own</span></button>
            {bannerPic.kind === 'new' && <button type="button" className="on" onClick={() => setCropping('banner')}><img src={bannerPic.url} alt="" /><span>New</span></button>}
            {curBanner && bannerPic.kind !== 'new' && <button type="button" className={bannerPic.kind === 'keep' ? 'on' : ''} onClick={() => setBannerPic(KEEP)}><img src={curBanner} alt="" /><span>{p.held?.banner ? 'Being checked' : 'Mine'}</span></button>}
            {BANNERS.map((b) => <button type="button" key={b} className={banner === b && !ownBannerShown ? 'on' : ''} onClick={() => { setBanner(b); setBannerPic(curBanner ? { kind: 'remove' } : KEEP); }} title={BANNER_LABEL[b]}><img src={BANNER_SRC(b)} alt="" loading="lazy" /><span>{BANNER_LABEL[b]}</span></button>)}
          </div>
          {errors.bannerPic ? <b className="so-err">{errors.bannerPic}</b> : p.held?.banner && bannerPic.kind === 'keep' ? <small>Your banner is waiting for a quick check. Emotown's shows until then.</small> : null}
        </div>

        <fieldset className="so-field so-socials-edit">
          <legend>Elsewhere</legend>
          <small>Shown as links to those sites, marked unverified: nobody checks these belong to you.</small>
          {PLATFORMS.map((pf) => {
            const c = socialChecks[pf]; const e = errors[`social_${pf}`];
            const preview = c.ok && c.handle ? socialLink(pf, c.handle) : null;
            return (
              <label key={pf} className="so-social-row">
                <span>{LABEL[pf][0]}</span>
                <input value={socials[pf]} onChange={(ev) => setSocials({ ...socials, [pf]: ev.target.value })} placeholder={LABEL[pf][1]} maxLength={200} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
                {e ? <b className="so-err">{e}</b> : !c.ok ? <b className="so-err">{c.error}</b> : preview ? <small>{preview.href ?? preview.label}</small> : null}
              </label>
            );
          })}
        </fieldset>

        {/* on the body, not in this sheet: a fixed overlay inside an animated (transformed) box is trapped in it */}
        {cropping && createPortal(<PicCropper kind={cropping} onClose={() => setCropping(null)} onDone={(blob) => { (cropping === 'avatar' ? setPic : setBannerPic)(staged(blob)); setCropping(null); }} />, document.body)}
        {err && <p className="modal-err" role="alert">{err}</p>}
        <div className="pk-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-pink" onClick={() => void save()} disabled={busy || !!localBad}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
