// Les alertes envoyées à l'administrateur quand un workflow échoue : une par cause et par heure au
// plus, pour qu'une panne qui dure n'inonde pas sa boîte.

export const INTERVALLE_ENTRE_DEUX_ALERTES_EN_MILLISECONDES = 3_600_000;

/** Longueur maximale d'une cause : au-delà, ce sont des détails qui varient d'une fois à l'autre. */
export const LONGUEUR_MAXIMALE_D_UNE_CAUSE = 200;

export interface PanneDeWorkflow {
  readonly workflow: string;
  readonly noeud: string | null;
  readonly message: string;
}

/**
 * La cause d'une panne : le workflow, le nœud, et le message débarrassé de ce qui change à chaque
 * fois (nombres, identifiants). Deux échecs « délai dépassé après 30012 ms » et « après 30470 ms »
 * ont la même cause, et ne donnent qu'une alerte par heure.
 */
export function causeDeLaPanne({ workflow, noeud, message }: PanneDeWorkflow): string {
  const essentiel = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu, '…')
    .replace(/\d+/gu, '#')
    .replace(/\s+/gu, ' ')
    .trim();
  return `${workflow} / ${noeud ?? 'workflow'} : ${essentiel}`.slice(
    0,
    LONGUEUR_MAXIMALE_D_UNE_CAUSE,
  );
}

/** Une alerte est due si la cause n'a jamais été signalée, ou ne l'a plus été depuis une heure. */
export function alerteDue(derniereAlerteLe: number | null, maintenant: number): boolean {
  return (
    derniereAlerteLe === null ||
    maintenant - derniereAlerteLe >= INTERVALLE_ENTRE_DEUX_ALERTES_EN_MILLISECONDES
  );
}
