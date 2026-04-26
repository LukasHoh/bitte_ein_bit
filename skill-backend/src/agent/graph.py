"""Minimal LangChain agent graph for deployment."""

from __future__ import annotations

import logging
import os
from typing import Literal
from langchain.agents import create_agent
from langchain_core.tools import tool
from skills.skills import (
    DEFAULT_PINECONE_NAMESPACE, 
    skills_vector_store,
    get_skill_by_id,
    get_similar_skills
)

DEFAULT_MODEL = os.getenv("SKILL_AGENT_MODEL", "openai:gpt-5.4-mini")

@tool
def search_for_skill(query: str) -> str:
    """Search for a skill in the database."""
    results = get_similar_skills(query, k=10)
    return results

@tool
def save_skill(
    skill_id: str,
    user_quote: str,
    level: Literal["low", "medium", "high"]
) -> str:
    """Save a skill to the database."""
    result = get_skill_by_id(skill_id)
    if result:
        skills.append(result)
        return "Skill saved"
    else:
        return "Skill not found"


graph = create_agent(
    model=DEFAULT_MODEL,
    tools=[search_for_skill, save_skill],
    system_prompt=(
        "You are a skill discovery interviewer. "
        "Your goal is to learn what skills the user has from the conversation. "
        "Only skills of The ESCO Classification (Skills & competences) are valid and can be saved. "
        "Only skills that exist in the vector database are valid and can be saved. "
        "When the user mentions an interesting capability, experience, tool, or activity, call search_for_skill to find matching skill classes. "
        "Pick the best matching skill_id from the search results and call save_skill(skill_id, user_quote) using a short direct quote from the user as evidence. "
        "Never invent skill IDs and never save a skill before searching. "
        "If no good match is found, ask a clarifying follow-up question and search again. "
        "After each saved skill, ask another focused follow-up question to uncover more possible skills. "
        "Keep responses concise, curious, and conversational."
    ),
    name="simple_agent",
)
