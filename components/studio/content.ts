export const WHATSAPP_DISPLAY = "+91 98848 45539";
export const WHATSAPP_COPY = "+919884845539";
export const WHATSAPP_URL =
  "https://wa.me/919884845539?text=" +
  encodeURIComponent("Hi Mithila, I'd like to discuss a project for my business.");

export const navLinks = [
  { href: "/", label: "Home" },
  { href: "/build", label: "How We Build" },
  { href: "/work", label: "Our Work" },
  { href: "/founder", label: "Meet the Founder" },
] as const;

export type RailItem = {
  tag: string;
  name: string;
  summary: string;
  href: string;
  external?: boolean;
  go: string;
  image: string;
  alt: string;
  tall?: boolean;
};

export const railItems: RailItem[] = [
  {
    tag: "Education · Chennai",
    name: "Vriddhi Montessori",
    summary: "Admin CRM and parent fee payments. 90% less time spent reconciling fees.",
    href: "/work",
    go: "Case study",
    image: "/case-studies/vriddhi-mob1.png",
    alt: "Vriddhi Montessori website",
    tall: true,
  },
  {
    tag: "Editorial · Online",
    name: "The Butter Chapters",
    summary: "A mobile-first reading app with a custom editorial look.",
    href: "/work",
    go: "Case study",
    image: "/case-studies/butter-home.jpg",
    alt: "The Butter Chapters website",
  },
  {
    tag: "Sports · Chennai",
    name: "Royale Cricket",
    summary: "Player registration and auction site for a community cricket league.",
    href: "https://www.royalecricket.in/",
    external: true,
    go: "royalecricket.in ↗",
    image: "/case-studies/royale-web1.png",
    alt: "Royale Cricket website",
  },
  {
    tag: "Sports · Mumbai",
    name: "The Ancients Cricket Club",
    summary:
      "Came to us after seeing Royale Cricket. Same registration and auction platform, their own brand.",
    href: "https://www.theancientscricketclub.in/",
    external: true,
    go: "theancientscricketclub.in ↗",
    image: "/case-studies/ancients-home.jpg",
    alt: "The Ancients Cricket Club website",
  },
  {
    tag: "Food · Chennai",
    name: "Baker's Perk",
    summary: "Cake menu with prices, a custom-cake gallery and ordering on WhatsApp.",
    href: "https://www.bakersperk.com/",
    external: true,
    go: "bakersperk.com ↗",
    image: "/case-studies/bakers-home.jpg",
    alt: "Baker's Perk website",
  },
];

export type Shot = {
  src: string;
  alt: string;
  cap: string;
  url?: string;
};

export type CaseStudy = {
  eyebrow: string;
  title: string;
  problem?: string;
  built: string;
  stats?: { value: string; label: string }[];
  links: { href: string; label: string }[];
  phones: Shot[];
  webs?: Shot[];
  solo?: boolean;
};

