export type Messages = {
  brand: {
    name: string;
    subtitle: string;
    cardEyebrow: string;
  };
  nav: {
    records: string;
    signIn: string;
    signOut: string;
  };
  status: {
    loggedIn: string;
    guest: string;
    noKeys: string;
    freeQuota: string;
  };
  sync: {
    savedLocal: string;
    pending: string;
    syncing: string;
    synced: string;
    failed: string;
    conflict: string;
    retry: string;
  };
  wizard: {
    step1: string;
    step2: string;
    step3: string;
    back: string;
    next: string;
    checklistTitle: string;
    checkAddress: string;
    checkViewingAt: string;
    checkFieldContent: string;
    checkSyncOk: string;
    progress: string;
    textNotesTitle: string;
    textNotesPlaceholder: string;
    textNotesAdd: string;
    editCard: string;
    saveEdits: string;
  };
  setup: {
    title: string;
    viewingAt: string;
    unitLabel: string;
    priceLabel: string;
    layoutLabel: string;
    listingUrl: string;
    setupNotes: string;
    lookupOptional: string;
  };
  intro: string;
  address: {
    placeholder: string;
    hint: string;
    lookingUp: string;
    identified: string;
    openDataPrefix: string;
  };
  bank: {
    title: string;
    photoAi: string;
    photoBadge: string;
    tagLabel: string;
    followUp: string;
    followBadge: string;
    tip: string;
    tipExample: string;
    matched: string;
  };
  audio: {
    title: string;
    recording: string;
    processing: string;
    idle: string;
    pipeline: string;
    import: string;
    importHint: string;
    noteLabel: string;
  };
  photos: {
    title: string;
    add: string;
    addSub: string;
    tip: string;
  };
  video: {
    title: string;
    badge: string;
    warn: string;
    start: string;
    startSub: string;
    tip: string;
  };
  share: {
    button: string;
    uploading: string;
    readyLoggedIn: string;
    readyGuest: string;
    needMore: string;
  };
  loginGate: {
    title: string;
    body: string;
    email: string;
    password: string;
    submitSignIn: string;
    submitSignUp: string;
    processing: string;
    switchToSignUp: string;
    switchToSignIn: string;
  };
  paywall: {
    title: string;
    body: string;
    perMonth: string;
    feature1: string;
    feature2: string;
    feature3: string;
    cta: string;
    loading: string;
    footer: string;
  };
  card: {
    close: string;
    copy: string;
    share: string;
    pros: string;
    risks: string;
    qa: string;
    qaEmpty: string;
    evidence: string;
    answered: string;
    pending: string;
    byDialogue: string;
    byTag: string;
  };
  loginPage: {
    signInTitle: string;
    signUpTitle: string;
    body: string;
    submitSignIn: string;
    submitSignUp: string;
    switchToSignUp: string;
    switchToSignIn: string;
    backHome: string;
    signupOk: string;
  };
  viewings: {
    title: string;
    back: string;
    empty: string;
    detailBack: string;
    property: string;
    questions: string;
    media: string;
  };
  language: {
    label: string;
  };
  questions: {
    ca: string[];
    th: string[];
  };
  photoTags: string[];
  clipLabels: string[];
  defaults: {
    pros: string[];
    risks: string[];
  };
};

export type MessageKey = string;
