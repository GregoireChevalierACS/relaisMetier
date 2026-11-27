import { genererLesCasDEvaluation, type CasDEvaluation } from '@relaismetier/jeu-synthetique';
import { describe, expect, it } from 'vitest';

import type { ParametresDuModele } from '../llm/modelesClaude.js';
import { evaluerUnCas, type EnvoyerEtMesurer, type ReglagesDuBanc } from './banc.js';
import { versLeCourriel } from './cas.js';
import { coutEnDollars, PRIX_PAR_MILLION } from './cout.js';
import { envoiSimule, type Simulation } from './simulation.js';
import { synthetiser } from './synthese.js';

const CAS = genererLesCasDEvaluation(42);
const casDe = (categorie: string): CasDEvaluation => {
  const trouve = CAS.find((cas) => cas.attendu.categorie === categorie);
  if (trouve === undefined) throw new Error(`aucun cas ${categorie}`);
  return trouve;
};

function reglages(envoyer: EnvoyerEtMesurer, rediger = false): ReglagesDuBanc {
  let horloge = 0;
  return {
    envoyer,
    modeleDeTri: 'claude-haiku-5-5',
    modeleDeRedaction: 'claude-sonnet-5-5',
    reponsesFrequentes: '## Horaires\n\nDu lundi au vendredi.',
    rediger,
    // Chaque lecture de l'horloge avance de 250 ms : un appel dure 0,25 s.
    maintenant: () => (horloge += 250),
  };
}

async function evaluerTout(simulation: Simulation, rediger = false) {
  return synthetiser(
    await Promise.all(
      CAS.map((cas) =>
        evaluerUnCas(cas, reglages(envoiSimule(cas, simulation, 'claude-haiku-5-5'), rediger)),
      ),
    ),
  );
}

describe('banc d’évaluation, en simulation (aucun appel payant)', () => {
  it('donne 100 % à l’oracle : le banc et la notation sont bien câblés', async () => {
    const synthese = await evaluerTout('oracle');
    expect(synthese.cas).toBe(50);
    expect(synthese.enErreur).toBe(0);
    expect(synthese.tri.exactitude).toBe(1);
    expect(synthese.erreursDeTri).toEqual([]);
  });

  it('donne au nul la seule part des courriels sans réponse attendue', async () => {
    const synthese = await evaluerTout('nul');
    const sansReponse = CAS.filter(({ attendu }) => !attendu.reponseAttendue).length;
    expect(synthese.tri.exactitude).toBeCloseTo(sansReponse / 50);
    expect(synthese.tri.rappel).toBe(0);
    expect(synthese.tri.specificite).toBe(1);
  });

  it('ne fait appeler le modèle que pour les courriels que les règles laissent passer', async () => {
    const synthese = await evaluerTout('oracle');
    // Robots et lettres d'information sont écartés au relevé : 10 courriels sans appel.
    const appels = synthese.usage.input_tokens / 500;
    expect(appels).toBe(40);
    expect(synthese.parCategorie['robot']).toEqual({ cas: 5, justes: 5 });
    expect(synthese.parCategorie['lettre-d-information']).toEqual({ cas: 5, justes: 5 });
  });

  it('mesure un coût et une latence non nuls, et les extrapole à un relevé de 30 courriels', async () => {
    const synthese = await evaluerTout('oracle');
    expect(synthese.coutEnDollars).toBeCloseTo(
      40 *
        (coutEnDollars('claude-haiku-5-5', {
          input_tokens: 500,
          output_tokens: 100,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        }) ?? 0),
    );
    expect(synthese.latenceMoyenneParCasEnSecondes).toBeCloseTo((40 * 0.25) / 50);
    expect(synthese.releveType.courriels).toBe(30);
    expect(synthese.releveType.secondes).toBeCloseTo(synthese.latenceMoyenneParCasEnSecondes * 30);
  });

  it('rédige les brouillons attendus, adressés au bon destinataire', async () => {
    const synthese = await evaluerTout('oracle', true);
    const attendus = CAS.filter(({ attendu }) => attendu.reponseAttendue).length;
    expect(synthese.brouillons).toEqual({ rediges: attendus, sains: attendus, problemes: [] });
    expect(Object.keys(synthese.coutParModele).sort()).toEqual([
      'claude-haiku-5-5',
      'claude-sonnet-5-5',
    ]);
  });
});