export const caseStudies: CaseStudy[] = [
  {
    eyebrow: "Education · Chennai",
    title: "Vriddhi Montessori",
    problem:
      "Admissions and fee tracking ran entirely on paper, WhatsApp and a handful of Excel sheets that never agreed with each other.",
    built:
      "A mobile-friendly admin CRM for the office, and a parent portal where fees are paid online through Razorpay and reconciled automatically.",
    stats: [
      { value: "90%", label: "less time spent reconciling fees" },
      { value: "30 days", label: "for every non-technical staff member to move fully online" },
    ],
    links: [{ href: "https://www.vriddhimontessori.com/", label: "vriddhimontessori.com ↗" }],
    solo: true,
    phones: [
      {
        src: "/case-studies/vriddhi-mob1.png",
        alt: "Vriddhi Montessori home page on a phone",
        cap: "Home · mobile",
      },
      {
        src: "/case-studies/vriddhi-parent-portal.jpg",
        alt: "Vriddhi parent portal sign-in on a phone",
        cap: "Parent portal · mobile",
      },
      {
        src: "/case-studies/vriddhi-fees.jpg",
        alt: "Vriddhi fee structure page on a phone",
        cap: "Fee structure · mobile",
      },
      {
        src: "/case-studies/vriddhi-mob2.png",
        alt: "Vriddhi location and school hours on a phone",
        cap: "Find us · mobile",
      },
    ],
  },
  {
    eyebrow: "Editorial · Online",
    title: "The Butter Chapters",
    problem:
      "A writer needed a reading experience that felt like her brand, worked well on a phone and kept algorithmic clutter out.",
    built:
      "A mobile-first web app built for readability, with sticky navigation, features that bring readers back, and a custom editorial look.",
    links: [{ href: "https://www.thebutterchapters.com/", label: "thebutterchapters.com ↗" }],
    webs: [
      {
        src: "/case-studies/about-butter.png",
        alt: "The Butter Chapters about page on desktop",
        cap: "About · web",
        url: "thebutterchapters.com/about",
      },
      {
        src: "/case-studies/blag-butterchapters.png",
        alt: "The Butter Chapters blog index on desktop",
        cap: "All posts · web",
        url: "thebutterchapters.com/blogs",
      },
    ],
    phones: [
      {
        src: "/case-studies/butter-home.jpg",
        alt: "The Butter Chapters home page on a phone",
        cap: "Home · mobile",
      },
      {
        src: "/case-studies/butter-mobile1.png",
        alt: "Butter Chapters post list on a phone",
        cap: "Posts · mobile",
      },
      {
        src: "/case-studies/butter-reading.jpg",
        alt: "A Butter Chapters article with listen-to-article controls",
        cap: "Reading with audio · mobile",
      },
    ],
  },
  {
    eyebrow: "Sports · Chennai & Mumbai",
    title: "Royale Cricket & The Ancients Cricket Club",
    problem:
      "A community cricket league needed one place for players to register and for teams to bid on them in the auction.",
    built:
      "A registration and auction website for the league. The Ancients Cricket Club saw it and asked for the same platform under their own brand.",
    links: [
      { href: "https://www.royalecricket.in/", label: "royalecricket.in ↗" },
      { href: "https://www.theancientscricketclub.in/", label: "theancientscricketclub.in ↗" },
    ],
    webs: [
      {
        src: "/case-studies/royale-web1.png",
        alt: "Royale Cricket teams overview with auction purses on desktop",
        cap: "Royale teams & auction · web",
        url: "royalecricket.in/teams",
      },
      {
        src: "/case-studies/ancient-web1.png",
        alt: "League of Ancients season hub on desktop",
        cap: "Ancients · web",
        url: "theancientscricketclub.in",
      },
    ],
    phones: [
      {
        src: "/case-studies/royale-mob1.png",
        alt: "Royale Cricket home page on a phone",
        cap: "Royale home · mobile",
      },
      {
        src: "/case-studies/ancients-home.jpg",
        alt: "The Ancients Cricket Club home page on a phone",
        cap: "Ancients home · mobile",
      },
      {
        src: "/case-studies/royale-register.jpg",
        alt: "RCL4 player registration on a phone",
        cap: "Player registration · mobile",
      },
    ],
  },
  {
    eyebrow: "Food · Chennai",
    title: "Baker's Perk",
    built:
      "A site for a handcrafted cake bakery: the full menu with prices, a gallery of custom cakes, and ordering straight to WhatsApp, with delivery across Chennai.",
    links: [{ href: "https://www.bakersperk.com/", label: "bakersperk.com ↗" }],
    webs: [
      {
        src: "/case-studies/bakers-web1.png",
        alt: "Baker's Perk menu with prices on desktop",
        cap: "Menu · web",
        url: "bakersperk.com/menu",
      },
      {
        src: "/case-studies/bakers-web2.png",
        alt: "Baker's Perk custom cake gallery on desktop",
        cap: "Gallery · web",
        url: "bakersperk.com/gallery",
      },
    ],
    phones: [
      {
        src: "/case-studies/bakers-mob2.png",
        alt: "Baker's Perk menu on a phone",
        cap: "Menu · mobile",
      },
      {
        src: "/case-studies/bakers-mobil1.png",
        alt: "Baker's Perk cake gallery on a phone",
        cap: "Gallery · mobile",
      },
      {
        src: "/case-studies/bakers-home.jpg",
        alt: "Baker's Perk home page on a phone",
        cap: "Home · mobile",
      },
    ],
  },
];

