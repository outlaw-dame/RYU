export const reviewerTrustResources = {
  en: {
    translation: {
      reviewTrust: {
        menuAria: "Change how this verified reviewer affects recommendations",
        menuLabel: "Reviewer recommendation influence",
        current: "Reviewer: {{state}}",
        saving: "Saving…",
        saveError: "Could not save this reviewer preference. Try again.",
        states: {
          trusted: "Prioritize reviews",
          neutral: "Use normally",
          low_trust: "Show less influence",
          muted: "Hide reviewed recommendations",
          blocked: "Block reviewed recommendations"
        },
        descriptions: {
          trusted: "Reviews from this verified account may slightly improve ranking within a strict cap.",
          neutral: "This verified account has no special effect on recommendation ranking.",
          low_trust: "Reviews from this verified account may slightly reduce ranking within a strict cap.",
          muted: "Recommendations attributed to this verified reviewer are hidden from normal results.",
          blocked: "Recommendations attributed to this verified reviewer are excluded from normal results."
        }
      }
    }
  },
  es: {
    translation: {
      reviewTrust: {
        menuAria: "Cambiar cómo este crítico verificado afecta las recomendaciones",
        menuLabel: "Influencia del crítico en las recomendaciones",
        current: "Crítico: {{state}}",
        saving: "Guardando…",
        saveError: "No se pudo guardar esta preferencia del crítico. Inténtalo de nuevo.",
        states: {
          trusted: "Priorizar reseñas",
          neutral: "Usar normalmente",
          low_trust: "Reducir influencia",
          muted: "Ocultar recomendaciones reseñadas",
          blocked: "Bloquear recomendaciones reseñadas"
        },
        descriptions: {
          trusted: "Las reseñas de esta cuenta verificada pueden mejorar ligeramente la clasificación dentro de un límite estricto.",
          neutral: "Esta cuenta verificada no tiene un efecto especial en la clasificación de recomendaciones.",
          low_trust: "Las reseñas de esta cuenta verificada pueden reducir ligeramente la clasificación dentro de un límite estricto.",
          muted: "Las recomendaciones atribuidas a este crítico verificado se ocultan de los resultados normales.",
          blocked: "Las recomendaciones atribuidas a este crítico verificado se excluyen de los resultados normales."
        }
      }
    }
  }
} as const;
