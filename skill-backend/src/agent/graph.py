"""Minimal LangChain agent graph for deployment."""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Literal

from langchain.agents import create_agent
from langchain_core.tools import tool
from skills.skills import (
    get_skill_document_by_id,
    get_similar_skills,
)

DEFAULT_MODEL = os.getenv("SKILL_AGENT_MODEL", "openai:gpt-5.4-mini")
saved_skills: list[dict[str, Any]] = []
SkillLevel = Literal["low", "medium", "high"]


def _skill_label_from_metadata(metadata: dict[str, Any]) -> str:
    return (
        str(
            metadata.get("preferredLabel")
            or metadata.get("skill")
            or metadata.get("name")
            or metadata.get("title")
            or metadata.get("label")
            or "Unknown skill"
        )
        .strip()
    )


def _skill_summary_from_metadata(metadata: dict[str, Any]) -> str:
    raw_summary = (
        metadata.get("description")
        or metadata.get("definition")
        or metadata.get("summary")
        or metadata.get("embedding_text")
        or ""
    )
    summary = str(raw_summary).strip()
    return summary[:240]


@tool
def search_for_skill(query: str) -> str:
    """Search for a skill in the database."""
    try:
        results = get_similar_skills(query, k=10)
    except Exception as exc:
        logging.exception("Skill search failed for query=%s", query)
        return json.dumps(
            {
                "status": "error",
                "query": query,
                "message": f"Skill search failed: {exc}",
                "candidates": [],
            }
        )

    candidates: list[dict[str, Any]] = []
    for index, doc in enumerate(results, start=1):
        metadata = getattr(doc, "metadata", {}) or {}
        vector_id = str(getattr(doc, "id", "") or "").strip()
        skill_id = (
            vector_id
            or metadata.get("id")
            or metadata.get("skill_id")
            or metadata.get("code")
            or f"result_{index}"
        )
        candidate = {
            "rank": str(index),
            "skill_id": str(skill_id).strip(),
            "skill_label": _skill_label_from_metadata(metadata),
            "summary": _skill_summary_from_metadata(metadata),
            "concept_uri": str(metadata.get("conceptUri", "")).strip(),
            "full_metadata": metadata,
            "document_text": str(getattr(doc, "page_content", "")).strip(),
        }
        candidates.append(candidate)
        if index == 1:
            logging.info("Top Pinecone document sample: %s", json.dumps(candidate, default=str)[:2000])

    return json.dumps(
        {
            "status": "ok",
            "query": query,
            "candidates": candidates,
        }
    )


@tool
def save_skill(
    skill_id: str,
    user_quote: str,
    level: SkillLevel = "medium",
) -> str:
    """Save a skill to the database."""
    try:
        normalized_skill_id = skill_id.strip()
        if not normalized_skill_id:
            return json.dumps({"status": "error", "message": "skill_id is required"})

        skill_doc = get_skill_document_by_id(normalized_skill_id)
        if not skill_doc:
            return json.dumps(
                {
                    "status": "error",
                    "message": "Skill not found",
                    "skill_id": normalized_skill_id,
                }
            )

        normalized_level: SkillLevel = level

        metadata = skill_doc.get("metadata", {}) if isinstance(skill_doc, dict) else {}
        metadata = metadata if isinstance(metadata, dict) else {}
        skill_label = _skill_label_from_metadata(metadata)
        summary = _skill_summary_from_metadata(metadata)

        selected_skill = {
            "skill_id": normalized_skill_id,
            "skill_label": skill_label,
            "summary": summary,
            "description": str(metadata.get("description") or metadata.get("definition") or "").strip(),
            "concept_uri": str(metadata.get("conceptUri") or "").strip(),
            "full_metadata": metadata,
            "level": normalized_level,
            "user_quote": user_quote.strip(),
        }
        saved_skills.append(selected_skill)
        return json.dumps({"status": "saved", "selected_skill": selected_skill})
    except Exception as exc:
        logging.exception("Failed to save skill_id=%s", skill_id)
        return json.dumps(
            {"status": "error", "message": f"Failed to save skill: {exc}", "skill_id": skill_id}
        )


@tool
def list_saved_skills() -> str:
    """List skills saved in this session."""
    if not saved_skills:
        return "No saved skills yet."

    lines = [
        f"{index}. skill_id={item['skill_id']} level={item['level']} quote={item['user_quote']}"
        for index, item in enumerate(saved_skills, start=1)
    ]
    return "\n".join(lines)


@tool
def clear_saved_skills() -> str:
    """Clear saved session skills."""
    saved_skills.clear()
    return "Saved skills cleared."


graph = create_agent(
    model=DEFAULT_MODEL,
    tools=[search_for_skill, save_skill, list_saved_skills, clear_saved_skills],
    system_prompt=(
        "You are a skill discovery interviewer. "
        "Your goal is to learn what skills the user has from the conversation. "
        "Only skills of The ESCO Classification (Skills & competences) are valid and can be saved. "
        "Only skills that exist in the vector database are valid and can be saved. "
        "When the user mentions an interesting capability, experience, tool, or activity, call search_for_skill to find matching skill classes. "
        "Pick the best matching skill_id from the search results and call save_skill(skill_id, user_quote, level) using a short direct quote from the user as evidence. "
        "For level, you must choose exactly one of: low, medium, high. "
        "Never invent skill IDs and never save a skill before searching. "
        "Ask at most one shallow follow-up question on the same topic. "
        "Do not ask deep or repetitive follow-up questions. "
        "After one follow-up, switch to a different topic or skill area. "
        "If no good match is found, ask one clarifying question and then move on. "
        "Keep responses concise, curious, and conversational."
    ),
    name="simple_agent",
)
