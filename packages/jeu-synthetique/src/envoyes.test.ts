import { describe, expect, it } from 'vitest';

import { creerAlea } from './alea.js';
import { instantDEnvoi, messageIdDEnvoi, versEmlDEnvoi } from './envoyes.js';
import { genererLeModele } from './modele.js';

describe('versEmlDEnvoi', () => {
  const [devis] = genererLeModele(creerAlea(42)).devis;
  if (devis === undefined) throw new Error('jeu sans devis');
  // Les 256 valeurs d'octet : le base64 doit les restituer toutes.
  const pdf = Buffer.from(Array.from({ length: 256 }, (_, octet) => octet));
  const texte = versEmlDEnvoi(42, devis, pdf).toString();
  const frontiere = `=_relaismetier_${devis.numero}`;

  it('part de la boîte devis@ vers le client, avec un Message-ID stable', () => {
    expect(texte).toContain(`Message-ID: ${messageIdDEnvoi(42, devis.numero)}`);
    expect(texte).toMatch(/^From: .+<devis@atelier-thermique\.test>$/m);
    expect(texte).toContain(`<${devis.client.courriel}>`);
    expect(texte).toContain(`Subject: Votre devis ${devis.numero}`);
  });

  it('est daté du jour du devis, à 10 h heure d’Orléans', () => {
    expect(new Date(instantDEnvoi(devis)).toISOString()).toBe(`${devis.date}T09:00:00.000Z`);
    expect(texte).toMatch(/^Date: \w{3}, \d{2} Feb 2027 10:00:00 \+0100$/m);
  });

  it('joint le PDF en base64, restitué octet pour octet', () => {
    const parties = texte.split(`--${frontiere}`);
    expect(parties).toHaveLength(4);
    expect(parties[3]).toBe('--\r\n');
    const [entetes, base64] = (parties[2] ?? '').split('\r\n\r\n');
    expect(entetes).toContain(`filename="${devis.numero}.pdf"`);
    expect(Buffer.from((base64 ?? '').replace(/\r\n/g, ''), 'base64')).toEqual(pdf);
    for (const ligne of (base64 ?? '').trim().split('\r\n'))
      expect(ligne.length).toBeLessThanOrEqual(76);
  });

  it.each([
    ['Mme', 'Madame'],
    ['M.', 'Monsieur'],
  ] as const)('s’adresse à un client « %s » par « %s »', (civilite, appel) => {
    const pour = { ...devis, client: { ...devis.client, civilite } };
    expect(versEmlDEnvoi(42, pour, pdf).toString()).toContain(
      `Bonjour ${appel} ${devis.client.nom},`,
    );
  });

  it('donne les mêmes octets à chaque génération', () => {
    expect(versEmlDEnvoi(42, devis, pdf)).toEqual(versEmlDEnvoi(42, devis, pdf));
  });

  it('accepte un PDF vide', () => {
    expect(versEmlDEnvoi(42, devis, Buffer.alloc(0)).toString()).toContain(`--${frontiere}--`);
  });
});
