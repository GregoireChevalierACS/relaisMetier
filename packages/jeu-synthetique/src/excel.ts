import ExcelJS from 'exceljs';
import JSZip from 'jszip';

import { depuisIso } from './dates.js';
import { ENTREPRISE, FOURNISSEURS } from './entreprise.js';
import type { Modele } from './modele.js';

// Exports Excel du logiciel de devis (qui n'a pas d'API). Un classeur .xlsx est une archive ZIP
// qui contient des dates d'écriture : on la réécrit avec des dates figées et un ordre stable,
// comme le fait le jeu synthétique de FindAndFill, pour que deux générations donnent les mêmes
// octets.

const DATE_FIGEE = new Date(Date.UTC(2027, 2, 1, 8, 0, 0));

export const ONGLETS = {
  devisSignes: 'Devis signés',
  lignes: 'Lignes',
  contrats: 'Contrats',
} as const;

const versDate = (iso: string): Date => new Date(depuisIso(iso));
const versEuros = (centimes: number): number => centimes / 100;

function nouveauClasseur(): ExcelJS.Workbook {
  const classeur = new ExcelJS.Workbook();
  classeur.creator = ENTREPRISE.nom;
  classeur.lastModifiedBy = ENTREPRISE.nom;
  classeur.created = DATE_FIGEE;
  classeur.modified = DATE_FIGEE;
  return classeur;
}

function ajouterOnglet(
  classeur: ExcelJS.Workbook,
  nom: string,
  colonnes: readonly {
    readonly entete: string;
    readonly largeur: number;
    readonly format?: string;
  }[],
  lignes: readonly (readonly (string | number | Date)[])[],
): void {
  const onglet = classeur.addWorksheet(nom);
  onglet.columns = colonnes.map(({ entete, largeur, format }) => ({
    header: entete,
    width: largeur,
    ...(format === undefined ? {} : { style: { numFmt: format } }),
  }));
  onglet.getRow(1).font = { bold: true };
  for (const ligne of lignes) onglet.addRow([...ligne]);
}

/** Réécrit l'archive avec des dates figées et ses fichiers dans un ordre stable. */
async function normaliser(brut: ExcelJS.Buffer): Promise<Buffer> {
  const source = await JSZip.loadAsync(brut);
  const cible = new JSZip();
  // [Content_Types].xml doit rester en tête de l'archive.
  const enTete = (nom: string): number => Number(nom === '[Content_Types].xml');
  const fichiers = source
    .filter((_chemin, fichier) => !fichier.dir)
    .sort((a, b) => enTete(b.name) - enTete(a.name) || a.name.localeCompare(b.name));
  for (const fichier of fichiers) {
    cible.file(fichier.name, await fichier.async('uint8array'), {
      date: DATE_FIGEE,
      createFolders: false,
    });
  }
  return cible.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'DOS',
  });
}

const FORMAT_DATE = 'dd/mm/yyyy';
const FORMAT_MONTANT = '#,##0.00';

/** Devis signés et leurs lignes : la source des bons de commande fournisseurs (phase 6). */
export async function exporterLesDevisSignes(modele: Modele): Promise<Buffer> {
  const classeur = nouveauClasseur();
  const signatures = new Map(modele.devisSignes.map((signe) => [signe.numero, signe]));
  const signes = modele.devis.flatMap((devis) => {
    const signe = signatures.get(devis.numero);
    return signe === undefined ? [] : [{ devis, signe }];
  });

  ajouterOnglet(
    classeur,
    ONGLETS.devisSignes,
    [
      { entete: 'N° devis', largeur: 14 },
      { entete: 'Date du devis', largeur: 14, format: FORMAT_DATE },
      { entete: 'Date de signature', largeur: 16, format: FORMAT_DATE },
      { entete: 'Client', largeur: 26 },
      { entete: 'Courriel', largeur: 32 },
      { entete: 'Objet', largeur: 60 },
      { entete: 'Montant TTC', largeur: 14, format: FORMAT_MONTANT },
    ],
    signes.map(({ devis, signe }) => [
      devis.numero,
      versDate(devis.date),
      versDate(signe.dateDeSignature),
      `${devis.client.prenom} ${devis.client.nom}`,
      devis.client.courriel,
      devis.objet,
      versEuros(devis.totalTtc),
    ]),
  );

  ajouterOnglet(
    classeur,
    ONGLETS.lignes,
    [
      { entete: 'N° devis', largeur: 14 },
      { entete: 'Référence', largeur: 14 },
      { entete: 'Désignation', largeur: 46 },
      { entete: 'Quantité', largeur: 10 },
      { entete: 'Fournisseur', largeur: 22 },
    ],
    signes.flatMap(({ devis }) =>
      devis.lignes.map((ligne) => [
        devis.numero,
        ligne.reference,
        ligne.designation,
        ligne.quantite,
        ligne.fournisseur === null ? '' : FOURNISSEURS[ligne.fournisseur].nom,
      ]),
    ),
  );

  return normaliser(await classeur.xlsx.writeBuffer());
}

/** Contrats d'entretien annuels : la source des rappels (phase 7). */
export async function exporterLesContrats(modele: Modele): Promise<Buffer> {
  const classeur = nouveauClasseur();
  ajouterOnglet(
    classeur,
    ONGLETS.contrats,
    [
      { entete: 'N° contrat', largeur: 12 },
      { entete: 'Client', largeur: 26 },
      { entete: 'Adresse', largeur: 30 },
      { entete: 'Code postal', largeur: 12 },
      { entete: 'Commune', largeur: 26 },
      { entete: 'Téléphone', largeur: 16 },
      { entete: 'Courriel', largeur: 32 },
      { entete: 'Équipement', largeur: 24 },
      { entete: 'Dernière visite', largeur: 16, format: FORMAT_DATE },
    ],
    modele.contrats.map((contrat) => [
      contrat.numero,
      `${contrat.client.civilite} ${contrat.client.prenom} ${contrat.client.nom}`,
      contrat.client.adresse.rue,
      contrat.client.adresse.codePostal,
      contrat.client.adresse.commune,
      contrat.client.telephone,
      contrat.client.courriel,
      contrat.equipement,
      versDate(contrat.derniereVisite),
    ]),
  );
  return normaliser(await classeur.xlsx.writeBuffer());
}
