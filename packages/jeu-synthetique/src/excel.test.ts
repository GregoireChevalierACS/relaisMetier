import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { creerAlea } from './alea.js';
import { FOURNISSEURS } from './entreprise.js';
import { exporterLesContrats, exporterLesDevisSignes, ONGLETS } from './excel.js';
import { genererLeModele } from './modele.js';

async function lire(contenu: Buffer): Promise<ExcelJS.Workbook> {
  const classeur = new ExcelJS.Workbook();
  await classeur.xlsx.load(new Uint8Array(contenu).buffer);
  return classeur;
}

const valeurs = (onglet: ExcelJS.Worksheet | undefined): unknown[][] =>
  (onglet?.getSheetValues() ?? []).flatMap((ligne) =>
    Array.isArray(ligne) ? [ligne.slice(1)] : [],
  );

describe('exports Excel', () => {
  const modele = genererLeModele(creerAlea(42));

  it('donnent les mêmes octets à chaque génération', async () => {
    expect(await exporterLesDevisSignes(modele)).toEqual(await exporterLesDevisSignes(modele));
    expect(await exporterLesContrats(modele)).toEqual(await exporterLesContrats(modele));
  });

  it('gardent [Content_Types].xml en tête de l’archive', async () => {
    const archive = await JSZip.loadAsync(await exporterLesContrats(modele));
    expect(Object.keys(archive.files)[0]).toBe('[Content_Types].xml');
  });

  it('listent les devis signés et leurs lignes, avec le fournisseur de chacune', async () => {
    const classeur = await lire(await exporterLesDevisSignes(modele));
    const [entetes, ...devis] = valeurs(classeur.getWorksheet(ONGLETS.devisSignes));
    expect(entetes?.[0]).toBe('N° devis');
    expect(devis.map((ligne) => ligne[0])).toEqual(modele.devisSignes.map((s) => s.numero));

    const premier = modele.devis[0];
    expect(devis[0]?.[6]).toBe((premier?.totalTtc ?? 0) / 100);
    expect(devis[0]?.[2]).toEqual(
      new Date(`${modele.devisSignes[0]?.dateDeSignature ?? ''}T00:00:00Z`),
    );

    const [, ...lignes] = valeurs(classeur.getWorksheet(ONGLETS.lignes));
    const duPremier = lignes.filter((ligne) => ligne[0] === premier?.numero);
    expect(duPremier).toHaveLength(premier?.lignes.length ?? -1);
    // La main d'œuvre n'a pas de fournisseur : sa cellule reste vide.
    expect(
      new Set(
        duPremier.flatMap((ligne) =>
          typeof ligne[4] === 'string' && ligne[4] !== '' ? [ligne[4]] : [],
        ),
      ),
    ).toEqual(new Set([FOURNISSEURS.distritherm.nom, FOURNISSEURS.hydropieces.nom]));
  });

  it('listent les contrats d’entretien avec leur dernière visite', async () => {
    const classeur = await lire(await exporterLesContrats(modele));
    const [, ...contrats] = valeurs(classeur.getWorksheet(ONGLETS.contrats));
    expect(contrats).toHaveLength(modele.contrats.length);
    const [premier] = modele.contrats;
    expect(contrats[0]?.[0]).toBe(premier?.numero);
    expect(contrats[0]?.[6]).toBe(premier?.client.courriel);
    expect(contrats[0]?.[8]).toEqual(new Date(`${premier?.derniereVisite ?? ''}T00:00:00Z`));
  });
});