export type WallShot = { src: string; wide: boolean };

export const wallRows: WallShot[][] = [
  [
    { src: "/case-studies/about-butter.png", wide: true },
    { src: "/case-studies/vriddhi-mob1.png", wide: false },
    { src: "/case-studies/royale-web1.png", wide: true },
    { src: "/case-studies/bakers-mob2.png", wide: false },
    { src: "/case-studies/bakers-web2.png", wide: true },
    { src: "/case-studies/butter-reading.jpg", wide: false },
  ],
  [
    { src: "/case-studies/blag-butterchapters.png", wide: true },
    { src: "/case-studies/royale-mob1.png", wide: false },
    { src: "/case-studies/ancient-web1.png", wide: true },
    { src: "/case-studies/bakers-mobil1.png", wide: false },
    { src: "/case-studies/bakers-web1.png", wide: true },
    { src: "/case-studies/ancients-home.jpg", wide: false },
  ],
];

export const reasons = [
  {
    title: "We cut the scope hard",
    body: "We find the features that pay for themselves and drop the rest, so you launch in weeks, not quarters.",
  },
  {
    title: "We automate the boring parts",
    body: "Spreadsheets, copy-paste, chasing payments on WhatsApp. We replace them with simple automation and use AI only where it actually saves time.",
  },
  {
    title: "The founder tests every release",
    body: "Nothing ships until Mithila has tested it herself, with 11+ years of fintech and enterprise SaaS product work behind every sign-off.",
  },
];

export const weeks = [
  {
    n: "1",
    title: "Operational discovery",
    body: "We sit with the people doing the work, map every manual step, find where data gets lost or re-typed, and write a short product spec you can read in ten minutes.",
  },
  {
    n: "2",
    title: "Backlog & first screens",
    body: "The spec becomes a prioritised backlog, a data model and clickable screens. You see how it will work before the real build starts.",
  },
  {
    n: "3",
    title: "Build & integrate",
    body: "We build the core modules, connect the services you already use (Razorpay, WhatsApp, Slack, your accounting tool) and finish the interface.",
  },
  {
    n: "4",
    title: "Testing & launch",
    body: "Mithila personally tests every flow and edge case before anything goes live. Then we hand over the production system and train your team on it.",
  },
];

export const record = [
  { k: "Payments · Japan", v: "Launched a prepaid card product for a Japan-based payments platform." },
  { k: "Gaming · JP & KR", v: "Ran digital gift-card programmes for gaming platforms across Japan and Korea." },
  { k: "Fintech strategy", v: "Built the 5-year financial forecast behind a new product line." },
  {
    k: "Data quality",
    v: "Caught a revenue (GMV) miscalculation and an overstated activation metric before they reached leadership reports.",
  },
  { k: "HR & payroll · India", v: "Earlier, shipped HR and payroll software used by businesses across India." },
];

export const roles = [
  {
    title: "Forward-deployed engineers",
    body: "Work inside your operations to understand the real process and get the system adopted.",
  },
  {
    title: "NLP & machine-learning data scientists",
    body: "Build the automation, document reading and predictions where data can do the work.",
  },
  {
    title: "Developers",
    body: "Build and integrate the web and mobile apps, payments and APIs.",
  },
  {
    title: "Designers",
    body: "Make the product simple enough for non-technical staff to use from day one.",
  },
];
