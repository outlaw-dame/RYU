import { motion } from "framer-motion";

type Book = { id: string; title: string; author?: string; coverUrl?: string | null };

export function CoverGrid({ books, onBookPress }: { books: Book[]; onBookPress?: (book: Book) => void }) {
  return (
    <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }} style={{
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: "var(--space-3)",
      padding: "0 var(--space-4)"
    }}>
      {books.map((book) => (
        <motion.button key={book.id} variants={{ hidden: { opacity: 0, y: 8, scale: 0.96 }, show: { opacity: 1, y: 0, scale: 1 } }} whileTap={{ scale: 0.96 }} type="button" onClick={() => onBookPress?.(book)} style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          padding: 0,
          border: 0,
          background: "transparent",
          textAlign: "left",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent"
        }}>
          <div style={{ aspectRatio: "2 / 3", borderRadius: "var(--radius-cover)", overflow: "hidden", background: "var(--color-bg-secondary)", boxShadow: "var(--shadow-cover)" }}>
            {book.coverUrl ? <img src={book.coverUrl} alt={`Cover of ${book.title}`} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
          </div>
          <div>
            <div style={{ fontSize: "var(--text-footnote)", lineHeight: "var(--leading-footnote)", letterSpacing: "var(--tracking-footnote)", color: "var(--color-text)", fontWeight: 600, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{book.title}</div>
            {book.author ? <div style={{ marginTop: 2, fontSize: "var(--text-caption2)", lineHeight: "var(--leading-caption2)", color: "var(--color-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{book.author}</div> : null}
          </div>
        </motion.button>
      ))}
    </motion.div>
  );
}
