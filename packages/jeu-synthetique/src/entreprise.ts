// L'entreprise fictive et ses partenaires. Toutes les adresses sont sous le domaine réservé
// « .test » (RFC 2606) : aucun courriel du jeu ne peut atteindre une vraie boîte. Les numéros de
// téléphone sont dans la tranche 01 99 00 xx xx, réservée par l'ARCEP à la fiction.

export const DOMAINE = 'atelier-thermique.test';

export const ENTREPRISE = {
  nom: 'Atelier Thermique Démo',
  adresse: ['12 rue des Artisans', '45000 Orléans'],
  telephone: '01 99 00 10 00',
  courriel: `devis@${DOMAINE}`,
  mention: 'Entreprise et document fictifs, générés pour la démonstration relaisMetier.',
} as const;

/** Les boîtes partagées de l'entreprise, chacune relevée par n8n. */
export const BOITES = {
  devis: `devis@${DOMAINE}`,
  accueil: `accueil@${DOMAINE}`,
  commandes: `commandes@${DOMAINE}`,
} as const;

export type Boite = keyof typeof BOITES;

export interface Fournisseur {
  readonly code: string;
  readonly nom: string;
  readonly courriel: string;
  readonly contact: string;
}

export const FOURNISSEURS = {
  distritherm: {
    code: 'distritherm',
    nom: "Distri'Therm",
    courriel: 'commandes@distritherm.test',
    contact: 'Sandrine Morel',
  },
  hydropieces: {
    code: 'hydropieces',
    nom: 'Hydro Pièces',
    courriel: 'ventes@hydropieces.test',
    contact: 'Karim Benali',
  },
  granules: {
    code: 'granules',
    nom: 'Granulés du Plateau',
    courriel: 'contact@granules-plateau.test',
    contact: 'Julie Fabre',
  },
  climouest: {
    code: 'climouest',
    nom: "Clim'Ouest Négoce",
    courriel: 'adv@climouest.test',
    contact: 'Thomas Leroy',
  },
} as const satisfies Record<string, Fournisseur>;

export type CodeFournisseur = keyof typeof FOURNISSEURS;
