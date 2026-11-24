import PDFDocument from 'pdfkit';

import { ENTREPRISE } from './entreprise.js';
import { formaterDate, formaterEuros, formaterTaux } from './format.js';
import type { Devis } from './modele.js';

/**
 * Mise en page d'un devis. « reference » est le gabarit fixe du logiciel de devis ; « variante »
 * simule une mise à jour de ce logiciel (blocs déplacés, libellés renommés), que la lecture par
 * zones de la phase 4 doit refuser au lieu de lire de travers.
 */
export type MiseEnPage = 'reference' | 'variante';

/** Date figée dans les métadonnées : deux générations donnent les mêmes octets. */
const DATE_FIGEE = new Date(Date.UTC(2027, 2, 1, 8, 0, 0));

const MARGE = 50;
const LARGEUR_UTILE = 495;

interface Colonne {
  readonly titre: string;
  readonly x: number;
  readonly largeur: number;
  readonly alignement: 'left' | 'right';
  readonly valeur: (ligne: Devis['lignes'][number]) => string;
}

const COLONNES_REFERENCE: readonly Colonne[] = [
  {
    titre: 'Désignation',
    x: MARGE,
    largeur: 230,
    alignement: 'left',
    valeur: (l) => l.designation,
  },
  { titre: 'Qté', x: 285, largeur: 40, alignement: 'right', valeur: (l) => String(l.quantite) },
  {
    titre: 'PU HT',
    x: 330,
    largeur: 75,
    alignement: 'right',
    valeur: (l) => formaterEuros(l.prixUnitaireHt),
  },
  {
    titre: 'TVA',
    x: 410,
    largeur: 45,
    alignement: 'right',
    valeur: (l) => formaterTaux(l.tauxDeTva),
  },
  {
    titre: 'Total HT',
    x: 460,
    largeur: 85,
    alignement: 'right',
    valeur: (l) => formaterEuros(l.totalHt),
  },
];

// Variante : colonnes réordonnées et renommées, la référence article en tête.
const COLONNES_VARIANTE: readonly Colonne[] = [
  { titre: 'Réf.', x: MARGE, largeur: 70, alignement: 'left', valeur: (l) => l.reference },
  { titre: 'Article', x: 125, largeur: 200, alignement: 'left', valeur: (l) => l.designation },
  {
    titre: 'Quantité',
    x: 330,
    largeur: 55,
    alignement: 'right',
    valeur: (l) => String(l.quantite),
  },
  {
    titre: 'Prix unitaire',
    x: 390,
    largeur: 75,
    alignement: 'right',
    valeur: (l) => formaterEuros(l.prixUnitaireHt),
  },
  {
    titre: 'Montant',
    x: 470,
    largeur: 75,
    alignement: 'right',
    valeur: (l) => formaterEuros(l.totalHt),
  },
];

const LIBELLES = {
  reference: {
    numero: 'N°',
    totalHt: 'Total HT',
    tva: 'TVA',
    totalTtc: 'Total TTC',
    reste: 'Reste à charge',
  },
  variante: {
    numero: 'Référence',
    totalHt: 'Sous-total',
    tva: 'Taxes',
    totalTtc: 'Montant TTC',
    reste: 'Net à payer',
  },
} as const;

function enOctets(document: PDFKit.PDFDocument): Promise<Buffer> {
  const morceaux: Buffer[] = [];
  return new Promise((resolve) => {
    document.on('data', (morceau: Buffer) => morceaux.push(morceau));
    document.on('end', () => {
      resolve(Buffer.concat(morceaux));
    });
    document.end();
  });
}

export function genererLeDevisPdf(devis: Devis, miseEnPage: MiseEnPage): Promise<Buffer> {
  const document = new PDFDocument({
    size: 'A4',
    margin: MARGE,
    info: {
      Title: `Devis ${devis.numero}`,
      Author: ENTREPRISE.nom,
      Creator: 'relaisMetier - jeu synthétique',
      Producer: 'relaisMetier',
      CreationDate: DATE_FIGEE,
      ModDate: DATE_FIGEE,
    },
  });
  const libelles = LIBELLES[miseEnPage];
  const { client } = devis;

  // En-tête : l'entreprise à gauche, le client à droite (inversés dans la variante).
  const blocEntreprise = [
    ENTREPRISE.nom,
    ...ENTREPRISE.adresse,
    `Tél. ${ENTREPRISE.telephone}`,
    ENTREPRISE.courriel,
  ];
  const blocClient = [
    `${client.civilite} ${client.prenom} ${client.nom}`,
    client.adresse.rue,
    `${client.adresse.codePostal} ${client.adresse.commune}`,
    client.courriel,
  ];
  const [gauche, droite] =
    miseEnPage === 'reference' ? [blocEntreprise, blocClient] : [blocClient, blocEntreprise];
  document.font('Helvetica').fontSize(10);
  document.text(gauche.join('\n'), MARGE, MARGE, { width: 240 });
  document.text(droite.join('\n'), 305, MARGE, { width: 240 });

  document.font('Helvetica-Bold').fontSize(18).text('DEVIS', MARGE, 150);
  document.font('Helvetica').fontSize(10);
  document.text(`${libelles.numero} : ${devis.numero}`, MARGE, 175);
  document.text(`Date : ${formaterDate(devis.date)}`, MARGE, 190);
  document.text(`Validité : ${String(devis.validiteJours)} jours`, MARGE, 205);
  document.text(`Objet : ${devis.objet}`, MARGE, 230, { width: LARGEUR_UTILE });

  // Tableau des lignes.
  const colonnes = miseEnPage === 'reference' ? COLONNES_REFERENCE : COLONNES_VARIANTE;
  let y = 265;
  document.font('Helvetica-Bold');
  for (const colonne of colonnes) {
    document.text(colonne.titre, colonne.x, y, {
      width: colonne.largeur,
      align: colonne.alignement,
    });
  }
  document
    .moveTo(MARGE, y + 14)
    .lineTo(MARGE + LARGEUR_UTILE, y + 14)
    .stroke();
  document.font('Helvetica');
  for (const ligne of devis.lignes) {
    y += 22;
    for (const colonne of colonnes) {
      document.text(colonne.valeur(ligne), colonne.x, y, {
        width: colonne.largeur,
        align: colonne.alignement,
      });
    }
  }

  // Totaux, alignés à droite.
  y += 40;
  const totaux: [string, number][] = [
    [libelles.totalHt, devis.totalHt],
    [libelles.tva, devis.totalTva],
    [libelles.totalTtc, devis.totalTtc],
    ...devis.aides.map((aide): [string, number] => [aide.libelle, -aide.montant]),
    [libelles.reste, devis.resteACharge],
  ];
  for (const [libelle, montant] of totaux) {
    document.text(libelle, 250, y, { width: 200, align: 'right' });
    document.text(formaterEuros(montant), 460, y, { width: 85, align: 'right' });
    y += 18;
  }

  document
    .fontSize(8)
    .text(ENTREPRISE.mention, MARGE, 780, { width: LARGEUR_UTILE, align: 'center' });
  return enOctets(document);
}
