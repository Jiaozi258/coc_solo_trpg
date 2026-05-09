import gc
import os
import re
import json
from pathlib import Path
from app.config import get_settings

os.environ["CHROMA_TELEMETRY_IMPL"] = "none"
os.environ["ANONYMIZED_TELEMETRY"] = "False"

settings = get_settings()

MAX_CHUNKS_PER_MODULE = 200


def _get_embedding_function():
    """Return OpenAI embedding function if API key is available, else None.

    When None, we skip ChromaDB entirely and use lightweight keyword search,
    avoiding both the local ONNX model AND ChromaDB's heavy import chain
    (onnxruntime, tokenizers, huggingface-hub, grpcio) that can cause OOM.
    """
    if settings.openai_api_key and settings.openai_api_key.startswith("sk-"):
        try:
            from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
            return OpenAIEmbeddingFunction(
                api_key=settings.openai_api_key,
                model_name=settings.embedding_model,
            )
        except Exception:
            pass
    return None


def _chunk_text(text: str, chunk_size: int = 400, overlap: int = 80) -> list[dict]:
    """Split text into overlapping chunks. Handles both CJK and whitespace-separated text."""
    if not text or not text.strip():
        return []

    # For CJK-heavy text, split by characters; for English, split by words
    cjk_count = sum(1 for c in text if '一' <= c <= '鿿' or '㐀' <= c <= '䶿')
    if cjk_count > len(text) * 0.3:  # >30% CJK characters — use character-level chunking
        chunks = []
        idx = 0
        pos = 0
        text_len = len(text)
        while pos < text_len:
            end = min(pos + chunk_size, text_len)
            chunks.append({"index": idx, "content": text[pos:end]})
            idx += 1
            if end >= text_len:
                break
            pos = end - overlap
            if pos >= text_len - 1:  # prevent infinite loop when near the end
                if end < text_len:
                    chunks.append({"index": idx, "content": text[pos:]})
                break
        return chunks

    words = text.split()
    if not words:
        return []
    chunks = []
    idx = 0
    pos = 0
    total = len(words)
    while pos < total:
        end = min(pos + chunk_size, total)
        chunks.append({"index": idx, "content": " ".join(words[pos:end])})
        idx += 1
        if end >= total:
            break
        pos = end - overlap
        if pos >= total - 1:  # prevent infinite loop near the end
            if end < total:
                chunks.append({"index": idx, "content": " ".join(words[pos:])})
            break
    return chunks


def _keyword_match(query: str, document: str) -> int:
    """Score a document against a query by word overlap."""
    query_words = set(re.findall(r"\w+", query.lower()))
    doc_words = set(re.findall(r"\w+", document.lower()))
    return len(query_words & doc_words)


