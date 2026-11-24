// Formats français écrits à la main : Intl insère des espaces fines insécables (U+202F) que les
// polices standard des PDF ne savent pas afficher, et sa sortie peut varier selon la version d'ICU.

/** 123456789 centimes → « 1 234 567,89 € ». */
export function formaterEuros(centimes: number): string {
  if (!Number.isSafeInteger(centimes))
    throw new RangeError(`Montant invalide : ${String(centimes)}`);
  const signe = centimes < 0 ? '-' : '';
  const absolu = Math.abs(centimes);
  const euros = String(Math.floor(absolu / 100)).replace(/\B(?=(\d{3})+$)/g, ' ');
  const cents = String(absolu % 100).padStart(2, '0');
  return `${signe}${euros},${cents} €`;
}

/** 550 points de base → « 5,5 % ». */
export function formaterTaux(pointsDeBase: number): string {
  const entier = Math.floor(pointsDeBase / 100);
  const decimale = (pointsDeBase % 100) / 10;
  return decimale === 0 ? `${String(entier)} %` : `${String(entier)},${String(decimale)} %`;
}

/** Date ISO « 2027-02-09 » → « 09/02/2027 ». */
export function formaterDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new RangeError(`Date ISO invalide : ${iso}`);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
