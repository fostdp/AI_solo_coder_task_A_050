import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from datetime import datetime
import asyncio
import json

from .config import get_settings
from .routers.api import router as api_router
from .mqtt_processor import data_processor

settings = get_settings()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("bronze_app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up Bronze Rust Monitor Application...")
    logger.info(f"App env: {settings.APP_ENV}, port: {settings.APP_PORT}")

    if data_processor.connect_and_subscribe():
        logger.info("MQTT processor connected and subscribing")
    else:
        logger.warning(
            "MQTT broker not available. Will still work via direct HTTP ingest. "
            "Start MQTT broker and mqtt_simulator.py for live data simulation."
        )

    app.state.mqtt_processor = data_processor

    yield

    logger.info("Shutting down application...")
    data_processor.disconnect()
    logger.info("Application shutdown complete.")


app = FastAPI(
    title="古代青铜器粉状锈爆发预警与缓蚀剂智能喷涂系统",
    description=(
        "基于电化学噪声时频特征（小波包分解）+随机森林的粉状锈爆发预测，"
        "结合CFD简化模型的缓蚀剂(BTA/AMT/MBO)雾化喷涂优化系统。"
        "传感器：30台电化学噪声+50台微环境+20台视频显微镜，每15分钟MQTT上报。"
        "告警通过企业微信和短信双通道推送。"
    ),
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket client disconnected. Remaining: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        payload = json.dumps(message, ensure_ascii=False, default=str)
        dead = []
        for conn in self.active_connections:
            try:
                await conn.send_text(payload)
            except Exception:
                dead.append(conn)
        for d in dead:
            self.disconnect(d)


manager = ConnectionManager()


@app.websocket("/ws/realtime")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong", "ts": datetime.utcnow().isoformat()})
            elif msg.get("type") == "subscribe":
                aid = msg.get("artifact_id")
                realtime = data_processor.get_realtime_data(aid)
                await websocket.send_json({
                    "type": "realtime_update",
                    "data": realtime,
                    "ts": datetime.utcnow().isoformat()
                })
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


async def broadcast_loop():
    while True:
        try:
            data = data_processor.get_realtime_data()
            summary = {
                "type": "realtime_summary",
                "data_count": len(data),
                "updated_artifacts": list(data.keys())[:50],
                "sample": dict(list(data.items())[:5]),
                "ts": datetime.utcnow().isoformat()
            }
            await manager.broadcast(summary)
        except Exception as e:
            logger.error(f"Broadcast error: {e}")
        await asyncio.sleep(30)


@app.on_event("startup")
async def schedule_broadcast():
    asyncio.create_task(broadcast_loop())


@app.get("/")
async def root():
    return {
        "name": "古代青铜器粉状锈爆发预警与缓蚀剂智能喷涂系统",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "artifacts": "/api/artifacts",
            "realtime": "/api/artifacts/realtime/all",
            "statistics": "/api/statistics",
            "alerts": "/api/alerts",
            "predictions": "/api/artifacts/{{id}}/predictions",
            "risk_zones": "/api/artifacts/{{id}}/risk-zones",
            "spray_optimize": "/api/spray-tasks/optimize (POST)",
            "ingest": "/api/ingest/{{sensor_type}} (POST)",
            "websocket": "/ws/realtime"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        reload=settings.APP_ENV == "development",
        log_level="info"
    )
