export const resources = {
  en: {
    translation: {
      nav: {
        main: "Main navigation"
      },
      tabs: {
        home: "Home",
        search: "Search",
        shelves: "Shelves",
        activity: "Activity",
        account: "Account"
      },
      screen: {
        homeEyebrow: "Good evening",
        library: "Library",
        search: "Search",
        shelves: "Shelves",
        activity: "Activity",
        account: "Account"
      },
      section: {
        currentlyReading: "Currently Reading",
        bookTokTrending: "BookTok Trending"
      },
      action: {
        refresh: "Refresh"
      },
      language: {
        label: "Language",
        english: "English",
        spanish: "Spanish"
      },
      home: {
        memberAccessTitle: "Member access",
        memberAccessDescription: "Sign in or create an account to sync reading activity.",
        memberSignIn: "Member sign in",
        becomeMember: "Become a member",
        noNowReading: "No live #NowReading posts found right now.",
        currentlyReadingUpdatedAt: "Currently Reading updated: {{date}}",
        importedFromBookWyrm: "Imported From BookWyrm",
        recentlyAdded: "Recently Added",
        bookTokUpdatedAt: "BookTok updated: {{date}}",
        bookTokFallback: "Showing curated BookTok picks while live trend sync initializes."
      },
      search: {
        placeholder: "Search books, authors, ISBNs, themes...",
        ariaLabel: "Search library",
        facetsLabel: "Search facets",
        suggestionsLabel: "Search suggestions",
        importPlaceholder: "https://bookwyrm.social/book/...",
        importAriaLabel: "BookWyrm edition URL",
        importing: "Importing...",
        importEdition: "Import edition",
        smartSearchDescription: "Smart Search blends your library with federated reading and writing discussion.",
        fediverseDiscovery: "Fediverse Discovery",
        noFederatedResultsTitle: "No federated results",
        noFederatedResultsDescription: "Try another phrase, hashtag, author, or book title.",
        noResultsTitle: "No results",
        noResultsDescription: "Try another title, author, ISBN, or theme.",
        importedEditions: "Imported Editions",
        noImportedBooksTitle: "No imported books yet",
        noImportedBooksDescription: "BookWyrm editions you import will appear here.",
        facets: {
          books: "Books",
          writing: "Writing",
          fediverse: "Fediverse"
        },
        sections: {
          editions: "Editions",
          works: "Works",
          authors: "Authors"
        },
        whyThisResult: "Why this result?"
      },
      shelves: {
        signInTitle: "Sign in to load shelves",
        signInDescription: "Your Mastodon and BookWyrm shelves will appear here.",
        bookmarks: "Bookmarks",
        favourites: "Favourites",
        lists: "Lists",
        noBookmarks: "No bookmarks yet.",
        noFavourites: "No favourites yet.",
        removeBookmark: "Remove bookmark",
        unfavourite: "Unfavourite",
        errorUnauthenticated: "Your session expired. Sign in again to load shelves.",
        errorNetwork: "Shelves could not be loaded right now."
      },
      activity: {
        signInTitle: "Sign in to load activity",
        signInDescription: "Your home timeline, notifications, and reading updates will appear here.",
        composePrompt: "What are you reading?",
        enablePostingTitle: "Enable posting",
        enablePostingDescription: "Your current session does not include write permissions. Sign out and sign back in to enable posting.",
        notifications: "Notifications",
        noNotifications: "No notifications yet.",
        homeTimeline: "Home Timeline",
        noTimelinePosts: "No timeline posts yet.",
        lastUpdated: "Last updated",
        lastUpdatedAt: "Last updated: {{date}}",
        notificationVerbs: {
          follow: "followed you",
          favourite: "favourited your post",
          mention: "mentioned you",
          reblog: "boosted your post",
          status: "posted a new update",
          update: "updated a post"
        }
      },
      settings: {
        back: "< Settings",
        intelligence: {
          title: "Intelligence",
          description: "Control local semantic search, advanced ranking, and AI-assisted query understanding."
        },
        account: {
          title: "Account"
        },
        privacy: {
          title: "Privacy"
        },
        rows: {
          intelligence: "Search quality, semantic models, rerankers, and AI-assisted query understanding.",
          account: "Manage your connected Mastodon or BookWyrm account.",
          privacy: "Local data, cache, and model-download controls will live here."
        }
      },
      shared: {
        openPost: "Open post",
        readingPost: "Reading post",
        favourite: "Favourite",
        removeFavourite: "Remove favourite",
        bookmark: "Bookmark",
        removeBookmark: "Remove bookmark",
        save: "Save",
        saved: "Saved",
        removing: "Removing...",
        working: "Working...",
        refreshing: "Refreshing...",
        fediverse: "Fediverse",
        previous: "Previous",
        next: "Next"
      },
      account: {
        postReadingUpdate: "Post Reading Update",
        switchAccount: "Switch account",
        signOut: "Sign out",
        signingOut: "Signing out...",
        pinnedPosts: "Pinned posts",
        profile: "profile",
        profileAriaLabel: "{{name}} profile",
        profileLabel: "{{origin}} profile",
        avatar: "avatar",
        avatarAlt: "{{name}} avatar",
        bio: "Bio",
        noBio: "No bio provided on this account yet.",
        featuredHashtags: "Featured hashtags",
        noFeaturedHashtags: "No hashtags detected from recent now-reading posts.",
        recentReadingMentions: "Recent reading mentions",
        openRemoteProfile: "Open remote profile",
        loadingProfile: "Loading profile...",
        followers_one: "follower",
        followers_other: "followers",
        following_one: "following",
        following_other: "following",
        posts_one: "post",
        posts_other: "posts"
      },
      auth: {
        introTitle: "Use the server you already know, or pick one and come back when your account is ready.",
        introDescription: "RYU keeps sign-in and server discovery separate so you can move through either path cleanly.",
        signInTitle: "Sign in",
        signInDescription: "Enter your home server and continue through secure OAuth sign-in.",
        instancePlaceholder: "bookwyrm.social",
        instanceAriaLabel: "BookWyrm or Mastodon instance",
        signInWithServer: "Sign in with this server",
        findServer: "Find server",
        createAccountTitle: "Create account",
        createAccountDescription: "Browse open-registration servers filtered for compatibility and safety, then open one to create your account.",
        refreshList: "Refresh list",
        browseServers: "Browse servers",
        selectedServer: "Selected server",
        openServer: "Open server",
        continueWithServer: "Continue with this server",
        loadingEligibleInstances: "Loading eligible instances...",
        noEligibleInstances: "No eligible instances found right now.",
        lastRefreshed: "Last refreshed",
        lastRefreshedAt: "Last refreshed: {{date}}",
        backendExchangeTitle: "Backend exchange required",
        backendExchangeDescription: "Mastodon currently provisions confidential clients, so token exchange must run on a backend endpoint and never in browser-only code.",
        instancePicker: "Instance picker",
        findServerTitle: "Find a server",
        findServerDescription: "Open a server to create an account, or use it immediately if you already have one there.",
        searchInstancesPlaceholder: "Search domain, software, country",
        searchInstancesAriaLabel: "Search instances",
        preferredSoftware: "Preferred software",
        preferBookWyrm: "Prefer BookWyrm",
        preferMastodon: "Prefer Mastodon",
        noPreference: "No preference",
        preferredCountry: "Preferred country",
        anyCountry: "Any country",
        users_one: "user",
        users_other: "users",
        useThisServer: "Use this server",
        openSite: "Open site",
        noMatches: "No matches for current filters.",
        instancesNote: "Only open-registration instances are shown. Oliphant Tier 0 domains are excluded."
      },
      bookDetail: {
        dialogLabel: "book details",
        by: "by",
        closeAria: "Close book detail",
        close: "Close",
        coverOf: "Cover of",
        pages: "Pages",
        published: "Published",
        language: "Language",
        editions: "Editions",
        editionCount_one: "{{count}} edition",
        editionCount_other: "{{count}} editions",
        about: "About",
        openOnOpenLibrary: "Open on OpenLibrary",
        description: "Description",
        isbn10: "ISBN-10",
        isbn13: "ISBN-13",
        source: "Source",
        viewSource: "View source",
        reviews: "Reviews",
        noReviews: "No reviews yet.",
        readingStatus: "Reading status",
        authors: "Authors",
        viewAuthor: "View author"
      },
      library: {
        title: "Library",
        searchPlaceholder: "Search your library...",
        searchAriaLabel: "Search within library",
        allBooks: "All Books",
        wantToRead: "Want to Read",
        reading: "Reading",
        read: "Read",
        didNotFinish: "Did Not Finish",
        emptyTitle: "Your library is empty",
        emptyDescription: "Import books from BookWyrm or add them from search.",
        emptyFilterTitle: "No books in this shelf",
        emptyFilterDescription: "Move books here by changing their reading status.",
        bookCount_one: "{{count}} book",
        bookCount_other: "{{count}} books"
      },
      readingStatus: {
        label: "Reading status",
        none: "Not shelved",
        wantToRead: "Want to Read",
        reading: "Currently Reading",
        read: "Read",
        didNotFinish: "Did Not Finish",
        changed: "Status updated"
      },
      authorDetail: {
        works: "Works",
        editions: "Editions",
        bio: "About",
        noBio: "No biography available.",
        noWorks: "No works found for this author."
      },
      editionDetail: {
        subtitle: "Subtitle",
        isbn10: "ISBN-10",
        isbn13: "ISBN-13",
        source: "Source",
        viewSource: "View source",
        authors: "Authors",
        work: "Work"
      },
      review: {
        rating: "{{count}} star",
        rating_other: "{{count}} stars",
        visibility: "Visibility",
        publishedOn: "Published {{date}}"
      },
      reviews: {
        listTitle: "Reviews",
        addReview: "Add review",
        empty: "No reviews yet.",
        loading: "Loading reviews...",
        edit: "Edit review",
        delete: "Delete review",
        private: "Private",
        composeTitle: "Write Review",
        noteTitle: "Quick Note",
        titlePlaceholder: "Review title (optional)",
        titleLabel: "Review title",
        contentPlaceholder: "Share your thoughts about this book...",
        contentLabel: "Review content",
        notePlaceholder: "Jot down a quick note or annotation...",
        noteContentLabel: "Note content",
        notePrivacyNotice: "Notes are private and never leave your device.",
        ratingLabel: "Rating",
        starAria: "{{count}} star",
        starAria_other: "{{count}} stars",
        visibilityLabel: "Visibility",
        visibilityPublic: "Public",
        visibilityPublicDesc: "Can be published to your server",
        visibilityPrivate: "Private",
        visibilityPrivateDesc: "Stays on this device only",
        saveDraft: "Save Draft",
        publish: "Publish",
        publishing: "Publishing...",
        saveNote: "Save Note",
        saving: "Saving...",
        discard: "Discard",
        autoSaved: "Draft auto-saved"
      },
      nowReading: {
        viewReaderProfile: "View reader profile",
        openOriginalPost: "Open original post"
      },
      onboarding: {
        welcomeTitle: "Welcome to RYU",
        welcomeDescription: "RYU is a privacy-first reading companion that keeps your data on your device. Connecting an account is optional but unlocks social features.",
        welcomePoint1: "Your library stays on this device. Nothing is uploaded without your action.",
        welcomePoint2: "Connect a BookWyrm or Mastodon account to see timelines, shelves, and reading activity.",
        welcomePoint3: "You can disconnect or switch accounts at any time.",
        connectTitle: "Connect your account",
        connectDescription: "Enter the address of your BookWyrm or Mastodon server. You will be redirected there to approve access, then sent back here.",
        permissionsTitle: "What access is requested",
        permissionRead: "Read your profile, statuses, and notifications so RYU can display them.",
        permissionNotifications: "Read notifications to show follow and favourite alerts.",
        permissionOptionalWrite: "Optionally: post reading updates and manage favourites/bookmarks (only if you grant write access).",
        permissionsFootnote: "RYU never stores your password. Authentication uses secure OAuth with PKCE, the same standard used by banking apps.",
        connectedTo: "Connected to {{instance}}",
        scopesGranted: "Permissions: {{scopes}}",
        tryAgain: "Try again",
        dismiss: "Dismiss",
        privacyTitle: "Search and privacy",
        privacyDescription: "RYU searches your library on-device. You can optionally enable smarter search that downloads a small model to improve results. All processing stays on your device.",
        enhancedSearchLabel: "Smart search",
        enhancedSearchDescription: "Downloads a small model (about 25 MB) to better understand book titles, authors, and themes. Runs entirely on your device.",
        personalizationLabel: "Personalized results",
        personalizationDescription: "Uses your reading history to surface books you are more likely looking for. Never shared externally.",
        federatedDiscoveryLabel: "Community discovery",
        federatedDiscoveryDescription: "Shows reading discussions from the wider fediverse in search results. Fetches public posts from relay servers.",
        privacyFootnote: "All search features run locally on your device. No search queries or reading history leave this app. You can change these settings later in Settings."
      },
      social: {
        filterLabel: "Activity filters",
        filterAll: "All",
        filterBooks: "Books",
        filterReviews: "Reviews",
        filterRecommendations: "Recommendations",
        filterFollowing: "Following",
        noActivity: "No activity yet.",
        noMatchingActivity: "No matching activity for this filter.",
        otherActivity: "Other Activity",
        readingActivity: "Updated their reading activity.",
        groupAuthorCount: "{{count}} people",
        groupAuthorCount_one: "1 person",
        typeReview: "Review",
        typeRating: "Rating",
        typeReadingUpdate: "Reading",
        typeRecommendation: "Rec",
        typeDiscussion: "Discussion"
      },
      composer: {
        title: {
          status: "Reading Update",
          review: "Write Review",
          reply: "Reply"
        },
        placeholder: {
          status: "What are you reading? Share a book update with your community...",
          review: "Share your thoughts about this book...",
          reply: "Write your reply..."
        },
        textLabel: "Compose text",
        titlePlaceholder: "Review title (optional)",
        titleLabel: "Review title",
        cancel: "Cancel",
        saveDraft: "Save Draft",
        discard: "Discard",
        publish: "Publish",
        publishing: "Publishing...",
        visibility: {
          label: "Visibility",
          public: "Public",
          publicDesc: "Visible to everyone",
          unlisted: "Unlisted",
          unlistedDesc: "Not shown in public timelines",
          followersOnly: "Followers",
          followersOnlyDesc: "Only your followers can see",
          direct: "Direct",
          directDesc: "Only mentioned people can see"
        },
        cw: {
          toggle: "Content warning",
          placeholder: "Write a content warning...",
          label: "Content warning text"
        },
        draft: {
          unsaved: "Unsaved changes",
          restored: "Draft restored"
        },
        errors: {
          textRequired: "Content cannot be empty",
          textTooLong: "Content exceeds character limit",
          titleTooLong: "Title exceeds character limit",
          cwRequired: "Content warning text is required when enabled",
          cwTooLong: "Content warning exceeds character limit",
          tooManyAttachments: "Too many attachments",
          unknown: "Something went wrong"
        }
      }
    }
  },
  es: {
    translation: {
      nav: {
        main: "Navegacion principal"
      },
      tabs: {
        home: "Inicio",
        search: "Buscar",
        shelves: "Estanterias",
        activity: "Actividad",
        account: "Cuenta"
      },
      screen: {
        homeEyebrow: "Buenas noches",
        library: "Biblioteca",
        search: "Buscar",
        shelves: "Estanterias",
        activity: "Actividad",
        account: "Cuenta"
      },
      section: {
        currentlyReading: "Lectura actual",
        bookTokTrending: "Tendencias de BookTok"
      },
      action: {
        refresh: "Actualizar"
      },
      language: {
        label: "Idioma",
        english: "Inglés",
        spanish: "Español"
      },
      home: {
        memberAccessTitle: "Acceso de miembro",
        memberAccessDescription: "Inicia sesión o crea una cuenta para sincronizar tu actividad de lectura.",
        memberSignIn: "Iniciar sesión",
        becomeMember: "Hazte miembro",
        noNowReading: "No hay publicaciones #NowReading en este momento.",
        currentlyReadingUpdatedAt: "Lectura actual actualizada: {{date}}",
        importedFromBookWyrm: "Importado desde BookWyrm",
        recentlyAdded: "Recién agregado",
        bookTokUpdatedAt: "BookTok actualizado: {{date}}",
        bookTokFallback: "Mostrando selecciones curadas de BookTok mientras se inicia la sincronización en vivo."
      },
      search: {
        placeholder: "Busca libros, autores, ISBN y temas...",
        ariaLabel: "Buscar en la biblioteca",
        facetsLabel: "Facetas de búsqueda",
        suggestionsLabel: "Sugerencias de búsqueda",
        importPlaceholder: "https://bookwyrm.social/book/...",
        importAriaLabel: "URL de edición de BookWyrm",
        importing: "Importando...",
        importEdition: "Importar edición",
        smartSearchDescription: "La búsqueda inteligente combina tu biblioteca con conversaciones federadas sobre lectura y escritura.",
        fediverseDiscovery: "Descubrimiento en Fediverso",
        noFederatedResultsTitle: "Sin resultados federados",
        noFederatedResultsDescription: "Prueba otra frase, hashtag, autor o título.",
        noResultsTitle: "Sin resultados",
        noResultsDescription: "Prueba otro título, autor, ISBN o tema.",
        importedEditions: "Ediciones importadas",
        noImportedBooksTitle: "Todavía no hay libros importados",
        noImportedBooksDescription: "Las ediciones de BookWyrm que importes aparecerán aquí.",
        facets: {
          books: "Libros",
          writing: "Escritura",
          fediverse: "Fediverso"
        },
        sections: {
          editions: "Ediciones",
          works: "Obras",
          authors: "Autores"
        },
        whyThisResult: "¿Por qué este resultado?"
      },
      shelves: {
        signInTitle: "Inicia sesión para cargar estanterías",
        signInDescription: "Tus estanterias de Mastodon y BookWyrm apareceran aqui.",
        bookmarks: "Marcadores",
        favourites: "Favoritos",
        lists: "Listas",
        noBookmarks: "Aún no hay marcadores.",
        noFavourites: "Aún no hay favoritos.",
        removeBookmark: "Quitar marcador",
        unfavourite: "Quitar favorito",
        errorUnauthenticated: "Tu sesión expiró. Inicia sesión de nuevo para cargar estanterías.",
        errorNetwork: "No se pudieron cargar las estanterias ahora."
      },
      activity: {
        signInTitle: "Inicia sesión para cargar actividad",
        signInDescription: "Tu timeline, notificaciones y actualizaciones de lectura aparecerán aquí.",
        composePrompt: "¿Qué estás leyendo?",
        enablePostingTitle: "Habilitar publicaciones",
        enablePostingDescription: "Tu sesión actual no incluye permisos de escritura. Cierra sesión y vuelve a entrar para publicar.",
        notifications: "Notificaciones",
        noNotifications: "Aún no hay notificaciones.",
        homeTimeline: "Timeline principal",
        noTimelinePosts: "Aún no hay publicaciones en el timeline.",
        lastUpdated: "Última actualización",
        lastUpdatedAt: "Última actualización: {{date}}",
        notificationVerbs: {
          follow: "empezó a seguirte",
          favourite: "marcó tu publicación como favorita",
          mention: "te mencionó",
          reblog: "impulsó tu publicación",
          status: "publicó una nueva actualización",
          update: "actualizó una publicación"
        }
      },
      settings: {
        back: "< Ajustes",
        intelligence: {
          title: "Inteligencia",
          description: "Controla la búsqueda semántica local, el ranking avanzado y la comprensión asistida por IA."
        },
        account: {
          title: "Cuenta"
        },
        privacy: {
          title: "Privacidad"
        },
        rows: {
          intelligence: "Calidad de búsqueda, modelos semánticos, rerankers y comprensión asistida por IA.",
          account: "Administra tu cuenta conectada de Mastodon o BookWyrm.",
          privacy: "Los controles de datos locales, cache y descarga de modelos estarán aquí."
        }
      },
      shared: {
        openPost: "Abrir publicación",
        readingPost: "Publicación de lectura",
        favourite: "Favorito",
        removeFavourite: "Quitar favorito",
        bookmark: "Marcador",
        removeBookmark: "Quitar marcador",
        save: "Guardar",
        saved: "Guardado",
        removing: "Quitando...",
        working: "Procesando...",
        refreshing: "Actualizando...",
        fediverse: "Fediverso",
        previous: "Anterior",
        next: "Siguiente"
      },
      account: {
        postReadingUpdate: "Publicar actualización de lectura",
        switchAccount: "Cambiar cuenta",
        signOut: "Cerrar sesión",
        signingOut: "Cerrando sesión...",
        pinnedPosts: "Publicaciones fijadas",
        profile: "perfil",
        profileAriaLabel: "Perfil de {{name}}",
        profileLabel: "Perfil de {{origin}}",
        avatar: "avatar",
        avatarAlt: "Avatar de {{name}}",
        bio: "Biografía",
        noBio: "Esta cuenta aún no tiene biografía.",
        featuredHashtags: "Hashtags destacados",
        noFeaturedHashtags: "No se detectaron hashtags en publicaciones recientes de lectura.",
        recentReadingMentions: "Menciones recientes de lectura",
        openRemoteProfile: "Abrir perfil remoto",
        loadingProfile: "Cargando perfil...",
        followers_one: "seguidor",
        followers_other: "seguidores",
        following_one: "seguido",
        following_other: "seguidos",
        posts_one: "publicación",
        posts_other: "publicaciones"
      },
      auth: {
        introTitle: "Usa el servidor que ya conoces, o elige uno y vuelve cuando tu cuenta esté lista.",
        introDescription: "RYU mantiene separados el inicio de sesión y el descubrimiento de servidores para que puedas avanzar por cualquiera de los dos caminos.",
        signInTitle: "Iniciar sesión",
        signInDescription: "Ingresa tu servidor y continúa mediante OAuth seguro.",
        instancePlaceholder: "bookwyrm.social",
        instanceAriaLabel: "Instancia de BookWyrm o Mastodon",
        signInWithServer: "Iniciar sesión con este servidor",
        findServer: "Buscar servidor",
        createAccountTitle: "Crear cuenta",
        createAccountDescription: "Explora servidores con registro abierto filtrados por compatibilidad y seguridad, luego abre uno para crear tu cuenta.",
        refreshList: "Actualizar lista",
        browseServers: "Explorar servidores",
        selectedServer: "Servidor seleccionado",
        openServer: "Abrir servidor",
        continueWithServer: "Continuar con este servidor",
        loadingEligibleInstances: "Cargando instancias elegibles...",
        noEligibleInstances: "No se encontraron instancias elegibles ahora.",
        lastRefreshed: "Última actualización",
        lastRefreshedAt: "Última actualización: {{date}}",
        backendExchangeTitle: "Se requiere intercambio en backend",
        backendExchangeDescription: "Mastodon aprovisiona clientes confidenciales, por lo que el intercambio de tokens debe ejecutarse en un endpoint de backend y nunca en código solo del navegador.",
        instancePicker: "Selector de instancias",
        findServerTitle: "Buscar un servidor",
        findServerDescription: "Abre un servidor para crear una cuenta, o úsalo de inmediato si ya tienes una.",
        searchInstancesPlaceholder: "Buscar dominio, software o país",
        searchInstancesAriaLabel: "Buscar instancias",
        preferredSoftware: "Software preferido",
        preferBookWyrm: "Preferir BookWyrm",
        preferMastodon: "Preferir Mastodon",
        noPreference: "Sin preferencia",
        preferredCountry: "País preferido",
        anyCountry: "Cualquier país",
        users_one: "usuario",
        users_other: "usuarios",
        useThisServer: "Usar este servidor",
        openSite: "Abrir sitio",
        noMatches: "No hay coincidencias para los filtros actuales.",
        instancesNote: "Solo se muestran instancias con registro abierto. Se excluyen los dominios Oliphant Tier 0."
      },
      bookDetail: {
        dialogLabel: "detalles del libro",
        by: "por",
        closeAria: "Cerrar detalle del libro",
        close: "Cerrar",
        coverOf: "Portada de",
        pages: "Páginas",
        published: "Publicado",
        language: "Idioma",
        editions: "Ediciones",
        editionCount_one: "{{count}} edición",
        editionCount_other: "{{count}} ediciones",
        about: "Acerca de",
        openOnOpenLibrary: "Abrir en OpenLibrary",
        description: "Descripción",
        isbn10: "ISBN-10",
        isbn13: "ISBN-13",
        source: "Fuente",
        viewSource: "Ver fuente",
        reviews: "Reseñas",
        noReviews: "Aún no hay reseñas.",
        readingStatus: "Estado de lectura",
        authors: "Autores",
        viewAuthor: "Ver autor"
      },
      library: {
        title: "Biblioteca",
        searchPlaceholder: "Buscar en tu biblioteca...",
        searchAriaLabel: "Buscar dentro de la biblioteca",
        allBooks: "Todos los libros",
        wantToRead: "Quiero leer",
        reading: "Leyendo",
        read: "Leído",
        didNotFinish: "No terminado",
        emptyTitle: "Tu biblioteca está vacía",
        emptyDescription: "Importa libros desde BookWyrm o agrégalos desde la búsqueda.",
        emptyFilterTitle: "No hay libros en este estante",
        emptyFilterDescription: "Mueve libros aquí cambiando su estado de lectura.",
        bookCount_one: "{{count}} libro",
        bookCount_other: "{{count}} libros"
      },
      readingStatus: {
        label: "Estado de lectura",
        none: "Sin clasificar",
        wantToRead: "Quiero leer",
        reading: "Leyendo actualmente",
        read: "Leído",
        didNotFinish: "No terminado",
        changed: "Estado actualizado"
      },
      authorDetail: {
        works: "Obras",
        editions: "Ediciones",
        bio: "Acerca de",
        noBio: "No hay biografía disponible.",
        noWorks: "No se encontraron obras de este autor."
      },
      editionDetail: {
        subtitle: "Subtítulo",
        isbn10: "ISBN-10",
        isbn13: "ISBN-13",
        source: "Fuente",
        viewSource: "Ver fuente",
        authors: "Autores",
        work: "Obra"
      },
      review: {
        rating: "{{count}} estrella",
        rating_other: "{{count}} estrellas",
        visibility: "Visibilidad",
        publishedOn: "Publicado {{date}}"
      },
      reviews: {
        listTitle: "Resenas",
        addReview: "Agregar resena",
        empty: "Aun no hay resenas.",
        loading: "Cargando resenas...",
        edit: "Editar resena",
        delete: "Eliminar resena",
        private: "Privada",
        composeTitle: "Escribir resena",
        noteTitle: "Nota rapida",
        titlePlaceholder: "Titulo de la resena (opcional)",
        titleLabel: "Titulo de la resena",
        contentPlaceholder: "Comparte tus pensamientos sobre este libro...",
        contentLabel: "Contenido de la resena",
        notePlaceholder: "Anota una nota rapida o anotacion...",
        noteContentLabel: "Contenido de la nota",
        notePrivacyNotice: "Las notas son privadas y nunca salen de tu dispositivo.",
        ratingLabel: "Calificacion",
        starAria: "{{count}} estrella",
        starAria_other: "{{count}} estrellas",
        visibilityLabel: "Visibilidad",
        visibilityPublic: "Publica",
        visibilityPublicDesc: "Se puede publicar en tu servidor",
        visibilityPrivate: "Privada",
        visibilityPrivateDesc: "Solo permanece en este dispositivo",
        saveDraft: "Guardar borrador",
        publish: "Publicar",
        publishing: "Publicando...",
        saveNote: "Guardar nota",
        saving: "Guardando...",
        discard: "Descartar",
        autoSaved: "Borrador guardado automaticamente"
      },
      nowReading: {
        viewReaderProfile: "Ver perfil del lector",
        openOriginalPost: "Abrir publicación original"
      },
      onboarding: {
        welcomeTitle: "Bienvenido a RYU",
        welcomeDescription: "RYU es un companero de lectura que prioriza la privacidad y mantiene tus datos en tu dispositivo. Conectar una cuenta es opcional pero desbloquea funciones sociales.",
        welcomePoint1: "Tu biblioteca permanece en este dispositivo. Nada se sube sin tu accion.",
        welcomePoint2: "Conecta una cuenta de BookWyrm o Mastodon para ver cronologias, estanterias y actividad de lectura.",
        welcomePoint3: "Puedes desconectar o cambiar de cuenta en cualquier momento.",
        connectTitle: "Conecta tu cuenta",
        connectDescription: "Ingresa la direccion de tu servidor BookWyrm o Mastodon. Seras redirigido alli para aprobar el acceso y luego volveras aqui.",
        permissionsTitle: "Que acceso se solicita",
        permissionRead: "Leer tu perfil, publicaciones y notificaciones para que RYU pueda mostrarlos.",
        permissionNotifications: "Leer notificaciones para mostrar alertas de seguimiento y favoritos.",
        permissionOptionalWrite: "Opcionalmente: publicar actualizaciones de lectura y gestionar favoritos/marcadores (solo si concedes acceso de escritura).",
        permissionsFootnote: "RYU nunca almacena tu contrasena. La autenticacion usa OAuth seguro con PKCE, el mismo estandar que usan las aplicaciones bancarias.",
        connectedTo: "Conectado a {{instance}}",
        scopesGranted: "Permisos: {{scopes}}",
        tryAgain: "Intentar de nuevo",
        dismiss: "Descartar",
        privacyTitle: "Busqueda y privacidad",
        privacyDescription: "RYU busca en tu biblioteca en el dispositivo. Puedes habilitar opcionalmente una busqueda mas inteligente que descarga un modelo pequeno para mejorar los resultados. Todo el procesamiento permanece en tu dispositivo.",
        enhancedSearchLabel: "Busqueda inteligente",
        enhancedSearchDescription: "Descarga un modelo pequeno (aproximadamente 25 MB) para entender mejor titulos, autores y temas. Se ejecuta completamente en tu dispositivo.",
        personalizationLabel: "Resultados personalizados",
        personalizationDescription: "Usa tu historial de lectura para mostrar libros que probablemente buscas. Nunca se comparte externamente.",
        federatedDiscoveryLabel: "Descubrimiento comunitario",
        federatedDiscoveryDescription: "Muestra discusiones de lectura del fediverso en los resultados de busqueda. Obtiene publicaciones publicas de servidores relay.",
        privacyFootnote: "Todas las funciones de busqueda se ejecutan localmente en tu dispositivo. Ninguna consulta de busqueda ni historial de lectura sale de esta aplicacion. Puedes cambiar estos ajustes mas tarde en Configuracion."
      },
      social: {
        filterLabel: "Filtros de actividad",
        filterAll: "Todo",
        filterBooks: "Libros",
        filterReviews: "Resenas",
        filterRecommendations: "Recomendaciones",
        filterFollowing: "Siguiendo",
        noActivity: "Sin actividad todavia.",
        noMatchingActivity: "No hay actividad para este filtro.",
        otherActivity: "Otra actividad",
        readingActivity: "Actualizo su actividad de lectura.",
        groupAuthorCount: "{{count}} personas",
        groupAuthorCount_one: "1 persona",
        typeReview: "Resena",
        typeRating: "Calificacion",
        typeReadingUpdate: "Lectura",
        typeRecommendation: "Rec",
        typeDiscussion: "Discusion"
      },
      composer: {
        title: {
          status: "Actualizacion de lectura",
          review: "Escribir resena",
          reply: "Responder"
        },
        placeholder: {
          status: "Que estas leyendo? Comparte una actualizacion con tu comunidad...",
          review: "Comparte tus pensamientos sobre este libro...",
          reply: "Escribe tu respuesta..."
        },
        textLabel: "Texto del mensaje",
        titlePlaceholder: "Titulo de la resena (opcional)",
        titleLabel: "Titulo de la resena",
        cancel: "Cancelar",
        saveDraft: "Guardar borrador",
        discard: "Descartar",
        publish: "Publicar",
        publishing: "Publicando...",
        visibility: {
          label: "Visibilidad",
          public: "Publica",
          publicDesc: "Visible para todos",
          unlisted: "No listada",
          unlistedDesc: "No se muestra en timelines publicos",
          followersOnly: "Seguidores",
          followersOnlyDesc: "Solo tus seguidores pueden ver",
          direct: "Directa",
          directDesc: "Solo las personas mencionadas pueden ver"
        },
        cw: {
          toggle: "Advertencia de contenido",
          placeholder: "Escribe una advertencia de contenido...",
          label: "Texto de advertencia de contenido"
        },
        draft: {
          unsaved: "Cambios sin guardar",
          restored: "Borrador restaurado"
        },
        errors: {
          textRequired: "El contenido no puede estar vacio",
          textTooLong: "El contenido excede el limite de caracteres",
          titleTooLong: "El titulo excede el limite de caracteres",
          cwRequired: "El texto de advertencia es obligatorio cuando esta habilitado",
          cwTooLong: "La advertencia excede el limite de caracteres",
          tooManyAttachments: "Demasiados archivos adjuntos",
          unknown: "Algo salio mal"
        }
      }
    }
  }
} as const;

export type SupportedLanguage = keyof typeof resources;

export const supportedLanguages: SupportedLanguage[] = ["en", "es"];
