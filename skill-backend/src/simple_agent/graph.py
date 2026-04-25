"""Minimal LangChain agent graph for deployment."""

from __future__ import annotations

import ast
import os
from datetime import datetime, timezone
from typing import Any

from langchain.agents import create_agent
from langchain_core.tools import tool

DEFAULT_MODEL = os.getenv("SKILL_AGENT_MODEL", "openai:gpt-4o")


@tool
def search_for_skill(query: str) -> str:
    """Search for a skill in the database."""
    return "Skill found"


from pydantic import BaseModel

class Skill(BaseModel):
    skill_id: str
    skill_name: str
    user_quote: str
    
@tool
def save_skill(skill: Skill) -> str:
    """Save a skill to the database."""
    return "Skill saved"



graph = create_agent(
    model=DEFAULT_MODEL,
    tools=[search_for_skill, save_skill],
    system_prompt=(
        "You are a concise assistant. "
        "Use tools when they add factual precision, then return a direct answer."
    ),
    name="simple_agent",
)
