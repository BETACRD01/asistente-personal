from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    jwt_secret: str = "change-me"
    jwt_expire_hours: int = 24
    device_tokens_raw: str = Field(default="", validation_alias="DEVICE_TOKENS")
    app_token: str = ""
    redis_url: str = "redis://127.0.0.1:6379/0"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def device_tokens(self) -> list[str]:
        return [t.strip() for t in self.device_tokens_raw.split(",") if t.strip()]


settings = Settings()