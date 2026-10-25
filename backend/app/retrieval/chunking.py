def chunk_text(text: str, *, max_chars: int = 800, overlap: int = 100) -> list[str]:
    """Simple deterministic fixed-size chunker, splitting on paragraph
    boundaries where possible before falling back to a hard character cut.
    Deterministic so re-running the seed/embedding-rebuild scripts produces
    the same chunk boundaries.
    """
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) + 2 <= max_chars:
            current = f"{current}\n\n{para}" if current else para
        else:
            if current:
                chunks.append(current)
            if len(para) <= max_chars:
                current = para
            else:
                start = 0
                while start < len(para):
                    chunks.append(para[start : start + max_chars])
                    start += max_chars - overlap
                current = ""
    if current:
        chunks.append(current)
    return chunks or [text]
