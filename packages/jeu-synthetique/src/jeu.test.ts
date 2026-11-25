import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { BOITES } from './entreprise.js';
import { CHEMINS, FICHIER_DU_MANIFESTE, genererLeJeu, type Jeu } from './jeu.js';

const parChemin = (jeu: Jeu): Map<string, Buffer> =>
  new Map(jeu.fichiers.map(({ chemin, contenu }) => [chemin, contenu]));

describe('genererLeJeu', async () => {
  const jeu = await genererLeJeu(42);
  const fichiers = parChemin(jeu);

  it('donne exactement les mêmes fichiers pour la même graine', async () => {
    const encore = await genererLeJeu(42);
    expect(parChemin(encore)).toEqual(fichiers);
  });

  it('donne un autre jeu pour une autre graine', async () => {
    const autre = parChemin(await genererLeJeu(7));
    expect(autre.get(FICHIER_DU_MANIFESTE)).not.toEqual(fichiers.get(FICHIER_DU_MANIFESTE));
  });

  it('écrit 50 courriels reçus, 8 envois de devis, 8 devis, une variante, 2 exports et le manifeste', () => {
    expect([...fichiers.keys()].filter((c) => c.startsWith('courriels/'))).toHaveLength(50);
    expect([...fichiers.keys()].filter((c) => c.startsWith('envoyes/'))).toHaveLength(8);
    expect([...fichiers.keys()].filter((c) => c.endsWith('.pdf'))).toHaveLength(9);
    expect(fichiers.has(CHEMINS.devisSignes)).toBe(true);
    expect(fichiers.has(CHEMINS.contrats)).toBe(true);
    expect(fichiers.size).toBe(70);
  });

  it('écrit dans le manifeste l’empreinte de chaque autre fichier', () => {
    const { empreintes } = jeu.manifeste;
    expect(Object.keys(empreintes).sort()).toEqual(
      [...fichiers.keys()].filter((c) => c !== FICHIER_DU_MANIFESTE).sort(),
    );
    for (const [chemin, empreinte] of Object.entries(empreintes)) {
      expect(
        createHash('sha256')
          .update(fichiers.get(chemin) ?? '')
          .digest('hex'),
      ).toBe(empreinte);
    }
  });

  it('écrit le manifeste tel qu’il est renvoyé', () => {
    expect(JSON.parse(fichiers.get(FICHIER_DU_MANIFESTE)?.toString() ?? '')).toEqual(jeu.manifeste);
  });

  it('range chaque courriel dans le dossier de sa boîte, avec un Message-ID unique', () => {
    const { courriels } = jeu.manifeste;
    for (const courriel of courriels) {
      expect(courriel.fichier.startsWith(`courriels/${courriel.boite}/`)).toBe(true);
      expect(fichiers.get(courriel.fichier)?.toString()).toContain(
        `Message-ID: ${courriel.messageId}`,
      );
      expect(fichiers.get(courriel.fichier)?.toString()).toContain(
        `<${jeu.manifeste.boites[courriel.boite]}>`,
      );
    }
    expect(new Set(courriels.map((c) => c.messageId)).size).toBe(courriels.length);
    expect(jeu.manifeste.boites).toEqual(BOITES);
  });

  it('attend les champs de chaque devis, et le refus de la mise en page modifiée', () => {
    const variantes = jeu.manifeste.devis.filter((d) => d.miseEnPage === 'variante');
    expect(variantes).toEqual([
      {
        fichier: CHEMINS.variante('D-2027-0001'),
        miseEnPage: 'variante',
        numero: 'D-2027-0001',
        attendu: { refus: 'mise-en-page-inconnue' },
      },
    ]);
    for (const devis of jeu.manifeste.devis) expect(fichiers.has(devis.fichier)).toBe(true);
  });

  it('envoie chaque devis à son client depuis la boîte devis@, PDF joint', () => {
    expect(jeu.manifeste.envoyes).toHaveLength(8);
    for (const envoi of jeu.manifeste.envoyes) {
      const devis = jeu.manifeste.devis.find(
        (d) => d.miseEnPage === 'reference' && d.attendu.numero === envoi.devis,
      );
      expect(devis?.miseEnPage === 'reference' ? devis.attendu.client.courriel : null).toBe(
        envoi.destinataire,
      );
      const texte = fichiers.get(envoi.fichier)?.toString() ?? '';
      expect(texte).toContain(`Message-ID: ${envoi.messageId}`);
      expect(texte).toContain(`filename="${envoi.devis}.pdf"`);
      expect(envoi.envoyeLe < jeu.manifeste.jourDeReference).toBe(true);
    }
  });
});
