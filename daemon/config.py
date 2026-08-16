from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()

# Modelos por defecto según proveedor (estilo opencode/codex)
DEFAULT_MODELS = {
    "ollama": "llama3.2",
    "gemini": "gemini-3.6-flash",
    "vertex_ai": "gemini-2.5-flash",
    "openai": "gpt-4o",
    "anthropic": "claude-sonnet-4-20250514",
    "groq": "llama-3.3-70b-versatile",
    "openrouter": "google/gemini-2.5-flash",
}


class Settings(BaseSettings):
    hub_ws_url: str = "wss://api.tudominio.com/ws/mac"
    device_token: str = "change-me"

    # Proveedor del LLM: ollama | gemini | vertex_ai | openai | anthropic | groq | openrouter
    llm_provider: str = "ollama"
    llm_model: str = ""

    ollama_host: str = "http://localhost:11434"

    # Vertex AI (login con cuenta de Google, sin API key)
    vertex_project: str = ""
    vertex_location: str = "us-central1"

    # API keys (opcionales, según proveedor elegido)
    gemini_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    groq_api_key: str = ""
    openrouter_api_key: str = ""

    allowed_tools_raw: str = "bash,applescript"
    bash_timeout_seconds: int = 30
    max_command_length: int = 4000

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_tools(self) -> list[str]:
        return [t.strip() for t in self.allowed_tools_raw.split(",") if t.strip()]

    @property
    def litellm_model(self) -> str:
        model = self.llm_model or DEFAULT_MODELS.get(self.llm_provider, "llama3.2")
        if self.llm_provider in {"ollama", "gemini", "groq", "openrouter", "vertex_ai"}:
            return f"{self.llm_provider}/{model}"
        return model


settings = Settings()

ROOT_DIR = Path(__file__).resolve().parent.parent