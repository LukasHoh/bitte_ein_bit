"""Shared vector store initialization for skills."""

from __future__ import annotations

import logging
import os
from typing import Any

from langchain_openai import OpenAIEmbeddings
from langchain_pinecone import PineconeVectorStore

DEFAULT_EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-large")
DEFAULT_PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "skills-en")
DEFAULT_PINECONE_INDEX_DIMENSIONS = os.getenv("PINECONE_INDEX_DIMENSIONS", "3072")
DEFAULT_PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
DEFAULT_PINECONE_NAMESPACE = os.getenv("PINECONE_NAMESPACE", "skills-en")
DEFAULT_OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


def create_embeddings_client() -> OpenAIEmbeddings:
    """Create the OpenAI embeddings client from environment configuration."""
    kwargs: dict[str, Any] = {"model": DEFAULT_EMBEDDING_MODEL}
    if DEFAULT_OPENAI_API_KEY:
        kwargs["api_key"] = DEFAULT_OPENAI_API_KEY

    if DEFAULT_PINECONE_INDEX_DIMENSIONS:
        kwargs["dimensions"] = int(DEFAULT_PINECONE_INDEX_DIMENSIONS)

    return OpenAIEmbeddings(**kwargs)


def create_skills_vector_store() -> PineconeVectorStore:
    """Create the Pinecone vector store for skills."""
    return PineconeVectorStore(
        index_name=DEFAULT_PINECONE_INDEX_NAME,
        embedding=create_embeddings_client(),
        pinecone_api_key=DEFAULT_PINECONE_API_KEY,
        namespace=DEFAULT_PINECONE_NAMESPACE,
    )

def get_skill_by_id(skill_id: str) -> str:
    """Get a skill from the database using its vector skill_id."""
    normalized_skill_id = skill_id.strip()
    if not normalized_skill_id:
        return "skill_id is required."

    try:
        index = getattr(skills_vector_store, "index", None) or getattr(skills_vector_store, "_index", None)
        if index is None:
            return "Pinecone index client is not available."

        fetch_response = index.fetch(
            ids=[normalized_skill_id],
            namespace=DEFAULT_PINECONE_NAMESPACE,
        )
        vectors = (
            fetch_response.get("vectors", {})
            if isinstance(fetch_response, dict)
            else getattr(fetch_response, "vectors", {}) or {}
        )
        vector_data = vectors.get(normalized_skill_id) if isinstance(vectors, dict) else None

        if not vector_data:
            return f"No skill found for skill_id '{normalized_skill_id}'."

        metadata = (
            vector_data.get("metadata", {})
            if isinstance(vector_data, dict)
            else getattr(vector_data, "metadata", {}) or {}
        )
        skill_label = (
            metadata.get("skill")
            or metadata.get("name")
            or metadata.get("title")
            or metadata.get("label")
            or "Unknown"
        )
        embedding_text = metadata.get("embedding_text", "")
        return (
            f"skill_id: {normalized_skill_id}\n"
            f"skill_label: {skill_label}\n"
            f"embedding_text: {embedding_text}\n"
            f"metadata: {metadata}"
        )
    except Exception as exc:
        logging.exception("Failed to fetch skill by id: %s", normalized_skill_id)
        return f"Failed to fetch skill '{normalized_skill_id}': {exc}"


def get_skill_document_by_id(skill_id: str) -> dict[str, Any] | None:
    """Get full Pinecone skill document by vector skill_id."""
    normalized_skill_id = skill_id.strip()
    if not normalized_skill_id:
        return None

    index = getattr(skills_vector_store, "index", None) or getattr(skills_vector_store, "_index", None)
    if index is None:
        return None

    fetch_response = index.fetch(
        ids=[normalized_skill_id],
        namespace=DEFAULT_PINECONE_NAMESPACE,
    )
    vectors = (
        fetch_response.get("vectors", {})
        if isinstance(fetch_response, dict)
        else getattr(fetch_response, "vectors", {}) or {}
    )
    if not isinstance(vectors, dict):
        return None

    vector_data = vectors.get(normalized_skill_id)
    if not vector_data:
        return None

    metadata = (
        vector_data.get("metadata", {})
        if isinstance(vector_data, dict)
        else getattr(vector_data, "metadata", {}) or {}
    )
    return {
        "skill_id": normalized_skill_id,
        "metadata": metadata if isinstance(metadata, dict) else {},
    }

def get_similar_skills(query: str, k: int):
    results = skills_vector_store.similarity_search(query, k=10)
    return results


def _extract_ids_from_list_page(page: Any) -> list[str]:
    """Extract vector ids from one Pinecone list page response."""
    if page is None:
        return []

    if isinstance(page, dict):
        if isinstance(page.get("ids"), list):
            return [str(item) for item in page["ids"]]
        vectors = page.get("vectors")
        if isinstance(vectors, list):
            ids: list[str] = []
            for vector in vectors:
                if isinstance(vector, dict) and vector.get("id"):
                    ids.append(str(vector["id"]))
                elif isinstance(vector, str):
                    ids.append(vector)
            return ids
        return []

    vectors = getattr(page, "vectors", None)
    if isinstance(vectors, list):
        ids = []
        for vector in vectors:
            vector_id = getattr(vector, "id", None)
            if vector_id:
                ids.append(str(vector_id))
        return ids

    return []


embeddings_client = create_embeddings_client()
skills_vector_store = create_skills_vector_store()
