export type DiscoveryEntityType = "author" | "writer" | "book" | "publisher" | "keyword";

export type DiscoveryEntity = {
  id: string;
  type: DiscoveryEntityType;
  label: string;
  aliases: string[];
  source: "local" | "openlibrary" | "googlebooks";
};

export type DiscoveryQueryPlan = {
  normalizedQuery: string;
  variants: string[];
  matchedEntities: DiscoveryEntity[];
};

type BuildDiscoveryQueryPlanOptions = {
  maxVariants?: number;
};

const RAW_READING_WRITING_TAGS = `
#Bookstodon #BookWyrm #NowReading #CurrentlyReading #BookClub #BookReview #Writertodon #AuthorsofMastodon #FediAuthors #FediverseAuthors #AuthorsofFediverse #WritingCommunity #Writing #Writer #Writers #Libstodon #TBR #AmWriting #WordCount #MSWL #Library #LibraryLife #Archive #OpenAccess #Literature #Literary #Astrodon #BookShelf #GoodReads #GoodRead #GoodBook #GoodBooks #Book #Books #AmEditing #WIP #WriterWednesday #VSS #VeryShortStory #FlashFiction #Fiction #NonFiction #Author #Authors #Poetry #PoetTues #PoetTuesday #MicroFiction #MicroSFF #Haiku #Tanka #BlackoutPoetry #PoetryCommunity #Verses #IReadYA #KidLit #MiddleGrade #AcademicReading #LongReads #ShortReads #OwnVoices #BookRecommendation #BookRecommendations #ToRead #Shelfy #Shelfie #BookBlog #BookBlogs #BookBlogger #BookBloggers #BookTuber #BookTubers #amRevising #WritingSprint #ReadingSprint #Read #Reads #WritersWednesday #IndieAuthor #IndieAuthors #IndieWriter #IndieWriters #SelfPub #SelfPublishing #SciFi #Fantasy #DarkFantasy #Gothic #Horror #MicroPoetry #Romance #RomanceWriter #RomanceReader #YALit #Memoir #Biography #Bibliography #GraphicNovel #GraphicNovels #Manga #Comic #Comics #ComicBook #ComicBooks #DiverseBooks #DiverseBook #BlackWriter #BlackWriters #BlackAuthor #BlackAuthors #BIPOCWriter #BIPOCWriters #BIPOCAuthor #BIPOCAuthors #A11y #NobelPrize #Ebook #Paperback [#bibliotherapy](https://mastodon.social/tags/bibliotherapy) #Novel #Novels #Novelist #ShortStory #ShortStories #VeryShortStories #Novelists #Bibliophile #BookWorm #BookGeek #BookWorms #BookGeeks #ComicNerd #ComicNerds #ComicGeek #ComicGeeks #BookNerd #BooksNerd #BookNerds #ActiveRead #ActiveReader #ActiveReaders #BingeRead #BingeReader #BingeReaders #BingeReading #Story #Stories #WebNovel #WebSeries #Donghua #Manhwa #Livros #Libros #Literatura #Novela #Isekai# #AuthorLife #AuthorsLife #Scribe #Scribes #ScribesAndMakers #LightNovel #LightNovels #WordWeaver #WordWeavers #CharlesDickens #Shakespeare #Manhua #Mysteries #Mystery #WritersGuild #EoinColfer #HarryPotterBooks #HarryPotterSeries #JRRTolkien #JKRowling #RickRiordan #MitchAlbom #AudioBook #AudioBooks #StephenKing #Orwell #GeorgeOrwell #JuliaCameron #EBook #EBooks #DigitalBook #DigitalBooks #EReader #EReaders #Nook #DigitalLibrary #DigitalLibraries #JourneyToTheWest #NewYorkTimesBestSeller #Pulitzer #PulitzerPrize
`;

const canonicalHashtagTerms = buildCanonicalHashtagTerms(RAW_READING_WRITING_TAGS);

