import { describe, expect, it } from 'vitest';

import { ConfigurationInvalide, lireLaConfiguration } from './configuration.js';

const unSecret = (): string => 'a'.repeat(32);

describe('lireLaConfiguration', () => {
  it('lit le port et le secret', () => {
    expect(lireLaConfiguration({ PORT: '8080', SECRET_PARTAGE: unSecret() })).toEqual({
      port: 8080,
      secretPartage: unSecret(),
    });
  });

  it('écoute sur le port 3000 par défaut', () => {
    expect(lireLaConfiguration({ SECRET_PARTAGE: unSecret() }).port).toBe(3000);
  });

  it('accepte les lettres, chiffres, - et _ dans le secret', () => {
    const secret = 'Abc-123_'.repeat(4);
    expect(lireLaConfiguration({ SECRET_PARTAGE: secret }).secretPartage).toBe(secret);
  });

  it.each([
    ['secret absent', {}, 'SECRET_PARTAGE est obligatoire'],
    ['secret trop court', { SECRET_PARTAGE: 'a'.repeat(31) }, 'au moins 32 caractères'],
    ['caractère interdit', { SECRET_PARTAGE: `${'a'.repeat(32)}"` }, 'que des lettres'],
    ['port non numérique', { PORT: 'abc', SECRET_PARTAGE: unSecret() }, 'PORT doit être un nombre'],
    ['port décimal', { PORT: '80.5', SECRET_PARTAGE: unSecret() }, 'PORT doit être un entier'],
    ['port nul', { PORT: '0', SECRET_PARTAGE: unSecret() }, 'entre 1 et 65535'],
    ['port trop grand', { PORT: '65536', SECRET_PARTAGE: unSecret() }, 'entre 1 et 65535'],
  ])('refuse un %s', (_cas, env, message) => {
    expect(() => lireLaConfiguration(env)).toThrow(ConfigurationInvalide);
    expect(() => lireLaConfiguration(env)).toThrow(message);
  });

  it('accepte les bornes du port', () => {
    expect(lireLaConfiguration({ PORT: '1', SECRET_PARTAGE: unSecret() }).port).toBe(1);
    expect(lireLaConfiguration({ PORT: '65535', SECRET_PARTAGE: unSecret() }).port).toBe(65535);
  });

  it("n'affiche jamais la valeur reçue, qui pourrait être un secret", () => {
    const presqueSecret = 'MotDePasseTropCourt';
    expect(() => lireLaConfiguration({ SECRET_PARTAGE: presqueSecret })).toThrow(
      new RegExp(`^(?![\\s\\S]*${presqueSecret})`),
    );
  });

  it('nomme toutes les variables fautives', () => {
    expect(() => lireLaConfiguration({ PORT: 'abc' })).toThrow(
      /PORT doit être un nombre\n- SECRET_PARTAGE est obligatoire/,
    );
  });
});
