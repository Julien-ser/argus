from datetime import datetime
from typing import Optional
import uuid

from sqlmodel import Field, SQLModel


class Session(SQLModel, table=True):
    id: str = Field(primary_key=True)
    project_path: str = ""
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cost_usd: float = 0.0
    status: str = "active"  # active | completed | interrupted
    parent_session_id: Optional[str] = None
    trust_score: Optional[float] = None
    safety_score: Optional[float] = None
    behavior_score: Optional[float] = None
    economy_score: Optional[float] = None


class Event(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    session_id: str = Field(foreign_key="session.id", index=True)
    type: str  # tool_call | tool_result | subagent_spawn | compaction | error
    hook_event_name: Optional[str] = None   # PreToolUse | PostToolUse | Stop
    tool_name: Optional[str] = None
    tool_input: Optional[str] = None        # JSON string
    tool_output: Optional[str] = None       # JSON string
    # Derived from tool_input for specific tools
    agent_type: Optional[str] = None        # set when tool_name == "Agent"
    skill_name: Optional[str] = None        # set when tool_name == "Skill"
    command: Optional[str] = None           # first token when tool_name == "Bash"
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    duration_ms: int = 0
    flagged: bool = False
    flag_reason: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow, index=True)
