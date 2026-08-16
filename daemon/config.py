from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class Settings(BaseSettings):
    hub_ws_url: str = "wss://api.tudominio.com/ws/mac"
    device_token: str = "change-me"

    llm_provider: str = "ollama"
    llm_model: str = "llama3.2"
    ollama_host: str = "http://localhost:11434"

    allowed_tools_raw: str = "bash,applescript"
    bash_timeout_seconds: int = 30
    max_command_length: int = 4000

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_tools(self) -> list[str]:
        return [t.strip() for t in self.allowed_tools_raw.split(",") if t.strip()]

    @property
    def litellm_model(self) -> str:
        if self.llm_provider == "ollama":
            return f"ollama/{self.llm_model}"
        return self.llm_model


settings = Settings()

ROOT_DIR = Path(__file__).resolve().parent.parent