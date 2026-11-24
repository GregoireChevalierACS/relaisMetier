import { describe, expect, it } from 'vitest';

import type { Courriel } from './courriels.js';
import { dateRfc5322, encoderEnMots, formaterAdresse, messageId, versEml } from './eml.js';

const decoder = (encode: string): string =>
  encode
    .split('\r\n ')
    .map((mot) => Buffer.from(/^=\?UTF-8\?B\?(.*)\?=$/.exec(mot)?.[1] ?? '', 'base64').toString())
    .join('');

const unCourriel = (precisions: Partial<Courriel> = {}): Courriel => ({
  numero: 7,
  boite: 'devis',
  de: { nom: 'Hélène Martin', adresse: 'helene.martin@exemple.test' },
  repondreA: null,
  objet: 'Demande de devis chaudière',
  corps: 'Bonjour,\n\nUn devis, svp.\n\nHélène',
  envoyeLe: Date.UTC(2027, 1, 15, 9, 5, 0),
  entetes: [],
  attendu: {
    categorie: 'demande-de-devis',
    reponseAttendue: true,
    regleDeNonReponse: null,
    destinataireDeLaReponse: 'x@exemple.test',
  },
  ...precisions,
});

describe('dateRfc5322', () => {
  it('écrit la date à l’heure d’Orléans (UTC+1 en hiver), avec des noms anglais', () => {
    expect(dateRfc5322(Date.UTC(2027, 1, 15, 9, 5, 7))).toBe('Mon, 15 Feb 2027 10:05:07 +0100');
  });

  it('change de jour quand l’heure locale passe minuit', () => {
    expect(dateRfc5322(Date.UTC(2027, 2, 6, 23, 30))).toBe('Sun, 07 Mar 2027 00:30:00 +0100');
  });
});

describe('encoderEnMots', () => {
  it('laisse un texte ASCII tel quel', () => {
    expect(encoderEnMots('Confirmation de commande BC-2027-0012')).toBe(
      'Confirmation de commande BC-2027-0012',
    );
  });

  it('encode un texte accentué en mots RFC 2047', () => {
    expect(encoderEnMots('Réunion')).toBe(
      `=?UTF-8?B?${Buffer.from('Réunion').toString('base64')}?=`,
    );
  });

  it('coupe un long texte en mots de 75 caractères au plus, sans scinder un caractère', () => {
    const texte =
      'Précommandes de granulés : -10 % jusqu’au 31 mars, et livraison offerte à Orléans';
    const encode = encoderEnMots(texte);
    const mots = encode.split('\r\n ');
    expect(mots.length).toBeGreaterThan(1);
    for (const mot of mots) expect(mot.length).toBeLessThanOrEqual(75);
    expect(decoder(encode)).toBe(texte);
  });
});

describe('formaterAdresse', () => {
  it('met un nom ASCII entre guillemets, en échappant guillemets et barres obliques', () => {
    expect(
      formaterAdresse({ nom: 'Agenda "Pro" \\ test', adresse: 'notifications@agenda-pro.test' }),
    ).toBe('"Agenda \\"Pro\\" \\\\ test" <notifications@agenda-pro.test>');
  });

  it('encode un nom accentué', () => {
    const resultat = formaterAdresse({ nom: 'Hélène Martin', adresse: 'h@exemple.test' });
    expect(resultat).toMatch(/^=\?UTF-8\?B\?.+\?= <h@exemple\.test>$/);
  });
});

describe('versEml', () => {
  const lignes = (courriel: Courriel): string[] => versEml(42, courriel).toString().split('\r\n');

  it('écrit les en-têtes puis le corps, avec des fins de ligne CRLF', () => {
    const texte = versEml(42, unCourriel()).toString();
    expect(texte.replace(/\r\n/g, '')).not.toContain('\n');
    expect(texte.endsWith('\r\n')).toBe(true);
    const [entetes, ...corps] = texte.split('\r\n\r\n');
    expect(entetes).toContain(`Message-ID: ${messageId(42, unCourriel())}`);
    expect(entetes).toContain('Date: Mon, 15 Feb 2027 10:05:00 +0100');
    expect(entetes).toMatch(/^To: =\?UTF-8\?B\?.+<devis@atelier-thermique\.test>$/m);
    expect(entetes).toContain(`Subject: ${encoderEnMots('Demande de devis chaudière')}`);
    expect(entetes).toContain('Content-Type: text/plain; charset=utf-8');
    expect(corps.join('\r\n\r\n')).toBe('Bonjour,\r\n\r\nUn devis, svp.\r\n\r\nHélène\r\n');
  });

  it('donne un Message-ID stable, propre à la graine et au numéro', () => {
    expect(messageId(42, unCourriel())).toBe('<jeu-42-007@jeu.relaismetier.test>');
    expect(messageId(7, unCourriel())).not.toBe(messageId(42, unCourriel()));
  });

  it('n’écrit Reply-To que si le courriel en a un', () => {
    expect(lignes(unCourriel()).some((l) => l.startsWith('Reply-To:'))).toBe(false);
    const avec = unCourriel({ repondreA: { nom: 'Perso', adresse: 'perso@exemple.test' } });
    expect(lignes(avec)).toContain('Reply-To: "Perso" <perso@exemple.test>');
  });

  it('écrit les en-têtes supplémentaires', () => {
    const lettre = unCourriel({
      entetes: [
        ['List-Unsubscribe', '<mailto:stop@exemple.test>'],
        ['Precedence', 'bulk'],
      ],
    });
    expect(lignes(lettre)).toEqual(
      expect.arrayContaining(['List-Unsubscribe: <mailto:stop@exemple.test>', 'Precedence: bulk']),
    );
  });

  it('refuse une ligne de plus de 998 octets', () => {
    expect(() => versEml(42, unCourriel({ corps: 'é'.repeat(500) }))).toThrow('plus de 998 octets');
  });
});
