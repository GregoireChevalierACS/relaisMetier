import type { Alea } from './alea.js';
import {
  CHANTIER_CHAUDIERE,
  CHANTIERS,
  EQUIPEMENTS_ENTRETENUS,
  type Chantier,
  type TauxDeTva,
} from './chantiers.js';
import { ajouterJours, ajouterUnAn } from './dates.js';
import type { CodeFournisseur } from './entreprise.js';
import { tirerDesPersonnes, type Personne } from './personnes.js';

export const NOMBRE_DE_DEVIS = 8;
export const NOMBRE_DE_CONTRATS = 30;

/** Montants en centimes, toujours entiers : aucun arrondi flottant dans les totaux. */
export interface LigneDeDevis {
  readonly reference: string;
  readonly designation: string;
  readonly quantite: number;
  readonly prixUnitaireHt: number;
  readonly tauxDeTva: TauxDeTva;
  readonly totalHt: number;
  readonly fournisseur: CodeFournisseur | null;
}

export interface Aide {
  readonly libelle: string;
  readonly montant: number;
}

export interface Devis {
  readonly numero: string;
  readonly date: string;
  readonly validiteJours: number;
  readonly client: Personne;
  readonly chantier: string;
  readonly objet: string;
  readonly equipement: string;
  readonly lignes: readonly LigneDeDevis[];
  readonly aides: readonly Aide[];
  readonly totalHt: number;
  readonly totalTva: number;
  readonly totalTtc: number;
  readonly resteACharge: number;
}

export interface DevisSigne {
  readonly numero: string;
  readonly dateDeSignature: string;
}

export interface ContratDEntretien {
  readonly numero: string;
  readonly client: Personne;
  readonly equipement: string;
  readonly derniereVisite: string;
  /** Date anniversaire : la prochaine visite est due ce jour-là. */
  readonly echeance: string;
}

export interface Modele {
  readonly devis: readonly Devis[];
  readonly devisSignes: readonly DevisSigne[];
  readonly contrats: readonly ContratDEntretien[];
  /** Personnes qui n'ont ni devis ni contrat : auteurs des autres courriels du jeu. */
  readonly correspondants: readonly Personne[];
}

/** Nombre de correspondants sans devis ni contrat, pour les courriels. */
export const NOMBRE_DE_CORRESPONDANTS = 40;

/** Tire un montant entre deux bornes, arrondi à l'euro (ou au pas demandé, en centimes). */
const tirerMontant = (alea: Alea, [min, max]: readonly [number, number], pas = 100): number =>
  alea.entier(Math.ceil(min / pas), Math.floor(max / pas)) * pas;

const tva = (ht: number, taux: TauxDeTva): number => Math.round((ht * taux) / 10_000);

function chiffrer(
  alea: Alea,
  chantier: Chantier,
): Pick<Devis, 'lignes' | 'aides' | 'totalHt' | 'totalTva' | 'totalTtc' | 'resteACharge'> {
  const lignes = chantier.lignes.map((type): LigneDeDevis => {
    const quantite = alea.entier(...type.quantite);
    const prixUnitaireHt = tirerMontant(alea, type.prixUnitaireHt);
    return {
      reference: type.reference,
      designation: type.designation,
      quantite,
      prixUnitaireHt,
      tauxDeTva: chantier.tauxDeTva,
      totalHt: quantite * prixUnitaireHt,
      fournisseur: type.fournisseur,
    };
  });
  const totalHt = lignes.reduce((somme, ligne) => somme + ligne.totalHt, 0);
  const totalTva = lignes.reduce((somme, ligne) => somme + tva(ligne.totalHt, ligne.tauxDeTva), 0);
  const totalTtc = totalHt + totalTva;

  // Les aides ne couvrent jamais plus de la moitié du devis : le reste à charge reste réaliste.
  let plafond = Math.floor(totalTtc / 2 / 1000) * 1000;
  const aides = chantier.aides.map((type): Aide => {
    const montant = Math.min(tirerMontant(alea, type.montant, 1000), plafond);
    plafond -= montant;
    return { libelle: type.libelle, montant };
  });
  const resteACharge = totalTtc - aides.reduce((somme, aide) => somme + aide.montant, 0);

  return { lignes, aides, totalHt, totalTva, totalTtc, resteACharge };
}

export function genererLeModele(alea: Alea): Modele {
  const personnes = tirerDesPersonnes(
    alea,
    NOMBRE_DE_DEVIS + NOMBRE_DE_CONTRATS + NOMBRE_DE_CORRESPONDANTS,
  );
  const clientsDesDevis = personnes.slice(0, NOMBRE_DE_DEVIS);
  const clientsDesContrats = personnes.slice(NOMBRE_DE_DEVIS, NOMBRE_DE_DEVIS + NOMBRE_DE_CONTRATS);
  const correspondants = personnes.slice(NOMBRE_DE_DEVIS + NOMBRE_DE_CONTRATS);

  const devis = clientsDesDevis.map((client, index): Devis => {
    // Le premier devis est toujours un remplacement de chaudière : il touche deux fournisseurs,
    // et il est signé (phase 6 : un devis signé donne un bon de commande par fournisseur).
    const chantier = index === 0 ? CHANTIER_CHAUDIERE : alea.choisir(CHANTIERS);
    return {
      numero: `D-2027-${String(index + 1).padStart(4, '0')}`,
      date: `2027-02-${String(1 + index * 3).padStart(2, '0')}`,
      validiteJours: 90,
      client,
      chantier: chantier.code,
      objet: chantier.objet,
      equipement: chantier.equipement,
      ...chiffrer(alea, chantier),
    };
  });

  // Un devis sur deux est signé, quelques jours après son envoi.
  const devisSignes = devis
    .filter((_, index) => index % 2 === 0)
    .map(({ numero, date }) => ({
      numero,
      dateDeSignature: ajouterJours(date, alea.entier(2, 6)),
    }));

  const contrats = clientsDesContrats.map((client, index): ContratDEntretien => {
    // Dernières visites étalées sur 2026 : chaque mois de 2027 a ses échéances.
    const derniereVisite = `2026-${String((index % 12) + 1).padStart(2, '0')}-${String(alea.entier(1, 28)).padStart(2, '0')}`;
    return {
      numero: `CE-${String(index + 1).padStart(4, '0')}`,
      client,
      equipement: alea.choisir(EQUIPEMENTS_ENTRETENUS),
      derniereVisite,
      echeance: ajouterUnAn(derniereVisite),
    };
  });

  return { devis, devisSignes, contrats, correspondants };
}
