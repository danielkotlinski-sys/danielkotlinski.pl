// === Input Types ===

export interface ScannerInput {
  clientBrand: {
    name: string;
    url: string;
    socialHandle: string;
    socialPlatform: 'instagram' | 'facebook' | 'linkedin';
  };
  category: string;
  categoryPurpose: string; // "Co łączy te podmioty? Po co klient do nich przychodzi?"
  categoryType: 'b2c' | 'b2b';
  clientDescription?: string; // "Kim jest Twój klient?" — optional
  jtbdRatings?: Array<{ job: string; rating: 1 | 2 | 3 }>; // user-rated JTBD suggestions
  competitors: Array<{
    name: string;
    url: string;
    socialHandle: string;
  }>;
}

export interface LeadInfo {
  firstName: string;
  email: string;
  company?: string;
  gdprConsent: boolean;
}

export interface ScanRequest {
  input: ScannerInput;
  lead: LeadInfo;
}

// === Data Collection Types ===

export interface ScrapedPost {
  url: string;
  caption: string;
  date: string;
  screenshotBase64: string;
  platform: 'instagram' | 'facebook' | 'linkedin';
}

export interface BrandData {
  websiteText: string;
  posts: ScrapedPost[];
  externalDiscourse: string;
}

// === Analysis Types ===

export interface ClaimResult {
  framingProduktu: {
    opis: string;
    dowod: string;
  };
  obietnicaZmiany: {
    stanPrzed: string;
    stanPo: string;
    dowod: string;
  };
  punktWejsciaKomunikacji: {
    typ: 'produkt' | 'wartości' | 'styl życia' | 'wynik' | 'tożsamość';
    opis: string;
    dowod: string;
  };
}

export interface VocabularyResult {
  slownictwoMarki: Array<{ fraza: string; kontekst: string }> | string[];
  sugestiaOKliencie: string;
}

export interface PostAnalysis {
  elementWizualny: {
    co: string;
    rola: 'produkt' | 'człowiek' | 'kontekst użycia' | 'abstrakcja' | 'tekst';
    szczegol: string;
  };
  zakladanyMoment: string;
  zamierzonePoczucie: string;
}

export interface SocialSynthesis {
  dominujacyMoment: {
    opis: string;
    powtarzalnoscWzorca: string;
  };
  coMarkaPokazuje: {
    pokazuje: string[];
    unika: string[];
  };
  zakladanaOsoba: string;
}

export interface ExternalAnalysis {
  profilZewnetrzny?: string;
  kluczoweCytaty?: Array<{ cytat: string; zrodlo: string }>;
  zewnetrzneSlownictwo: string[];
  zgodnosc: {
    ocena: 'pokrywa się' | 'częściowa rozbieżność' | 'wyraźna rozbieżność';
    opis: string;
  };
}

export interface HomepageVisualAnalysis {
  heroElement: string;
  kolorystyka: string;
  hierarchia: string;
  ton: string;
}

export interface AtomicAnalysis {
  claim: ClaimResult;
  vocabulary: VocabularyResult;
  socialSynthesis: SocialSynthesis | null;
  externalAnalysis: ExternalAnalysis;
  homepageVisual?: HomepageVisualAnalysis;
}

// === Category Map ===

export interface CategoryMap {
  gracze: Array<{
    nazwa: string;
    pozycja: string;
    charakter: string;
  }>;
  obozy: string;
  napiecia: string;
  hierarchia: string;
}

// === Comparative Gap ===

export interface ComparativeGaps {
  tematy: Array<{
    temat: string;
    ktoMowi: string[];
    ktoMilczy: string[];
    znaczenie: string;
  }>;
}

// === Synthesis Types ===

export interface BrandProfile {
  logikaSprzedazy: {
    tresc: string;
    kluczoweMechanizmy: string[];
  };
  implikowanyKlient: {
    tosazmosc: string;
    coWazne: string;
    ktoWykluczony: string;
  };
  kluczoweDowody: Array<{
    obserwacja: string;
    cytat: string;
    zrodlo: 'strona' | 'social' | 'zewnętrzne' | 'media';
    znaczenie: string;
  }>;
}

