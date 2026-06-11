from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"
    DB_NAME: str = "bronze_monitor"

    MQTT_BROKER: str = "localhost"
    MQTT_PORT: int = 1883
    MQTT_USERNAME: str = "admin"
    MQTT_PASSWORD: str = "admin"
    MQTT_TOPIC_PREFIX: str = "museum/bronze"

    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    APP_ENV: str = "development"

    WECOM_WEBHOOK_URL: str = ""
    SMS_API_URL: str = ""
    SMS_API_KEY: str = ""
    SMS_SENDER: str = ""

    NOISE_RESISTANCE_THRESHOLD: float = 100.0
    CHLORIDE_THRESHOLD: float = 3.0
    SULFUR_DIOXIDE_THRESHOLD: float = 50.0
    TEMPERATURE_HIGH_THRESHOLD: float = 30.0
    HUMIDITY_HIGH_THRESHOLD: float = 70.0

    REPORT_INTERVAL: int = 900

    class Config:
        env_file = ".env"
        case_sensitive = True

    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def DATABASE_URL_SYNC(self) -> str:
        return f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
