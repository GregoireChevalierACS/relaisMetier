import type { Courriel } from '@mailhelper/domain';

import type { Redacteur, Trieur } from '../ports.js';

/** Réponse écrite à l'avance, ou panne (une Error est levée au lieu d'être renvoyée). */
type Reponse = unknown;

/** Modèle qui rejoue des réponses écrites à l'avance par identifiant de courriel. */
abstract class ModeleScripte {
  readonly appels: string[] = [];
  enCours = 0;
  maximumSimultane = 0;

  constructor(
    private readonly reponses: ReadonlyMap<string, Reponse>,
    private readonly parDefaut: Reponse,
  ) {}

  protected async repondre(courriel: Courriel): Promise<unknown> {
    this.appels.push(courriel.id);
    this.enCours += 1;
    this.maximumSimultane = Math.max(this.maximumSimultane, this.enCours);
    // Laisse les autres appels démarrer, pour mesurer la concurrence réelle.
    await new Promise((resolve) => setTimeout(resolve, 1));
    this.enCours -= 1;
    const reponse = this.reponses.has(courriel.id)
      ? this.reponses.get(courriel.id)
      : this.parDefaut;
    if (reponse instanceof Error) throw reponse;
    return reponse;
  }
}

export class TrieurScripte extends ModeleScripte implements Trieur {
  constructor(
    reponses: ReadonlyMap<string, Reponse> = new Map(),
    parDefaut: Reponse = { reponseAttendue: true, motif: 'Le client pose une question.' },
  ) {
    super(reponses, parDefaut);
  }

  trier(courriel: Courriel): Promise<unknown> {
    return this.repondre(courriel);
  }
}

export class RedacteurScripte extends ModeleScripte implements Redacteur {
  constructor(
    reponses: ReadonlyMap<string, Reponse> = new Map(),
    parDefaut: Reponse = { texte: 'Bonjour,\n\nNous vous répondons dès que possible.' },
  ) {
    super(reponses, parDefaut);
  }

  rediger(courriel: Courriel): Promise<unknown> {
    return this.repondre(courriel);
  }
}
