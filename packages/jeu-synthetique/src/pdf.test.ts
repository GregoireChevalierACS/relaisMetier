import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';

import { creerAlea } from './alea.js';
import { formaterEuros } from './format.js';
import { genererLeModele } from './modele.js';
import { genererLeDevisPdf } from './pdf.js';

/** Texte de la première page, tel que la lecture par zones de la phase 4 le verra. */
async function texteDe(pdf: Buffer): Promise<string> {
  const document = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: false }).promise;
  const page = await document.getPage(1);
  const contenu = await page.getTextContent();
  return contenu.items.map((item) => ('str' in item ? item.str : '')).join('\n');
}

describe('genererLeDevisPdf', () => {
  const modele = genererLeModele(creerAlea(42));
  const devis = modele.devis.find((d) => d.aides.length > 0) ?? modele.devis[0];
  if (devis === undefined) throw new Error('jeu sans devis');

  it('donne les mêmes octets à chaque génération', async () => {
    expect(await genererLeDevisPdf(devis, 'reference')).toEqual(
      await genererLeDevisPdf(devis, 'reference'),
    );
  });

  it('produit un PDF texte qui contient les champs du devis', async () => {
    const texte = await texteDe(await genererLeDevisPdf(devis, 'reference'));
    expect(texte).toContain(`N° : ${devis.numero}`);
    expect(texte).toContain(devis.client.courriel);
    expect(texte).toContain(`${devis.client.prenom} ${devis.client.nom}`);
    expect(texte).toContain('Total TTC');
    expect(texte).toContain(formaterEuros(devis.totalTtc));
    expect(texte).toContain(formaterEuros(devis.resteACharge));
    for (const ligne of devis.lignes) expect(texte).toContain(ligne.designation);
    for (const aide of devis.aides) expect(texte).toContain(aide.libelle);
  });

  it('renomme les ancres dans la mise en page modifiée', async () => {
    const reference = await genererLeDevisPdf(devis, 'reference');
    const variante = await genererLeDevisPdf(devis, 'variante');
    expect(variante).not.toEqual(reference);
    const texte = await texteDe(variante);
    expect(texte).not.toContain('Total TTC');
    expect(texte).toContain('Montant TTC');
    expect(texte).toContain(`Référence : ${devis.numero}`);
    expect(texte).toContain(formaterEuros(devis.totalTtc));
  });
});
