"""
AI Service Main Application
Replaces Google Cloud Speech-to-Text and Video Intelligence APIs
with open source alternatives: Whisper + YOLO + CLIP
"""

import os
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from .routes.audio import router as audio_router
from .routes.visual import router as visual_router
from .routes.health import router as health_router
from .models.model_manager import ModelManager

# Initialize FastAPI app
app = FastAPI(
    title="Clipov AI Service",
    description="Open source AI service replacing Google Cloud APIs",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model manager instance
model_manager = None

@app.on_event("startup")
async def startup_event():
    """Initialize models on startup"""
    global model_manager
    logger.info("🚀 Starting AI Service...")
    
    try:
        model_manager = ModelManager()
        await model_manager.initialize()
        logger.info("✅ AI Service started successfully!")
    except Exception as e:
        logger.error(f"❌ Failed to start AI Service: {e}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("🛑 Shutting down AI Service...")
    if model_manager:
        await model_manager.cleanup()
    logger.info("✅ AI Service shutdown complete")

# Include routers
app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(audio_router, prefix="/analyze/audio", tags=["audio"])
app.include_router(visual_router, prefix="/analyze/visual", tags=["visual"])

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Clipov AI Service",
        "version": "1.0.0",
        "status": "running",
        "models": {
            "audio": "Whisper",
            "objects": "YOLOv8",
            "scenes": "CLIP"
        }
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8080))
    host = os.getenv("HOST", "0.0.0.0")
    
    logger.info(f"Starting server on {host}:{port}")
    uvicorn.run(
        "src.main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    ) 