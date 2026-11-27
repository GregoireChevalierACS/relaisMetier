import type { Horloge } from '@mailhelper/application';
import { causeDeLaPanne, type PanneDeWorkflow } from '@relaismetier/domain';

import type { JournalDesAlertes } from './ports.js';

/** Ce que n8n transmet quand un workflow échoue (workflow d'erreur). */
export interface SignalementDePanne extends PanneDeWorkflow {
  readonly execution: string | null;
  /** Lien vers l'exécution dans l'interface de n8n. */
  readonly lien: string | null;
}

/** La décision, et le courriel prêt à envoyer : n8n l'envoie si, et seulement si, envoyer est vrai. */
export interface Alerte {
  readonly envoyer: boolean;
  /** Destinataire et expéditeur : choisis par la configuration du service, jamais par n8n. */
  readonly a: string;
  readonly de: string;
  readonly cause: string;
  readonly occurrences: number;
  readonly objet: string;
  readonly corps: string;
}

export interface CasDUsageDesAlertes {
  signaler(panne: SignalementDePanne): Promise<Alerte>;
}

export function creerLesAlertes({
  journal,
  horloge,
  a,
  de,
}: {
  readonly journal: JournalDesAlertes;
  readonly horloge: Horloge;
  readonly a: string;
  readonly de: string;
}): CasDUsageDesAlertes {
  return {
    async signaler(panne) {
      const cause = causeDeLaPanne(panne);
      const { due, occurrences } = await journal.enregistrer(cause, horloge.maintenant());
      const corps = [
        `Le workflow « ${panne.workflow} » a échoué.`,
        '',
        `Nœud : ${panne.noeud ?? '(aucun)'}`,
        `Message : ${panne.message}`,
        ...(panne.execution === null ? [] : [`Exécution : ${panne.execution}`]),
        ...(panne.lien === null ? [] : [`Voir dans n8n : ${panne.lien}`]),
        '',
        `Cette cause s'est produite ${String(occurrences)} fois. Une nouvelle alerte pour la même cause ne partira pas avant une heure.`,
      ].join('\n');
      return {
        envoyer: due,
        a,
        de,
        cause,
        occurrences,
        objet: `[relaisMetier] Échec du workflow « ${panne.workflow} »`,
        corps,
      };
    },
  };
}
