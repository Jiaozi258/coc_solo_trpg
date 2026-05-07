import gc
import chromadb
from chromadb.config import Settings as ChromaSettings
from app.config import get_settings
from app.services.pdf_parser import PDFParser

import os
os.environ["CHROMA_TELEMETRY_IMPL"] = "none"
os.environ["ANONYMIZED_TELEMETRY"] = "False"

settings = get_settings()

# Max chunks to embed in a single ChromaDB call to prevent OOM
EMBED_BATCH_SIZE = 10
# Max total chunks per module to prevent runaway memory use
MAX_CHUNKS_PER_MODULE = 200


class RAGService:
    def __init__(self):
        self.client = chromadb.PersistentClient(
            path=settings.chroma_persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )

    def get_or_create_collection(self, module_id: str):
        name = f"module_{module_id}"
        try:
            return self.client.get_collection(name)
        except Exception:
            return self.client.create_collection(name)

    def index_module(self, module_id: str, text: str) -> int:
        """Chunk and embed module text in batches. Returns total chunk count."""
        try:
            chunks = PDFParser.chunk_text(text, chunk_size=400, overlap=80)
        except MemoryError:
            # If even chunking runs out of memory, truncate text
            half = len(text) // 2
            chunks = PDFParser.chunk_text(text[:half], chunk_size=400, overlap=80)

        if not chunks:
            return 0

        # Cap total chunks to prevent memory explosion
        if len(chunks) > MAX_CHUNKS_PER_MODULE:
            chunks = chunks[:MAX_CHUNKS_PER_MODULE]

        collection = self.get_or_create_collection(module_id)

        # Clear existing chunks for this module
        try:
            existing = collection.get()
            if existing and existing.get("ids"):
                collection.delete(ids=existing["ids"])
        except Exception:
            pass

        # Embed in small batches to avoid OOM
        total_indexed = 0
        for batch_start in range(0, len(chunks), EMBED_BATCH_SIZE):
            batch = chunks[batch_start:batch_start + EMBED_BATCH_SIZE]
            ids = [f"{module_id}_chunk_{c['index']}" for c in batch]
            documents = [c["content"] for c in batch]
            metadatas = [{"chunk_index": c["index"], "module_id": module_id} for c in batch]

            try:
                collection.add(ids=ids, documents=documents, metadatas=metadatas)
                total_indexed += len(batch)
            except MemoryError:
                break
            except Exception:
                break

            gc.collect()

        return total_indexed

    def retrieve(self, module_id: str, query: str, n_results: int = 5) -> list[str]:
        try:
            collection = self.get_or_create_collection(module_id)
            results = collection.query(query_texts=[query], n_results=min(n_results, 5))
            docs = results.get("documents", [[]])[0]
            return [d for d in docs if d]
        except Exception:
            return []

    def delete_module(self, module_id: str):
        try:
            self.client.delete_collection(f"module_{module_id}")
        except Exception:
            pass
        gc.collect()

    def get_module_context(self, module_id: str, query: str, max_chunks: int = 5) -> str:
        chunks = self.retrieve(module_id, query, min(max_chunks, 3))
        if not chunks:
            return ""
        return "【模组背景资料】\n" + "\n---\n".join(chunks)


rag_service = RAGService()
