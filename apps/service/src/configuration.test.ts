import { describe, expect, it } from 'vitest';

import {
  ConfigurationInvalide,
  lireLaConfiguration,
  MODELE_DE_REDACTION_PAR_DEFAUT,
  MODELE_DE_TRI_PAR_DEFAUT,
} from './configuration.js';

const unSecret = (): string => 'a'.repeat(32);
const URL = 'postgres://relais:mot-de-passe@postgres:5432/relais';
const ENV = { SECRET_PARTAGE: unSecret(), URL_DE_LA_BASE: URL };

describe('lireLaConfiguration', () => {
  it('lit le port, le secret et la base', () => {
    expect(lireLaConfiguration({ ...ENV, PORT: '8080' })).toEqual({
      port: 8080,
      secretPartage: unSecret(),
      urlDeLaBase: URL,
      claude: null,
      fichierDesReponsesFrequentes: 'config/reponses-frequentes.md',
    });
  });

  it('désactive le tri sans clé d’API, ou avec une clé vide', () => {
    expect(lireLaConfiguration(ENV).claude).toBeNull();
    expect(lireLaConfiguration({ ...ENV, ANTHROPIC_API_KEY: '  ' }).claude).toBeNull();
  });

  it('active le tri avec une clé d’API, sur les modèles de la feuille de route par défaut', () => {
    expect(lireLaConfiguration({ ...ENV, ANTHROPIC_API_KEY: 'sk-ant-test' }).claude).toEqual({
      cleDApi: 'sk-ant-test',
      modeleDeTri: MODELE_DE_TRI_PAR_DEFAUT,
      modeleDeRedaction: MODELE_DE_REDACTION_PAR_DEFAUT,
    });
    expect(MODELE_DE_TRI_PAR_DEFAUT).toBe('claude-haiku-5-5');
    expect(MODELE_DE_REDACTION_PAR_DEFAUT).toBe('claude-sonnet-5-5');
  });

  it('accepte d’autres modèles et un autre fichier de réponses', () => {
    const configuration = lireLaConfiguration({
      ...ENV,
      ANTHROPIC_API_KEY: 'sk-ant-test',
      MODELE_DE_TRI: 'modele-a',
      MODELE_DE_REDACTION: 'modele-b',
      FICHIER_DES_REPONSES_FREQUENTES: '/config/faq.md',
    });
    expect(configuration.claude).toMatchObject({
      modeleDeTri: 'modele-a',
      modeleDeRedaction: 'modele-b',
    });
    expect(configuration.fichierDesReponsesFrequentes).toBe('/config/faq.md');
  });

  it('écoute sur le port 3000 par défaut', () => {
    expect(lireLaConfiguration(ENV).port).toBe(3000);
  });

  it('accepte les lettres, chiffres, - et _ dans le secret', () => {
    const secret = 'Abc-123_'.repeat(4);
    expect(lireLaConfiguration({ ...ENV, SECRET_PARTAGE: secret }).secretPartage).toBe(secret);
  });

  it('accepte une URL postgresql://', () => {
    const url = 'postgresql://relais@postgres/relais';
    expect(lireLaConfiguration({ ...ENV, URL_DE_LA_BASE: url }).urlDeLaBase).toBe(url);
  });

  it.each([
    ['secret absent', { URL_DE_LA_BASE: URL }, 'SECRET_PARTAGE est obligatoire'],
    ['secret trop court', { ...ENV, SECRET_PARTAGE: 'a'.repeat(31) }, 'au moins 32 caractères'],
    ['caractère interdit', { ...ENV, SECRET_PARTAGE: `${'a'.repeat(32)}"` }, 'que des lettres'],
    ['port non numérique', { ...ENV, PORT: 'abc' }, 'PORT doit être un nombre'],
    ['port décimal', { ...ENV, PORT: '80.5' }, 'PORT doit être un entier'],
    ['port nul', { ...ENV, PORT: '0' }, 'entre 1 et 65535'],
    ['port trop grand', { ...ENV, PORT: '65536' }, 'entre 1 et 65535'],
    ['base absente', { SECRET_PARTAGE: unSecret() }, 'URL_DE_LA_BASE est obligatoire'],
    ['base autre que PostgreSQL', { ...ENV, URL_DE_LA_BASE: 'mysql://x' }, 'URL postgres://'],
    ['modèle vide', { ...ENV, MODELE_DE_TRI: '' }, 'MODELE_DE_TRI ne doit pas être vide'],
  ])('refuse un %s', (_cas, env, message) => {
    expect(() => lireLaConfiguration(env)).toThrow(ConfigurationInvalide);
    expect(() => lireLaConfiguration(env)).toThrow(message);
  });

  it('accepte les bornes du port', () => {
    expect(lireLaConfiguration({ ...ENV, PORT: '1' }).port).toBe(1);
    expect(lireLaConfiguration({ ...ENV, PORT: '65535' }).port).toBe(65535);
  });

  it("n'affiche jamais la valeur reçue, qui pourrait être un secret", () => {
    const presqueSecret = 'MotDePasseTropCourt';
    expect(() => lireLaConfiguration({ ...ENV, SECRET_PARTAGE: presqueSecret })).toThrow(
      new RegExp(`^(?![\\s\\S]*${presqueSecret})`),
    );
    // L'URL de la base contient un mot de passe : elle n'apparaît pas non plus.
    expect(() => lireLaConfiguration({ ...ENV, URL_DE_LA_BASE: 'mot-de-passe-secret' })).toThrow(
      /^(?![\s\S]*mot-de-passe-secret)/,
    );
  });

  it('nomme toutes les variables fautives', () => {
    expect(() => lireLaConfiguration({ PORT: 'abc' })).toThrow(
      /PORT doit être un nombre\n- SECRET_PARTAGE est obligatoire\n- URL_DE_LA_BASE est obligatoire/,
    );
  });
});
