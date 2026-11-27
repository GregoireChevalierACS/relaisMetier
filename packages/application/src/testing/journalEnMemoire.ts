import type { CleDeTraitement, EtatDeTraitement, Traitement } from '@relaismetier/domain';

import type { JournalDesTraitements, ReservationDeTri } from '../ports.js';

/** Journal en mémoire, tenu par le même contrat que le journal PostgreSQL. */
export class JournalEnMemoire implements JournalDesTraitements {
  private readonly traitements = new Map<CleDeTraitement, Traitement>();
  private readonly reserveJusqua = new Map<CleDeTraitement, number>();

  // Chaque méthode est synchrone entre deux await : rien ne peut s'intercaler, comme une
  // transaction.

  inscrireLesNouveaux(traitements: readonly Traitement[]): Promise<ReadonlySet<CleDeTraitement>> {
    const inscrites = new Set<CleDeTraitement>();
    for (const traitement of traitements) {
      if (this.traitements.has(traitement.cle)) continue;
      this.traitements.set(traitement.cle, traitement);
      inscrites.add(traitement.cle);
    }
    return Promise.resolve(inscrites);
  }

  lire(cle: CleDeTraitement): Promise<Traitement | null> {
    return Promise.resolve(this.traitements.get(cle) ?? null);
  }

  reserverLesATrier({
    boite,
    limite,
    maintenant,
    dureeEnMillisecondes,
  }: ReservationDeTri): Promise<readonly Traitement[]> {
    const libres = [...this.traitements.values()]
      .filter(
        (traitement) =>
          traitement.boite === boite &&
          traitement.etat.kind === 'a-trier' &&
          (this.reserveJusqua.get(traitement.cle) ?? 0) <= maintenant,
      )
      .sort((a, b) => a.recuLe - b.recuLe || a.cle.localeCompare(b.cle))
      .slice(0, limite);
    for (const { cle } of libres) this.reserveJusqua.set(cle, maintenant + dureeEnMillisecondes);
    return Promise.resolve(libres);
  }

  terminer(cle: CleDeTraitement, etat: EtatDeTraitement): Promise<void> {
    const traitement = this.traitements.get(cle);
    if (traitement === undefined) return Promise.reject(new Error(`traitement inconnu : ${cle}`));
    this.traitements.set(cle, { ...traitement, etat });
    this.reserveJusqua.delete(cle);
    return Promise.resolve();
  }
}

const enPanne = () => Promise.reject(new Error('base injoignable'));

export const journalEnPanne = (): JournalDesTraitements => ({
  inscrireLesNouveaux: enPanne,
  lire: enPanne,
  reserverLesATrier: enPanne,
  terminer: enPanne,
});
