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
        importedFromBookWyrm: "Imported From BookWyrm",
        recentlyAdded: "Recently Added",
        bookTokUpdated: "BookTok updated",
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
        lastUpdated: "Last updated"
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
        avatar: "avatar",
        bio: "Bio",
        noBio: "No bio provided on this account yet.",
        featuredHashtags: "Featured hashtags",
        noFeaturedHashtags: "No hashtags detected from recent now-reading posts.",
        recentReadingMentions: "Recent reading mentions",
        openRemoteProfile: "Open remote profile",
        loadingProfile: "Loading profile...",
        followers: "followers",
        following: "following",
        posts: "posts"
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
        users: "users",
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
        openOnOpenLibrary: "Open on OpenLibrary"
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
        english: "Ingles",
        spanish: "Espanol"
      },
      home: {
        memberAccessTitle: "Acceso de miembro",
        memberAccessDescription: "Inicia sesion o crea una cuenta para sincronizar tu actividad de lectura.",
        memberSignIn: "Iniciar sesion",
        becomeMember: "Hazte miembro",
        noNowReading: "No hay publicaciones #NowReading en este momento.",
        importedFromBookWyrm: "Importado desde BookWyrm",
        recentlyAdded: "Recien agregado",
        bookTokUpdated: "BookTok actualizado",
        bookTokFallback: "Mostrando selecciones curadas de BookTok mientras se inicia la sincronizacion en vivo."
      },
      search: {
        placeholder: "Busca libros, autores, ISBN y temas...",
        ariaLabel: "Buscar en la biblioteca",
        facetsLabel: "Facetas de busqueda",
        suggestionsLabel: "Sugerencias de busqueda",
        importPlaceholder: "https://bookwyrm.social/book/...",
        importAriaLabel: "URL de edicion de BookWyrm",
        importing: "Importando...",
        importEdition: "Importar edicion",
        smartSearchDescription: "La busqueda inteligente combina tu biblioteca con conversaciones federadas sobre lectura y escritura.",
        fediverseDiscovery: "Descubrimiento en Fediverso",
        noFederatedResultsTitle: "Sin resultados federados",
        noFederatedResultsDescription: "Prueba otra frase, hashtag, autor o titulo.",
        noResultsTitle: "Sin resultados",
        noResultsDescription: "Prueba otro titulo, autor, ISBN o tema.",
        importedEditions: "Ediciones importadas",
        noImportedBooksTitle: "Todavia no hay libros importados",
        noImportedBooksDescription: "Las ediciones de BookWyrm que importes apareceran aqui.",
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
        whyThisResult: "Por que este resultado?"
      },
      shelves: {
        signInTitle: "Inicia sesion para cargar estanterias",
        signInDescription: "Tus estanterias de Mastodon y BookWyrm apareceran aqui.",
        bookmarks: "Marcadores",
        favourites: "Favoritos",
        lists: "Listas",
        noBookmarks: "Aun no hay marcadores.",
        noFavourites: "Aun no hay favoritos.",
        removeBookmark: "Quitar marcador",
        unfavourite: "Quitar favorito",
        errorUnauthenticated: "Tu sesion expiro. Inicia sesion de nuevo para cargar estanterias.",
        errorNetwork: "No se pudieron cargar las estanterias ahora."
      },
      activity: {
        signInTitle: "Inicia sesion para cargar actividad",
        signInDescription: "Tu timeline, notificaciones y actualizaciones de lectura apareceran aqui.",
        composePrompt: "Que estas leyendo?",
        enablePostingTitle: "Habilitar publicaciones",
        enablePostingDescription: "Tu sesion actual no incluye permisos de escritura. Cierra sesion y vuelve a entrar para publicar.",
        notifications: "Notificaciones",
        noNotifications: "Aun no hay notificaciones.",
        homeTimeline: "Timeline principal",
        noTimelinePosts: "Aun no hay publicaciones en el timeline.",
        lastUpdated: "Ultima actualizacion"
      },
      settings: {
        back: "< Ajustes",
        intelligence: {
          title: "Inteligencia",
          description: "Controla la busqueda semantica local, el ranking avanzado y la comprension asistida por IA."
        },
        account: {
          title: "Cuenta"
        },
        privacy: {
          title: "Privacidad"
        },
        rows: {
          intelligence: "Calidad de busqueda, modelos semanticos, rerankers y comprension asistida por IA.",
          account: "Administra tu cuenta conectada de Mastodon o BookWyrm.",
          privacy: "Los controles de datos locales, cache y descarga de modelos estaran aqui."
        }
      },
      shared: {
        openPost: "Abrir publicacion",
        readingPost: "Publicacion de lectura",
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
        postReadingUpdate: "Publicar actualizacion de lectura",
        switchAccount: "Cambiar cuenta",
        signOut: "Cerrar sesion",
        signingOut: "Cerrando sesion...",
        pinnedPosts: "Publicaciones fijadas",
        profile: "perfil",
        avatar: "avatar",
        bio: "Biografia",
        noBio: "Esta cuenta aun no tiene biografia.",
        featuredHashtags: "Hashtags destacados",
        noFeaturedHashtags: "No se detectaron hashtags en publicaciones recientes de lectura.",
        recentReadingMentions: "Menciones recientes de lectura",
        openRemoteProfile: "Abrir perfil remoto",
        loadingProfile: "Cargando perfil...",
        followers: "seguidores",
        following: "siguiendo",
        posts: "publicaciones"
      },
      auth: {
        introTitle: "Usa el servidor que ya conoces, o elige uno y vuelve cuando tu cuenta este lista.",
        introDescription: "RYU mantiene separados el inicio de sesion y el descubrimiento de servidores para que puedas avanzar por cualquiera de los dos caminos.",
        signInTitle: "Iniciar sesion",
        signInDescription: "Ingresa tu servidor y continua mediante OAuth seguro.",
        instancePlaceholder: "bookwyrm.social",
        instanceAriaLabel: "Instancia de BookWyrm o Mastodon",
        signInWithServer: "Iniciar sesion con este servidor",
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
        lastRefreshed: "Ultima actualizacion",
        backendExchangeTitle: "Se requiere intercambio en backend",
        backendExchangeDescription: "Mastodon aprovisiona clientes confidenciales, por lo que el intercambio de tokens debe ejecutarse en un endpoint de backend y nunca en codigo solo del navegador.",
        instancePicker: "Selector de instancias",
        findServerTitle: "Buscar un servidor",
        findServerDescription: "Abre un servidor para crear una cuenta, o usalo de inmediato si ya tienes una.",
        searchInstancesPlaceholder: "Buscar dominio, software o pais",
        searchInstancesAriaLabel: "Buscar instancias",
        preferredSoftware: "Software preferido",
        preferBookWyrm: "Preferir BookWyrm",
        preferMastodon: "Preferir Mastodon",
        noPreference: "Sin preferencia",
        preferredCountry: "Pais preferido",
        anyCountry: "Cualquier pais",
        users: "usuarios",
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
        pages: "Paginas",
        published: "Publicado",
        language: "Idioma",
        editions: "Ediciones",
        editionCount_one: "{{count}} edicion",
        editionCount_other: "{{count}} ediciones",
        about: "Acerca de",
        openOnOpenLibrary: "Abrir en OpenLibrary"
      }
    }
  }
} as const;

export type SupportedLanguage = keyof typeof resources;

export const supportedLanguages: SupportedLanguage[] = ["en", "es"];
