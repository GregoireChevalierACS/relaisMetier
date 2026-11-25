import type { BoiteDeReception, DepositaireDeBrouillon, Horloge } from '@mailhelper/application';
import { err, heuresAvant, ok, type Result } from '@mailhelper/domain';

/** Une boîte partagée de l'entreprise, avec ses trois accès (contrats tenus par mailHelper). */
export interface BoiteGeree {
  readonly id: string;
  readonly adresse: string;
  /** Nombre maximal de courriels traités en même temps lors d'un relevé (phase 3). */
  readonly parallelisme: number;
  readonly reception: BoiteDeReception;
  readonly envoyes: BoiteDeReception;
  readonly depositaire: DepositaireDeBrouillon;
}

export interface DescriptionDeBoite {
  readonly id: string;
  readonly adresse: string;
}

export type ProblemeDeConnexion =
  { readonly kind: 'boite-inconnue' } | { readonly kind: 'boite-injoignable' };

export interface ConnexionVerifiee {
  /** Courriels reçus dans les dernières 24 heures, au plus LIMITE_DE_VERIFICATION. */
  readonly courrielsRecents: number;
}

export interface CasDUsageDesBoites {
  listerLesBoites(): readonly DescriptionDeBoite[];
  verifierLaConnexion(id: string): Promise<Result<ConnexionVerifiee, ProblemeDeConnexion>>;
}

export interface DependancesDesBoites {
  readonly boites: readonly BoiteGeree[];
  readonly horloge: Horloge;
  /** Reçoit la cause d'une boîte injoignable, qui n'est jamais renvoyée à l'appelant. */
  readonly signalerUnePanne: (erreur: unknown) => void;
}

/** Lecture volontairement légère : la vérification ne doit pas télécharger toute la boîte. */
export const LIMITE_DE_VERIFICATION = 10;

export function creerLesCasDUsageDesBoites({
  boites,
  horloge,
  signalerUnePanne,
}: DependancesDesBoites): CasDUsageDesBoites {
  const parId = new Map(boites.map((boite) => [boite.id, boite]));

  return {
    listerLesBoites: () => boites.map(({ id, adresse }) => ({ id, adresse })),

    async verifierLaConnexion(id) {
      const boite = parId.get(id);
      if (boite === undefined) return err({ kind: 'boite-inconnue' });
      try {
        const lot = await boite.reception.listerLesRecents({
          depuis: heuresAvant(horloge.maintenant(), 24),
          limite: LIMITE_DE_VERIFICATION,
        });
        return ok({ courrielsRecents: lot.courriels.length });
      } catch (erreur) {
        // Identifiants refusés, serveur injoignable… : un problème attendu, pas un bug.
        signalerUnePanne(erreur);
        return err({ kind: 'boite-injoignable' });
      }
    },
  };
}
