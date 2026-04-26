import logging
from fastapi import FastAPI
from fastapi import HTTPException

from skills.skills import get_all_skills as list_all_skills
from skills.skills import get_skill_by_id

app = FastAPI()

@app.get("/hello")
def read_root():
    return {"Hello": "World"}

@app.get("/skills/selected")
def skills_selected():
