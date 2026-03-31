// === Input Types ===

export interface ScannerInput {
  clientBrand: {
    name: string;
    url: string;
    socialHandle: string;
    socialPlatform: 'instagram' | 'facebook' | 'linkedin';
  };
  category: string;
  categoryType: 'b2c' | 'b2b';
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
  slownictwoMarki: string[];
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
  zewnetrzneSlownictwo: string[];
  zgodnosc: {
    ocena: 'pokrywa się' | 'częściowa rozbieżność' | 'wyraźna rozbieżność';
    opis: string;
  };
}

export interface AtomicAnalysis {
  claim: ClaimResult;
  vocabulary: VocabularyResult;
  socialSynthesis: SocialSynthesis | null;
  externalAnalysis: ExternalAnalysis;
}

// === Synthesis Types ===

export interface BrandProfile {
  logikaSprzdazy: {
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
    zrodlo: 'strona' | 'social' | 'zewnętrzne';
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
    systematyczniePomijani: string;
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
  pytanieOtwarte: string;
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
    logikaSprzdazy: {
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
      zrodlo: string;
      znaczenie: string;
    }>;
    samplePostScreenshots: string[];
    sampleWebsiteQuotes: string[];
  }>;
  konwencjaKategorii: CategoryConventions;
  pozycjaKlienta: ClientPosition;
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
