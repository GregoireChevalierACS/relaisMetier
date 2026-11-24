import type { CodeFournisseur } from './entreprise.js';

/** Taux de TVA en points de base : 550 = 5,5 %. */
export type TauxDeTva = 550 | 1000 | 2000;

/** Une ligne type d'un chantier. Le prix est tiré entre deux bornes, en centimes HT. */
export interface LigneType {
  readonly reference: string;
  readonly designation: string;
  readonly quantite: readonly [number, number];
  readonly prixUnitaireHt: readonly [number, number];
  /** null : main d'œuvre ou prestation, sans commande fournisseur. */
  readonly fournisseur: CodeFournisseur | null;
}

export interface AideType {
  readonly libelle: string;
  readonly montant: readonly [number, number];
}

/** Un type de chantier que l'entreprise chiffre régulièrement. */
export interface Chantier {
  readonly code: string;
  readonly objet: string;
  /** Équipement concerné, tel qu'un client le nomme dans un courriel. */
  readonly equipement: string;
  readonly tauxDeTva: TauxDeTva;
  readonly lignes: readonly LigneType[];
  readonly aides: readonly AideType[];
}

const AIDE_CEE: AideType = {
  libelle: 'Prime énergie CEE (estimation)',
  montant: [40_000, 120_000],
};
const AIDE_RENOVATION: AideType = {
  libelle: 'Aide à la rénovation énergétique (estimation)',
  montant: [100_000, 400_000],
};

const MAIN_D_OEUVRE = (designation: string, min: number, max: number): LigneType => ({
  reference: 'MO',
  designation,
  quantite: [1, 1],
  prixUnitaireHt: [min, max],
  fournisseur: null,
});

// Le taux réduit de 5,5 % s'applique aux travaux d'amélioration énergétique, 10 % aux autres
// travaux dans un logement de plus de deux ans.
/** Remplacement de chaudière : touche deux fournisseurs, d'où son rôle dans les phases 4 et 6. */
export const CHANTIER_CHAUDIERE: Chantier = {
  code: 'chaudiere-condensation',
  objet: 'Remplacement de chaudière par une chaudière gaz à condensation',
  equipement: 'chaudière',
  tauxDeTva: 550,
  lignes: [
    {
      reference: 'DT-CHC-24',
      designation: 'Chaudière gaz à condensation 24 kW',
      quantite: [1, 1],
      prixUnitaireHt: [289_000, 360_000],
      fournisseur: 'distritherm',
    },
    {
      reference: 'HP-VEN-60',
      designation: 'Kit ventouse horizontale 60/100',
      quantite: [1, 1],
      prixUnitaireHt: [24_000, 32_000],
      fournisseur: 'hydropieces',
    },
    {
      reference: 'HP-RT-15',
      designation: 'Robinet thermostatique 15/21',
      quantite: [3, 8],
      prixUnitaireHt: [3_200, 4_800],
      fournisseur: 'hydropieces',
    },
    MAIN_D_OEUVRE('Dépose, pose, raccordement et mise en service', 85_000, 120_000),
  ],
  aides: [AIDE_CEE],
};

export const CHANTIERS: readonly Chantier[] = [
  CHANTIER_CHAUDIERE,
  {
    code: 'pompe-a-chaleur',
    objet: "Installation d'une pompe à chaleur air/eau",
    equipement: 'pompe à chaleur',
    tauxDeTva: 550,
    lignes: [
      {
        reference: 'CO-PAC-11',
        designation: 'Pompe à chaleur air/eau 11 kW',
        quantite: [1, 1],
        prixUnitaireHt: [720_000, 910_000],
        fournisseur: 'climouest',
      },
      {
        reference: 'DT-BT-100',
        designation: 'Ballon tampon 100 L',
        quantite: [1, 1],
        prixUnitaireHt: [42_000, 56_000],
        fournisseur: 'distritherm',
      },
      MAIN_D_OEUVRE('Installation, raccordements hydraulique et électrique', 180_000, 260_000),
    ],
    aides: [AIDE_RENOVATION, AIDE_CEE],
  },
  {
    code: 'poele-granules',
    objet: "Installation d'un poêle à granulés",
    equipement: 'poêle à granulés',
    tauxDeTva: 550,
    lignes: [
      {
        reference: 'GP-PG-9',
        designation: 'Poêle à granulés étanche 9 kW',
        quantite: [1, 1],
        prixUnitaireHt: [250_000, 390_000],
        fournisseur: 'granules',
      },
      {
        reference: 'HP-CD-80',
        designation: 'Conduit concentrique 80/130',
        quantite: [1, 1],
        prixUnitaireHt: [38_000, 52_000],
        fournisseur: 'hydropieces',
      },
      MAIN_D_OEUVRE('Pose, raccordement et mise en service', 60_000, 90_000),
    ],
    aides: [AIDE_RENOVATION],
  },
  {
    code: 'ballon-thermodynamique',
    objet: "Remplacement d'un chauffe-eau par un ballon thermodynamique",
    equipement: 'chauffe-eau',
    tauxDeTva: 550,
    lignes: [
      {
        reference: 'DT-BTD-200',
        designation: 'Ballon thermodynamique 200 L',
        quantite: [1, 1],
        prixUnitaireHt: [180_000, 240_000],
        fournisseur: 'distritherm',
      },
      {
        reference: 'HP-GS-34',
        designation: 'Groupe de sécurité 3/4',
        quantite: [1, 1],
        prixUnitaireHt: [3_500, 5_500],
        fournisseur: 'hydropieces',
      },
      MAIN_D_OEUVRE('Dépose, pose et mise en service', 45_000, 70_000),
    ],
    aides: [AIDE_CEE],
  },
  {
    code: 'radiateurs',
    objet: 'Remplacement de radiateurs',
    equipement: 'radiateurs',
    tauxDeTva: 1000,
    lignes: [
      {
        reference: 'HP-RAD-1500',
        designation: 'Radiateur acier panneau 1 500 W',
        quantite: [2, 6],
        prixUnitaireHt: [21_000, 29_000],
        fournisseur: 'hydropieces',
      },
      MAIN_D_OEUVRE('Dépose, pose et raccordement', 30_000, 60_000),
    ],
    aides: [],
  },
  {
    code: 'desembouage',
    objet: 'Désembouage du circuit de chauffage',
    equipement: 'circuit de chauffage',
    tauxDeTva: 1000,
    lignes: [
      {
        reference: 'HP-DES-5',
        designation: 'Produit désembouant 5 L',
        quantite: [1, 2],
        prixUnitaireHt: [6_500, 8_500],
        fournisseur: 'hydropieces',
      },
      MAIN_D_OEUVRE('Désembouage par injection et rinçage', 35_000, 55_000),
    ],
    aides: [],
  },
];

/** Équipements sous contrat d'entretien annuel. */
export const EQUIPEMENTS_ENTRETENUS = [
  'Chaudière gaz',
  'Chaudière fioul',
  'Pompe à chaleur air/eau',
  'Poêle à granulés',
] as const;
