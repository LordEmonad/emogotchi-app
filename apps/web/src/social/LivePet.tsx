/**
 * One pet, drawn live by its rig and dressed from its on-chain state: crowned, in its outfit and hair, asleep, sad or
 * a ghost. The profile page's avatar.
 */
import { useEffect, useState } from 'react';
import type { CatView } from '@emo-pets/chain';
import { Pet, type Costume, type PetRig } from '../pet/Pet';
import { costumesOf, hairOf } from '../items';
import { characterOf } from '../pets';
import type { PetRef } from './types';
import { loadLooks, lookOf, wear } from '../fight/wear';

export function LivePet({ pet, view, worn }: { pet: PetRef; view: CatView | null; worn: readonly number[] }) {
  const [rig, setRig] = useState<PetRig | null>(null);
  const character = characterOf(pet.col);
  useEffect(() => {
    if (!rig) return;
    rig.setCrown(!!view?.crowned);
    rig.setCostumes(costumesOf(worn, character));   // its outfit and the pack's accessories
    rig.setHair(hairOf(worn, character));
    if (view && !view.alive) { rig.setGhost(true); rig.face('x', 'frown', 0); return; }
    rig.setGhost(false);
    if (view?.asleep) rig.setMood('sleep');
    else if (view?.mood === 'sad') rig.setMood('sad');
    else { rig.setMood('idle'); if (view?.mood === 'happy') rig.face('happy', 'smile', 200); else if (view?.mood === 'hungry') rig.face('open', 'frown', 200); else rig.restFace(200); }
  }, [rig, view, worn, character]);
  // Fight Club's belt or black eye, for the day after a fight
  const alive = !!view?.alive;
  useEffect(() => {
    if (!rig) return;
    let on = true;
    void loadLooks([pet]).then(() => { if (on) wear(rig, character, lookOf(pet), alive); });
    return () => { on = false; };
  }, [rig, pet.col, pet.id, alive, character]);
  return <Pet character={character} onRig={setRig} className="so-livepet" />;
}
