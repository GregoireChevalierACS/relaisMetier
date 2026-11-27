import type { BoiteDeReception, DepositaireDeBrouillon } from '@mailhelper/application';
import {
  BoiteEnMemoire,
  DepositaireEnMemoire,
  depositaireEnPanne,
  HorlogeFixe,
  INSTANT_DE_REFERENCE,
  UNE_HEURE,
  unCourriel,
} from '@mailhelper/application/testing';
import type { Courriel } from '@mailhelper/domain';
import { cleDeTraitement } from '@relaismetier/domain';
import { describe, expect, it, vi } from 'vitest';

import { creerLesCasDUsageDesBoites, type BoiteGeree } from './boites.js';
import type { Redacteur, Trieur } from './ports.js';
import { JournalEnMemoire, RedacteurScripte, TrieurScripte } from './testing/index.js';
import { creerLeTri, DUREE_DE_RESERVATION_EN_MILLISECONDES, type Modeles } from './tri.js';

const unClient = (id: string, surcharges: Partial<Parameters<typeof unCourriel>[0]> = {}) =>
  unCourriel({ id, recuLe: INSTANT_DE_REFERENCE - UNE_HEURE, ...surcharges });

interface Banc {
  readonly courriels: readonly Courriel[];
  readonly reception?: BoiteDeReception;
  readonly depositaire?: DepositaireDeBrouillon;
  readonly trieur?: Trieur;
  readonly redacteur?: Redacteur;
  readonly sansModele?: boolean;
  readonly parallelisme?: number;
  readonly horloge?: HorlogeFixe;
}

/** Relève une boîte (vrai relevé), puis renvoie de quoi la trier. */
async function unBanc({
  courriels,
  reception,
  depositaire = new DepositaireEnMemoire(),
  trieur = new TrieurScripte(),
  redacteur = new RedacteurScripte(),
  sansModele = false,
  parallelisme = 2,
  horloge = new HorlogeFixe(),
}: Banc) {
  const journal = new JournalEnMemoire();
  const releve: BoiteGeree = {
    id: 'devis',
    adresse: 'devis@atelier-thermique.test',
    parallelisme,
    reception: new BoiteEnMemoire(courriels),
    envoyes: new BoiteEnMemoire([]),
    depositaire,
  };
  const signalerUnePanne = vi.fn();
  await creerLesCasDUsageDesBoites({
    boites: [releve],
    journal,
    horloge,
    signalerUnePanne,
  }).relever('devis');
  const boite = { ...releve, reception: reception ?? releve.reception };
  const modeles: Modeles | null = sansModele ? null : { trieur, redacteur };
  const tri = creerLeTri({ boites: [boite], journal, horloge, modeles, signalerUnePanne });
  return { tri, journal, depositaire, signalerUnePanne };
}

const etatDe = async (journal: JournalEnMemoire, id: string) =>
  (await journal.lire(cleDeTraitement('devis', id)))?.etat;