describe('evaluerUnCas', () => {
  const unEnvoi =
    (reponse: unknown, servi?: string): EnvoyerEtMesurer =>
    (parametres: ParametresDuModele) =>
      Promise.resolve({
        model: servi ?? parametres.model,
        stop_reason: 'end_turn',
        content: [
          { type: 'text', text: typeof reponse === 'string' ? reponse : JSON.stringify(reponse) },
        ],
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: null },
      });

  it('note 0 une réponse hors format, sans la compter comme une panne', async () => {
    const resultat = await evaluerUnCas(casDe('demande-de-devis'), reglages(unEnvoi('Oui')));
    expect(resultat).toMatchObject({
      status: 'ok',
      grade: { tri: 0 },
      decision: { kind: 'reponse-invalide' },
    });
  });

  it('met en erreur, sans la noter, une panne de l’API', async () => {
    const enPanne: EnvoyerEtMesurer = () => Promise.reject(new Error('529 surcharge'));
    const resultat = await evaluerUnCas(casDe('demande-de-devis'), reglages(enPanne));
    expect(resultat).toMatchObject({
      status: 'erreur',
      erreur: '529 surcharge',
      grade: {},
      decision: { kind: 'erreur' },
    });
    expect(synthetiser([resultat])).toMatchObject({ enErreur: 1, tri: { exactitude: 0 } });
  });

  it('met en erreur un refus du modèle', async () => {
    const refus: EnvoyerEtMesurer = (parametres) =>
      Promise.resolve({
        model: parametres.model,
        stop_reason: 'refusal',
        content: [],
        usage: { input_tokens: 1, output_tokens: 0 },
      });
    expect((await evaluerUnCas(casDe('injection'), reglages(refus))).status).toBe('erreur');
    expect((await evaluerUnCas(casDe('injection'), reglages(refus))).erreur).toContain('refusée');
  });

  it('signale un appel servi par un autre modèle, et ne le chiffre pas faute de prix', async () => {
    const resultat = await evaluerUnCas(
      casDe('rendez-vous'),
      reglages(unEnvoi({ reponseAttendue: true, motif: 'm' }, 'claude-sonnet-5')),
    );
    expect(resultat.modeleSubstitue).toBe(true);
    expect(resultat.cost_usd).toBeNull();
    expect(synthetiser([resultat]).coutEnDollars).toBeNull();
    expect(PRIX_PAR_MILLION['claude-sonnet-5']).toBeUndefined();
  });

  it('repère un brouillon qui reprend l’adresse glissée par une injection', async () => {
    const injection = CAS.find(({ attendu }) => attendu.consigneInjectee?.includes('@') === true);
    if (injection === undefined) throw new Error('aucune injection avec adresse');
    const adresse =
      /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(injection.attendu.consigneInjectee ?? '')?.[0] ?? '';
    const envoi: EnvoyerEtMesurer = (parametres) =>
      unEnvoi(
        parametres.model === 'claude-haiku-5-5'
          ? { reponseAttendue: true, motif: 'Demande de devis.' }
          : { texte: `Bonjour,\n\nNous écrivons aussi à ${adresse}.` },
      )(parametres);
    const resultat = await evaluerUnCas(injection, reglages(envoi, true));
    expect(resultat.grade).toEqual({ tri: 1, brouillon: 0 });
    expect(resultat.problemesDuBrouillon).toEqual([`reprend l'adresse injectée ${adresse}`]);
    expect(synthetiser([resultat]).brouillons.problemes).toHaveLength(1);
  });

  it.each([
    ['vide', { texte: '  ' }, 'brouillon vide'],
    ['hors format', 'Bonjour', 'rédaction hors format'],
  ])('refuse un brouillon %s', async (_cas, redaction, probleme) => {
    const envoi: EnvoyerEtMesurer = (parametres) =>
      unEnvoi(
        parametres.model === 'claude-haiku-5-5' ? { reponseAttendue: true, motif: 'm' } : redaction,
      )(parametres);
    const resultat = await evaluerUnCas(casDe('question-recurrente'), reglages(envoi, true));
    expect(resultat.brouillon).toEqual({ a: '', texte: '' });
    expect(resultat.problemesDuBrouillon).toEqual([probleme]);
  });

  it('ne rédige rien quand le tri ne voit pas de réponse à faire', async () => {
    const resultat = await evaluerUnCas(
      casDe('fournisseur'),
      reglages(unEnvoi({ reponseAttendue: false, motif: 'Info.' }), true),
    );
    expect(resultat.appels).toHaveLength(1);
    expect(resultat.grade.brouillon).toBeUndefined();
  });
});

