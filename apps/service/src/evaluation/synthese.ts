import type { ResultatDUnCas } from './banc.js';
import { additionner, coutEnDollars, USAGE_NUL, type Usage } from './cout.js';

/** Taille du relevé type dont la feuille de route demande le temps et le coût. */
export const COURRIELS_DU_RELEVE_TYPE = 30;

export interface Synthese {
  readonly cas: number;
  readonly enErreur: number;
  readonly tri: {
    /** Part des cas notés où la décision « réponse attendue » est la bonne. */
    readonly exactitude: number;
    readonly precision: number;
    readonly rappel: number;
    readonly specificite: number;
    readonly vraisPositifs: number;
    readonly fauxPositifs: number;
    readonly vraisNegatifs: number;
    readonly fauxNegatifs: number;
  };
  readonly parCategorie: Readonly<
    Record<string, { readonly cas: number; readonly justes: number }>
  >;
  readonly erreursDeTri: readonly {
    readonly cas: string;
    readonly objet: string;
    readonly categorie: string;
    readonly attendu: boolean;
    readonly decision: string;
  }[];
  readonly brouillons: {
    readonly rediges: number;
    readonly sains: number;
    readonly problemes: readonly string[];
  };
  readonly usage: Usage;
  /** null si un appel a été servi par un modèle sans prix connu. */
  readonly coutEnDollars: number | null;
  readonly coutParModele: Readonly<Record<string, number | null>>;
  readonly modelesSubstitues: number;
  readonly latenceMoyenneParCasEnSecondes: number;
  readonly releveType: {
    readonly courriels: number;
    readonly coutEnDollars: number | null;
    readonly secondes: number;
  };
}

const ratio = (numerateur: number, denominateur: number): number =>
  denominateur === 0 ? 0 : numerateur / denominateur;

const somme = (valeurs: readonly number[]): number => valeurs.reduce((total, v) => total + v, 0);

const estAttendue = ({ decision }: ResultatDUnCas): boolean => decision.kind === 'reponse-attendue';

export function synthetiser(resultats: readonly ResultatDUnCas[]): Synthese {
  const notes = resultats.filter(({ status }) => status === 'ok');
  const justes = notes.filter(({ grade }) => grade.tri === 1);
  const compter = (attendu: boolean, obtenu: boolean) =>
    notes.filter((r) => r.attendu.reponseAttendue === attendu && estAttendue(r) === obtenu).length;
  const vraisPositifs = compter(true, true);
  const fauxPositifs = compter(false, true);
  const vraisNegatifs = compter(false, false);
  const fauxNegatifs = compter(true, false);

  const parCategorie = Object.fromEntries(
    [...new Set(notes.map(({ categorie }) => categorie))].map((categorie) => [
      categorie,
      {
        cas: notes.filter((r) => r.categorie === categorie).length,
        justes: justes.filter((r) => r.categorie === categorie).length,
      },
    ]),
  );

  const rediges = notes.filter(({ grade }) => grade.brouillon !== undefined);
  const appels = resultats.flatMap(({ appels: a }) => a);
  // Coût par modèle réellement servi : un repli apparaît sous son propre nom.
  const coutParModele = Object.fromEntries(
    [...new Set(appels.map(({ servi }) => servi))].map((modele) => [
      modele,
      coutEnDollars(
        modele,
        appels
          .filter(({ servi }) => servi === modele)
          .reduce((total, { usage }) => additionner(total, usage), USAGE_NUL),
      ),
    ]),
  );
  const couts = Object.values(coutParModele);
  const connus = couts.filter((cout): cout is number => cout !== null);
  const coutTotal = connus.length === couts.length ? somme(connus) : null;
  const latenceMoyenne = ratio(
    somme(resultats.map(({ latency_s }) => latency_s)),
    resultats.length,
  );

  return {
    cas: resultats.length,
    enErreur: resultats.length - notes.length,
    tri: {
      exactitude: ratio(justes.length, notes.length),
      precision: ratio(vraisPositifs, vraisPositifs + fauxPositifs),
      rappel: ratio(vraisPositifs, vraisPositifs + fauxNegatifs),
      specificite: ratio(vraisNegatifs, vraisNegatifs + fauxPositifs),
      vraisPositifs,
      fauxPositifs,
      vraisNegatifs,
      fauxNegatifs,
    },
    parCategorie,
    erreursDeTri: notes
      .filter(({ grade }) => grade.tri !== 1)
      .map((resultat) => ({
        cas: resultat.prompt_id,
        objet: resultat.prompt,
        categorie: resultat.categorie,
        attendu: resultat.attendu.reponseAttendue,
        decision: resultat.decision.kind,
      })),
    brouillons: {
      rediges: rediges.length,
      sains: rediges.filter(({ grade }) => grade.brouillon === 1).length,
      problemes: rediges.flatMap(({ prompt_id, problemesDuBrouillon }) =>
        problemesDuBrouillon.map((probleme) => `${prompt_id} : ${probleme}`),
      ),
    },
    usage: appels.reduce((total, { usage }) => additionner(total, usage), USAGE_NUL),
    coutEnDollars: coutTotal,
    coutParModele,
    modelesSubstitues: resultats.filter(({ modeleSubstitue }) => modeleSubstitue).length,
    latenceMoyenneParCasEnSecondes: latenceMoyenne,
    releveType: {
      courriels: COURRIELS_DU_RELEVE_TYPE,
      coutEnDollars:
        coutTotal === null ? null : ratio(coutTotal, resultats.length) * COURRIELS_DU_RELEVE_TYPE,
      secondes: latenceMoyenne * COURRIELS_DU_RELEVE_TYPE,
    },
  };
}