class RAGService:
    def __init__(self):
        self._embedding_fn = _get_embedding_function()
        self._use_chroma = self._embedding_fn is not None
        self._client = None  # Lazy chromadb client

    @property
    def chroma_client(self):
        """Lazy-load ChromaDB only when vector search is actually needed."""
        if self._client is None and self._use_chroma:
            import chromadb
            from chromadb.config import Settings as ChromaSettings
            self._client = chromadb.PersistentClient(
                path=settings.chroma_persist_dir,
                settings=ChromaSettings(anonymized_telemetry=False),
            )
        return self._client

    @property
    def chunks_dir(self) -> Path:
        """Directory for lightweight keyword-search chunk storage."""
        p = Path(settings.upload_dir) / "_chunks"
        p.mkdir(parents=True, exist_ok=True)
        return p

    def index_module(self, module_id: str, text: str) -> int:
        """Chunk and index module text.

        When OpenAI API key is configured: uses ChromaDB with API embeddings.
        Otherwise: stores chunks as JSON files for keyword search (no local model,
        no heavy imports).
        """
        try:
            chunks = _chunk_text(text, chunk_size=400, overlap=80)
        except MemoryError:
            half = len(text) // 2
            chunks = _chunk_text(text[:half], chunk_size=400, overlap=80)

        if not chunks:
            return 0

        if len(chunks) > MAX_CHUNKS_PER_MODULE:
            chunks = chunks[:MAX_CHUNKS_PER_MODULE]

        if self._use_chroma:
            return self._index_chroma(module_id, chunks)
        else:
            return self._index_keywords(module_id, chunks)

    def _index_chroma(self, module_id: str, chunks: list[dict]) -> int:
        """Index chunks into ChromaDB with API-based embeddings."""
        collection = self._chroma_collection(module_id)

        # Clear existing chunks
        try:
            existing = collection.get()
            if existing and existing.get("ids"):
                collection.delete(ids=existing["ids"])
        except Exception:
            pass

        batch_size = 20
        total = 0
        for batch_start in range(0, len(chunks), batch_size):
            batch = chunks[batch_start:batch_start + batch_size]
            ids = [f"{module_id}_chunk_{c['index']}" for c in batch]
            documents = [c["content"] for c in batch]
            metadatas = [{"chunk_index": c["index"], "module_id": module_id} for c in batch]

            try:
                collection.add(ids=ids, documents=documents, metadatas=metadatas)
                total += len(batch)
            except Exception:
                break

            gc.collect()

        return total

    def _chroma_collection(self, module_id: str):
        """Get or create a ChromaDB collection for the given module."""
        name = f"module_{module_id}"
        try:
            return self.chroma_client.get_collection(
                name=name, embedding_function=self._embedding_fn,
            )
        except Exception:
            try:
                self.chroma_client.delete_collection(name)
            except Exception:
                pass
            return self.chroma_client.create_collection(
                name=name, embedding_function=self._embedding_fn,
            )

    def _index_keywords(self, module_id: str, chunks: list[dict]) -> int:
        """Store chunks as a JSON file for lightweight keyword search.

        No ChromaDB, no ONNX, no embedding model — just disk storage.
        Total memory: ~500KB per module for 200 chunks.
        """
        chunk_data = [
            {"index": c["index"], "content": c["content"]}
            for c in chunks
        ]
        file_path = self.chunks_dir / f"{module_id}.json"
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(chunk_data, f, ensure_ascii=False)
        return len(chunks)

    def retrieve(self, module_id: str, query: str, n_results: int = 5) -> list[str]:
        """Retrieve relevant chunks for a query."""
        if self._use_chroma:
            return self._retrieve_chroma(module_id, query, n_results)
        else:
            return self._retrieve_keywords(module_id, query, n_results)

    def _retrieve_chroma(self, module_id: str, query: str, n_results: int) -> list[str]:
        try:
            collection = self._chroma_collection(module_id)
            results = collection.query(query_texts=[query], n_results=min(n_results, 5))
            docs = results.get("documents", [[]])[0]
            return [d for d in docs if d]
        except Exception:
            return []

    def _retrieve_keywords(self, module_id: str, query: str, n_results: int) -> list[str]:
        """Keyword-based retrieval from JSON chunk files. No ChromaDB involved."""
        file_path = self.chunks_dir / f"{module_id}.json"
        if not file_path.exists():
            return []

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                chunks = json.load(f)
        except (json.JSONDecodeError, OSError):
            return []

        scored = []
        for c in chunks:
            score = _keyword_match(query, c["content"])
            if score > 0:
                scored.append((score, c["content"]))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [doc for _, doc in scored[:n_results]]

    def delete_module(self, module_id: str):
        # Delete keyword chunks file
        file_path = self.chunks_dir / f"{module_id}.json"
        try:
            file_path.unlink(missing_ok=True)
        except Exception:
            pass

        # Delete ChromaDB collection if using Chroma
        if self._use_chroma and self._client:
            try:
                self._client.delete_collection(f"module_{module_id}")
            except Exception:
                pass

        gc.collect()

    def get_module_context(self, module_id: str, query: str, max_chunks: int = 5) -> str:
        chunks = self.retrieve(module_id, query, min(max_chunks, 3))
        if not chunks:
            return ""
        return "【模组背景资料】\n" + "\n---\n".join(chunks)


rag_service = RAGService()
