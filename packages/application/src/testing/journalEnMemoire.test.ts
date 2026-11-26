import { describe, expect, it } from 'vitest';

import { unTraitement, verifierLeContratDuJournal } from './contratDuJournal.js';
import { JournalEnMemoire, journalEnPanne } from './journalEnMemoire.js';

verifierLeContratDuJournal('doublure en mémoire', () => Promise.resolve(new JournalEnMemoire()));

describe('journalEnPanne', () => {
  it('échoue à l’inscription comme à la lecture', async () => {
    await expect(journalEnPanne().inscrireLesNouveaux([unTraitement()])).rejects.toThrow(
      'base injoignable',
    );
    await expect(journalEnPanne().lire('devis/1')).rejects.toThrow('base injoignable');
  });
});
