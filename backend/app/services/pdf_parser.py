from io import BytesIO
from PyPDF2 import PdfReader


class PDFParser:
    @staticmethod
    def extract_text(file_path: str) -> str:
        text_parts = []
        with open(file_path, "rb") as f:
            reader = PdfReader(f)
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        return "\n\n".join(text_parts)

    @staticmethod
    def extract_text_from_bytes(content: bytes) -> str:
        reader = PdfReader(BytesIO(content))
        text_parts = []
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
        return "\n\n".join(text_parts)

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list[dict]:
        words = text.split()
        chunks = []
        idx = 0
        start = 0
        while start < len(words):
            end = min(start + chunk_size, len(words))
            chunk_text = " ".join(words[start:end])
            chunks.append({
                "index": idx,
                "content": chunk_text,
                "start": start,
                "end": end,
            })
            idx += 1
            start = end - overlap
        return chunks
