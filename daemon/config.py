from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class Settings(BaseSettings):
    hub_ws_url: str = "wss://agentrelay.duckdns.org/ws/mac"
    device_token: str = "change-me"
    term_token: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()