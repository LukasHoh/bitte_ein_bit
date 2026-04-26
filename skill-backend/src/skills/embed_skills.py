from __future__ import annotations

import csv
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from langchain_pinecone import PineconeVectorStore


PREFERRED_TEXT_COLUMNS = (
    "skill",
    "name",
    "title",
    "label",
    "description",
    "summary",
)


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _load_rows(csv_path: Path) -> list[dict[str, str]]:
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = [row for row in reader if row]

    if not rows:
        raise ValueError(f"No rows found in CSV file: {csv_path}")
    return rows


def _pick_text(row: dict[str, str]) -> str:
    for key in PREFERRED_TEXT_COLUMNS:
        value = row.get(key)
        if value and value.strip():
            return value.strip()

    non_empty_values = [v.strip() for v in row.values() if v and v.strip()]
    if not non_empty_values:
        raise ValueError("Row has no non-empty values to embed.")
    return " | ".join(non_empty_values)


def _id_for_row(row: dict[str, str], fallback_index: int) -> str:
    for key in ("id", "skill_id", "uuid", "code", "name", "title"):
        value = row.get(key)
        if value and value.strip():
            normalized = value.strip().replace(" ", "_")
            return f"skill_{normalized}"
    return f"skill_{fallback_index}"


def _clean_metadata(row: dict[str, str]) -> dict[str, Any]:
    # Pinecone metadata values should be primitives and not None.
    metadata: dict[str, Any] = {}
    for key, value in row.items():
        if value is None:
            continue
        trimmed = value.strip()
        if trimmed:
            metadata[key] = trimmed
    return metadata


def _chunks[T](items: list[T], size: int) -> list[list[T]]:
    if size <= 0:
        raise ValueError("Chunk size must be greater than 0.")
    return [items[index : index + size] for index in range(0, len(items), size)]


def embed_csv_to_pinecone() -> None:
    load_dotenv()

    openai_api_key = _require_env("OPENAI_API_KEY")
    pinecone_api_key = _require_env("PINECONE_API_KEY")
    pinecone_index_name = _require_env("PINECONE_INDEX_NAME")
    pinecone_index_dimensions = _require_env("PINECONE_INDEX_DIMENSIONS")

    csv_path = Path(os.getenv("SKILLS_CSV_PATH", "src/skills/skills_en.csv"))
    namespace = os.getenv("PINECONE_NAMESPACE", "skills-en")
    embedding_model = os.getenv("EMBEDDING_MODEL", "text-embedding-3-large")
    embedding_dimensions = os.getenv("EMBEDDING_DIMENSIONS")
    batch_size = int(os.getenv("UPSERT_BATCH_SIZE", "100"))

    rows = _load_rows(csv_path)
    texts = [_pick_text(row) for row in rows]

    embeddings_kwargs: dict[str, Any] = {
        "model": embedding_model, 
        "api_key": openai_api_key,  
    }
    if embedding_dimensions:
        embeddings_kwargs["dimensions"] = int(embedding_dimensions)
    elif pinecone_index_dimensions:
        embeddings_kwargs["dimensions"] = int(pinecone_index_dimensions)
    else:
        raise ValueError("Either EMBEDDING_DIMENSIONS or PINECONE_INDEX_DIMENSIONS must be set.")
    embeddings_client = OpenAIEmbeddings(**embeddings_kwargs)
    vector_store = PineconeVectorStore(
        index_name=pinecone_index_name,
        embedding=embeddings_client,
        pinecone_api_key=pinecone_api_key,
        namespace=namespace,
    )

    total = len(rows)
    print(f"Loaded {total} rows from {csv_path}.")
    print(
        f"Embedding with model={embedding_model} and upserting into "
        f"index={pinecone_index_name} namespace={namespace}."
    )

    row_batches = _chunks(rows, batch_size)
    text_batches = _chunks(texts, batch_size)
    processed = 0

    for batch_number, (row_batch, text_batch) in enumerate(
        zip(row_batches, text_batches, strict=True),
        start=1,
    ):
        ids = []
        metadatas = []
        for index_in_batch, row in enumerate(row_batch):
            global_index = processed + index_in_batch
            vector_id = _id_for_row(row, fallback_index=global_index)
            metadata = _clean_metadata(row)
            metadata["embedding_text"] = text_batch[index_in_batch]
            ids.append(vector_id)
            metadatas.append(metadata)

        vector_store.add_texts(texts=text_batch, metadatas=metadatas, ids=ids)
        processed += len(ids)
        print(f"Batch {batch_number}: upserted {len(ids)} vectors ({processed}/{total}).")

    print("Done.")


if __name__ == "__main__":
    embed_csv_to_pinecone()