describe('trier', () => {
  it('ne fait rien quand aucun modèle n’est configuré, sans consommer de tentative', async () => {
    const { tri, journal } = await unBanc({ courriels: [unClient('1')], sansModele: true });

    expect(await tri.trier('devis')).toEqual({
      ok: true,
      value: {
        desactive: true,
        traites: 0,
        sansReponse: 0,
        brouillons: 0,
        aRetenter: 0,
        misDeCote: 0,
      },
    });
    expect(await etatDe(journal, '1')).toEqual({ kind: 'a-trier', tentatives: 0 });
  });

  it('signale une boîte inconnue', async () => {
    const { tri } = await unBanc({ courriels: [] });
    expect(await tri.trier('inconnue')).toEqual({ ok: false, error: { kind: 'boite-inconnue' } });
  });

  it('ne fait rien quand il n’y a rien à trier', async () => {
    const { tri } = await unBanc({ courriels: [] });
    const resultat = await tri.trier('devis');
    expect(resultat.ok && resultat.value.traites).toBe(0);
  });

  it('dépose un brouillon adressé à l’adresse de réponse, quand une réponse est attendue', async () => {
    const depositaire = new DepositaireEnMemoire();
    const courriel = unClient('1', {
      objet: 'Devis chaudière',
      repondreA: { nom: 'Claire Martin', adresse: 'claire.perso@exemple.fr' },
    });
    const redacteur = new RedacteurScripte(
      new Map([['1', { texte: 'Bonjour Madame,\n\nVoici…' }]]),
    );
    const { tri, journal } = await unBanc({ courriels: [courriel], depositaire, redacteur });

    expect(await tri.trier('devis')).toMatchObject({
      ok: true,
      value: { traites: 1, brouillons: 1 },
    });
    expect(depositaire.depots).toEqual([
      {
        brouillon: {
          a: { nom: 'Claire Martin', adresse: 'claire.perso@exemple.fr' },
          objet: 'RE: Devis chaudière',
          corps: 'Bonjour Madame,\n\nVoici…',
          enReponseA: '1',
        },
        piecesJointes: [],
      },
    ]);
    expect(await etatDe(journal, '1')).toEqual({
      kind: 'brouillon-depose',
      motif: 'Le client pose une question.',
    });
  });

  it('ne rédige rien quand le modèle juge qu’aucune réponse n’est attendue', async () => {
    const trieur = new TrieurScripte(
      new Map([['1', { reponseAttendue: false, motif: 'Simple information.' }]]),
    );
    const redacteur = new RedacteurScripte();
    const depositaire = new DepositaireEnMemoire();
    const { tri, journal } = await unBanc({
      courriels: [unClient('1')],
      trieur,
      redacteur,
      depositaire,
    });

    expect(await tri.trier('devis')).toMatchObject({
      ok: true,
      value: { sansReponse: 1, brouillons: 0 },
    });
    expect(redacteur.appels).toEqual([]);
    expect(depositaire.depots).toEqual([]);
    expect(await etatDe(journal, '1')).toEqual({
      kind: 'sans-reponse',
      motif: 'Simple information.',
      par: 'modele',
    });
  });

  it('laisse les règles de mailHelper l’emporter sur le modèle', async () => {
    // Un envoi en nombre à trier (règle apparue entre le relevé et le tri, par exemple).
    const journal = new JournalEnMemoire();
    const lettre = unClient('1', { diffusionDeMasse: true });
    await journal.inscrireLesNouveaux([
      {
        cle: 'devis/1',
        boite: 'devis',
        idCourriel: '1',
        recuLe: lettre.recuLe,
        etat: { kind: 'a-trier', tentatives: 0 },
      },
    ]);
    const depositaire = new DepositaireEnMemoire();
    const tri = creerLeTri({
      boites: [
        {
          id: 'devis',
          adresse: 'devis@atelier-thermique.test',
          parallelisme: 1,
          reception: new BoiteEnMemoire([lettre]),
          envoyes: new BoiteEnMemoire([]),
          depositaire,
        },
      ],
      journal,
      horloge: new HorlogeFixe(),
      modeles: { trieur: new TrieurScripte(), redacteur: new RedacteurScripte() },
      signalerUnePanne: vi.fn(),
    });

    await tri.trier('devis');

    expect(depositaire.depots).toEqual([]);
    expect(await etatDe(journal, '1')).toMatchObject({ kind: 'sans-reponse', par: 'regle' });
  });

  it.each([
    [
      'un tri hors format',
      { trieur: new TrieurScripte(new Map([['1', { reponse: 'oui' }]])) },
      'réponse du tri invalide',
    ],
    [
      'une rédaction hors format',
      { redacteur: new RedacteurScripte(new Map([['1', 'Bonjour']])) },
      'réponse de la rédaction invalide',
    ],
    [
      'une rédaction vide',
      { redacteur: new RedacteurScripte(new Map([['1', { texte: '   ' }]])) },
      'brouillon impossible : texte-vide',
    ],
    [
      'une panne du modèle de tri',
      { trieur: new TrieurScripte(new Map([['1', new Error('surcharge')]])) },
      'échec : tri',
    ],
    [
      'une panne du modèle de rédaction',
      { redacteur: new RedacteurScripte(new Map([['1', new Error('refus')]])) },
      'échec : rédaction',
    ],
    ['une panne du dépôt', { depositaire: depositaireEnPanne() }, 'échec : dépôt du brouillon'],
  ])(
    'retente plus tard après %s, puis met de côté au troisième échec',
    async (_cas, banc, cause) => {
      const horloge = new HorlogeFixe();
      const { tri, journal } = await unBanc({ courriels: [unClient('1')], horloge, ...banc });

      expect(await tri.trier('devis')).toMatchObject({ ok: true, value: { aRetenter: 1 } });
      expect(await etatDe(journal, '1')).toEqual({ kind: 'a-trier', tentatives: 1 });

      await tri.trier('devis');
      expect(await tri.trier('devis')).toMatchObject({ ok: true, value: { misDeCote: 1 } });
      expect(await etatDe(journal, '1')).toEqual({ kind: 'mis-de-cote', cause, tentatives: 3 });
    },
  );

  it('transmet la cause d’une panne à qui surveille', async () => {
    const trieur = new TrieurScripte(new Map([['1', new Error('surcharge')]]));
    const { tri, signalerUnePanne } = await unBanc({ courriels: [unClient('1')], trieur });
    await tri.trier('devis');
    expect(signalerUnePanne).toHaveBeenCalledWith(new Error('surcharge'));
  });

  it('compte un échec quand le courriel a disparu de la boîte', async () => {
    const { tri, journal } = await unBanc({
      courriels: [unClient('1')],
      reception: new BoiteEnMemoire([]),
    });
    await tri.trier('devis');
    expect(await etatDe(journal, '1')).toEqual({ kind: 'a-trier', tentatives: 1 });
  });

  it('rend les courriels réservés, sans tentative consommée, quand la boîte est injoignable', async () => {
    const reception: BoiteDeReception = {
      listerLesRecents: () => Promise.reject(new Error('réseau coupé')),
    };
    const { tri, journal } = await unBanc({ courriels: [unClient('1')], reception });

    expect(await tri.trier('devis')).toEqual({ ok: false, error: { kind: 'boite-injoignable' } });
    expect(await etatDe(journal, '1')).toEqual({ kind: 'a-trier', tentatives: 0 });
    // Rendu aussitôt, sans attendre l'expiration de la réservation.
    const reservables = await journal.reserverLesATrier({
      boite: 'devis',
      limite: 10,
      maintenant: INSTANT_DE_REFERENCE,
      dureeEnMillisecondes: DUREE_DE_RESERVATION_EN_MILLISECONDES,
    });
    expect(reservables).toHaveLength(1);
  });

  it('limite le nombre de courriels traités en même temps au parallélisme de la boîte', async () => {
    const trieur = new TrieurScripte();
    const courriels = Array.from({ length: 6 }, (_, i) => unClient(String(i)));
    const { tri } = await unBanc({ courriels, trieur, parallelisme: 2 });

    expect(await tri.trier('devis')).toMatchObject({
      ok: true,
      value: { traites: 6, brouillons: 6 },
    });
    expect(trieur.maximumSimultane).toBe(2);
  });

  it('ne trie jamais deux fois le même courriel, même quand deux tris se chevauchent', async () => {
    const trieur = new TrieurScripte();
    const depositaire = new DepositaireEnMemoire();
    const courriels = Array.from({ length: 5 }, (_, i) => unClient(String(i)));
    const { tri } = await unBanc({ courriels, trieur, depositaire });

    await Promise.all([tri.trier('devis'), tri.trier('devis')]);

    expect([...trieur.appels].sort()).toEqual(['0', '1', '2', '3', '4']);
    expect(depositaire.depots).toHaveLength(5);
  });
});