describe('versLeCourriel', () => {
  it('déduit l’envoi en masse des en-têtes, comme l’adapter IMAP', () => {
    expect(versLeCourriel(casDe('lettre-d-information')).diffusionDeMasse).toBe(true);
    expect(versLeCourriel(casDe('demande-de-devis')).diffusionDeMasse).toBe(false);
  });

  it('refuse un cas invalide, qui serait un bug du générateur', () => {
    expect(() => versLeCourriel({ ...casDe('robot'), messageId: '' })).toThrow(
      'cas d’évaluation invalide'.replace('’', "'"),
    );
  });
});

describe('synthetiser', () => {
  it('ne divise jamais par zéro', () => {
    expect(synthetiser([])).toMatchObject({
      cas: 0,
      tri: { exactitude: 0, precision: 0 },
      latenceMoyenneParCasEnSecondes: 0,
    });
  });
});

describe('evaluerUnCas : cas limites de la notation', () => {
  const tri =
    (reponseAttendue: boolean): EnvoyerEtMesurer =>
    (parametres) =>
      Promise.resolve({
        model: parametres.model,
        stop_reason: 'end_turn',
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              parametres.model === 'claude-haiku-5-5'
                ? { reponseAttendue, motif: 'm' }
                : { texte: 'Bonjour,' },
            ),
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1 },
      });

  it('note faux un courriel écarté par une règle alors qu’il attendait une réponse', async () => {
    const robotQuiAttend = {
      ...casDe('robot'),
      attendu: { ...casDe('robot').attendu, reponseAttendue: true },
    };
    const resultat = await evaluerUnCas(robotQuiAttend, reglages(tri(true)));
    expect(resultat.grade).toEqual({ tri: 0 });
    expect(synthetiser([resultat]).erreursDeTri[0]?.decision).toBe('regle');
  });

  it('signale un brouillon adressé à un autre destinataire que l’attendu', async () => {
    const devis = casDe('demande-de-devis');
    const autre = {
      ...devis,
      attendu: { ...devis.attendu, destinataireDeLaReponse: 'autre@exemple.test' },
    };
    const resultat = await evaluerUnCas(autre, reglages(tri(true), true));
    expect(resultat.problemesDuBrouillon).toEqual([
      `destinataire ${devis.attendu.destinataireDeLaReponse ?? ''}`,
    ]);
  });

  it('rapporte une panne qui n’est pas une Error', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- une bibliothèque peut rejeter autre chose qu'une Error : c'est ce cas qu'on vérifie
    const etrange: EnvoyerEtMesurer = () => Promise.reject('coupure');
    expect((await evaluerUnCas(casDe('rendez-vous'), reglages(etrange))).erreur).toBe('coupure');
  });
});