const localEntityCatalog: DiscoveryEntity[] = [
  {
    id: "entity-charles-dickens",
    type: "author",
    label: "Charles Dickens",
    aliases: ["charles dickens", "dickens"],
    source: "local"
  },
  {
    id: "entity-william-shakespeare",
    type: "author",
    label: "William Shakespeare",
    aliases: ["william shakespeare", "shakespeare"],
    source: "local"
  },
  {
    id: "entity-jrr-tolkien",
    type: "author",
    label: "J.R.R. Tolkien",
    aliases: ["jrr tolkien", "tolkien"],
    source: "local"
  },
  {
    id: "entity-jk-rowling",
    type: "author",
    label: "J.K. Rowling",
    aliases: ["jk rowling", "rowling"],
    source: "local"
  },
  {
    id: "entity-rick-riordan",
    type: "author",
    label: "Rick Riordan",
    aliases: ["rick riordan"],
    source: "local"
  },
  {
    id: "entity-stephen-king",
    type: "author",
    label: "Stephen King",
    aliases: ["stephen king"],
    source: "local"
  },
  {
    id: "entity-george-orwell",
    type: "author",
    label: "George Orwell",
    aliases: ["george orwell", "orwell"],
    source: "local"
  },
  {
    id: "entity-harry-potter",
    type: "book",
    label: "Harry Potter",
    aliases: ["harry potter", "harry potter books", "harry potter series"],
    source: "local"
  },
  {
    id: "entity-journey-to-the-west",
    type: "book",
    label: "Journey to the West",
    aliases: ["journey to the west"],
    source: "local"
  }
];

export function buildDiscoveryQueryPlan(
  query: string,
  options: BuildDiscoveryQueryPlanOptions = {}
): DiscoveryQueryPlan {
  const normalizedQuery = normalizeQuery(query);
  const maxVariants = Math.max(1, options.maxVariants ?? 8);

  if (!normalizedQuery) {
    return {
      normalizedQuery: "",
      variants: [],
      matchedEntities: []
    };
  }

  const matchedEntities = matchLocalEntities(normalizedQuery);
  const variants = new Set<string>([normalizedQuery]);

  const tokens = extractTokens(normalizedQuery);
  for (const token of tokens) {
    const canonical = canonicalizeTagToken(token);
    if (!canonical || !canonicalHashtagTerms.has(canonical)) {
      continue;
    }

    variants.add(`#${canonical}`);
    variants.add(canonical);
    variants.add(token.startsWith("#") ? token : `#${token}`);
    variants.add(token.startsWith("#") ? token.slice(1) : token);
  }

  for (const entity of matchedEntities) {
    variants.add(entity.label.toLowerCase());
    for (const alias of entity.aliases) {
      variants.add(alias.toLowerCase());
    }
  }

  return {
    normalizedQuery,
    variants: Array.from(variants)
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, maxVariants),
    matchedEntities
  };
}

function buildCanonicalHashtagTerms(source: string): Set<string> {
  const set = new Set<string>();
  const matches = source.matchAll(/#([A-Za-z0-9_]+)/g);
  for (const match of matches) {
    const canonical = canonicalizeTagToken(match[1]);
    if (canonical) set.add(canonical);
  }
  return set;
}

function canonicalizeTagToken(value: string): string {
  return value.replace(/^#+/, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function normalizeQuery(input: string): string {
  return input.trim().replace(/\s+/g, " ").toLowerCase();
}

function extractTokens(query: string): string[] {
  const raw = query.match(/#[a-z0-9_]+|[a-z0-9_]+/gi) ?? [];
  const unique = new Set<string>();

  for (const token of raw) {
    unique.add(token.toLowerCase());
  }

  return Array.from(unique);
}

function matchLocalEntities(normalizedQuery: string): DiscoveryEntity[] {
  return localEntityCatalog.filter((entity) => entity.aliases.some((alias) => normalizedQuery.includes(alias.toLowerCase())));
}
