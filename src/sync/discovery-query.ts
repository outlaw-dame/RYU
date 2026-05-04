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
  /**
   * Enriched lexical form that includes camelCase splits and de-hashed forms,
   * so `#MitchAlbom` and `Mitch Albom` produce equivalent lexical matches.
   */
  lexicalQuery: string;
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
      lexicalQuery: "",
      variants: [],
      matchedEntities: []
    };
  }

  const matchedEntities = matchLocalEntities(normalizedQuery);
  const variants = new Set<string>([normalizedQuery]);
  const lexicalSegments = new Set<string>([normalizedQuery]);

  // Operate on the raw input so we can detect camelCase before lowercasing.
  const rawTokens = extractRawTokens(query);
  for (const rawToken of rawTokens) {
    const stripped = rawToken.replace(/^#+/, "");
    const lowerStripped = stripped.toLowerCase();
    const lowerToken = rawToken.toLowerCase();

    // CamelCase / PascalCase / multi-word splits — `MitchAlbom` -> `mitch albom`,
    // `WriterWednesday` -> `writer wednesday`, `JRRTolkien` -> `jrr tolkien`.
    const split = splitCamelCase(stripped).toLowerCase();
    if (split && split !== lowerStripped && split.includes(" ")) {
      variants.add(split);
      variants.add(`#${split.replace(/\s+/g, "")}`);
      lexicalSegments.add(split);
    }

    // Symmetry: hashtag form <-> plain form for ANY token (not just curated tags),
    // so the same query reaches both lexical and hashtag-tagged content.
    if (rawToken.startsWith("#")) {
      variants.add(lowerStripped);
      lexicalSegments.add(lowerStripped);
    } else if (lowerStripped.length >= 3) {
      variants.add(`#${lowerStripped}`);
    }

    // Curated reading/writing hashtag catalog — keep the original behavior.
    const canonical = canonicalizeTagToken(rawToken);
    if (canonical && canonicalHashtagTerms.has(canonical)) {
      variants.add(`#${canonical}`);
      variants.add(canonical);
      variants.add(rawToken.startsWith("#") ? lowerToken : `#${lowerToken}`);
      variants.add(rawToken.startsWith("#") ? lowerStripped : lowerToken);
    }
  }

  for (const entity of matchedEntities) {
    variants.add(entity.label.toLowerCase());
    for (const alias of entity.aliases) {
      variants.add(alias.toLowerCase());
    }
  }

  // Title-Case phrases (e.g. "Mitch Albom", "Stephen King") get a concatenated
  // hashtag form so plain-text queries reach #MitchAlbom-tagged content.
  const titlePhrases = query.match(/\b[A-Z][a-z0-9]+(?:\s+[A-Z][a-z0-9]+)+\b/g) ?? [];
  for (const phrase of titlePhrases) {
    const concatenated = phrase.replace(/\s+/g, "").toLowerCase();
    if (concatenated.length >= 3) {
      variants.add(`#${concatenated}`);
    }
  }

  const lexicalQuery = Array.from(lexicalSegments)
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");

  return {
    normalizedQuery,
    lexicalQuery,
    variants: Array.from(variants)
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, maxVariants),
    matchedEntities
  };
}

/**
 * Split a token like `MitchAlbom` into `Mitch Albom`. Handles consecutive
 * uppercase blocks (`JRRTolkien` -> `JRR Tolkien`, `XMLParser` -> `XML Parser`)
 * and digit/letter transitions. Returns input unchanged if no split applies.
 */
export function splitCamelCase(token: string): string {
  if (!token) return "";
  const stripped = token.replace(/^#+/, "");
  const spaced = stripped
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced;
}

function extractRawTokens(input: string): string[] {
  const matches = input.match(/#[A-Za-z0-9_]+|[A-Za-z0-9_]+/g) ?? [];
  const unique = new Set<string>();
  for (const token of matches) {
    unique.add(token);
  }
  return Array.from(unique);
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

function matchLocalEntities(normalizedQuery: string): DiscoveryEntity[] {
  return localEntityCatalog.filter((entity) => entity.aliases.some((alias) => normalizedQuery.includes(alias.toLowerCase())));
}
