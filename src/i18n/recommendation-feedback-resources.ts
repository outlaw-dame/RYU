export const recommendationFeedbackResources = {
  en: {
    translation: {
      discovery: {
        feedback: {
          tuneAria: "Tune this recommendation",
          tune: "Tune",
          saving: "Saving…",
          menuLabel: "Recommendation preferences",
          show_more: "Show more like this",
          show_moreDescription: "Increase the influence of this author or edition in future recommendations.",
          show_less: "Show less like this",
          show_lessDescription: "Reduce the influence of this author or edition without hiding it completely.",
          not_interested: "Not interested",
          not_interestedDescription: "Hide this recommendation and avoid suggesting this entity in normal discovery.",
          suppress: "Never recommend this",
          suppressDescription: "Exclude this entity from normal recommendation results until the preference is reset.",
          neutral: "Reset preference",
          neutralDescription: "Remove explicit recommendation feedback for this entity.",
          signInError: "Sign in to save this recommendation preference.",
          saveError: "Could not save this preference. Try again.",
          restoreHidden: "Restore hidden",
          restoringHidden: "Restoring…",
          restoreHiddenAria: "Restore hidden recommendations",
          resetHiddenError: "Could not restore hidden recommendations. Try again."
        }
      }
    }
  },
  es: {
    translation: {
      discovery: {
        feedback: {
          tuneAria: "Ajustar esta recomendación",
          tune: "Ajustar",
          saving: "Guardando…",
          menuLabel: "Preferencias de recomendaciones",
          show_more: "Mostrar más como esto",
          show_moreDescription: "Aumenta la influencia de este autor o edición en recomendaciones futuras.",
          show_less: "Mostrar menos como esto",
          show_lessDescription: "Reduce la influencia de este autor o edición sin ocultarlo por completo.",
          not_interested: "No me interesa",
          not_interestedDescription: "Oculta esta recomendación y evita sugerir esta entidad en el descubrimiento normal.",
          suppress: "No recomendar nunca",
          suppressDescription: "Excluye esta entidad de las recomendaciones normales hasta que restablezcas la preferencia.",
          neutral: "Restablecer preferencia",
          neutralDescription: "Elimina los comentarios explícitos sobre esta entidad.",
          signInError: "Inicia sesión para guardar esta preferencia de recomendación.",
          saveError: "No se pudo guardar esta preferencia. Inténtalo de nuevo.",
          restoreHidden: "Restaurar ocultos",
          restoringHidden: "Restaurando…",
          restoreHiddenAria: "Restaurar recomendaciones ocultas",
          resetHiddenError: "No se pudieron restaurar las recomendaciones ocultas. Inténtalo de nuevo."
        }
      }
    }
  }
} as const;