export interface CategoryConventions {
  mechanizmKategorii: {
    regula: string;
    uzasadnienie: string;
  };
  implikowanyKlientKategorii: {
    tosazmosc: string;
    glebszaPotrzeba: string;
    pominietaGrupa: {
      opis: string;
      proporcja: string;
      dlaczegoOdpycha: string;
    };
  };
  dowodyKonwencji: Array<{
    wzorzec: string;
    marki: string[];
    znaczenie: string;
  }>;
  mapaWyroznialnosci: Array<{
    marka: string;
    ocena: 'zgodna z konwencją' | 'częściowo odchylona' | 'wyraźnie łamiąca';
    uzasadnienie: string;
  }>;
}

export interface ClientPosition {
  zgodnosc: {
    elementy: string[];
    ocena: string;
  };
  odchylenia: {
    elementy: string[];
    znaczenieStrategiczne: string;
  };
  zagrozenie: string;
  pytanieOtwarte: string;
}

export interface BlueOceanFinale {
  odwroconaKonwencja: {
    zalozenie: string;
    odwrocenie: string;
  };
  pominietaGrupa: {
    kim: string;
    skala: string;
    dlaczegoNieKupuje: string;
  };
  prowokacja: string;
  kierunek: {
    coZmienilby: string;
    pierwszyKrok: string;
  };
}

// === Visual Conventions Types ===

export interface BrandVisualConventions {
  dominujacyStyl: {
    opis: string;
    powtarzalnosc: string;
  };
  kolorystyka: string;
  composycja: string;
  obecnoscCzlowieka: {
    czy: boolean;
    jakPokazany: string;
  };
  napiecia: string;
}

export interface CategoryVisualConventions {
  wspolneWzorce: Array<{
    wzorzec: string;
    marki: string[];
    znaczenie: string;
  }>;
  wspolneUnikanie: string[];
  implikowanySwiatklienta: string;
  ktoWizualnieWykluczony: string;
}

// === Report Types ===

export interface ScannerReport {
  meta: {
    clientBrand: string;
    category: string;
    brandsAnalyzed: string[];
    generatedAt: string;
  };
  brandProfiles: Array<{
    brandName: string;
    isClient: boolean;
    logikaSprzedazy: {
      tresc: string;
      kluczoweMechanizmy: string[];
    };
    implikowanyKlient: {
      tosazmosc: string;
      coWazne: string;
      ktoWykluczony: string;
    };
    kluczoweDowody: Array<{
      obserwacja: string;
      cytat?: string;
      zrodlo: string;
      znaczenie: string;
    }>;
    samplePostScreenshots: string[];
    sampleWebsiteQuotes: string[];
    konwencjaWizualna?: BrandVisualConventions;
    zrodlaZewnetrzne?: string[];
  }>;
  mapaKategorii?: CategoryMap;
  lukiKomunikacyjne?: ComparativeGaps;
  konwencjaKategorii: CategoryConventions;
  konwencjaWizualnaKategorii?: CategoryVisualConventions;
  pozycjaKlienta: ClientPosition;
  blueOceanFinale?: BlueOceanFinale;
  notaKoncowa: string;
}

// === Progress Types ===

export type StepId =
  | 'collect_websites'
  | 'collect_social'
  | 'collect_external'
  | 'analyze_atomic'
  | 'synthesize_brands'
  | 'synthesize_category'
  | 'client_position';

export type StepStatus = 'pending' | 'running' | 'done' | 'error';

export interface ProgressStep {
  id: StepId;
  label: string;
  status: StepStatus;
  detail?: string;
}

export interface ProgressEvent {
  stepId: StepId;
  status: StepStatus;
  detail?: string;
  progress?: number;
}

// === Lead Types ===

export interface Lead {
  id: string;
  createdAt: string;
  firstName: string;
  email: string;
  company?: string;
  gdprConsent: boolean;
  scanInput: ScannerInput;
  scanId: string;
  reportUrl: string;
}
