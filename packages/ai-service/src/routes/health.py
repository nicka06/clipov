"""
Health Check Routes for AI Service
"""

from fastapi import APIRouter, HTTPException
from loguru import logger
import psutil
import torch

router = APIRouter()

@router.get("/")
async def health_check():
    """Basic health check endpoint"""
    return {
        "status": "healthy",
        "service": "Clipov AI Service",
        "version": "1.0.0"
    }

@router.get("/detailed")
async def detailed_health_check():
    """Detailed health check with system information"""
    try:
        # Get system metrics
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        # GPU information
        gpu_info = {}
        if torch.cuda.is_available():
            gpu_info = {
                "available": True,
                "device_count": torch.cuda.device_count(),
                "current_device": torch.cuda.current_device(),
                "device_name": torch.cuda.get_device_name(0),
                "memory_allocated": torch.cuda.memory_allocated(0),
                "memory_reserved": torch.cuda.memory_reserved(0)
            }
        else:
            gpu_info = {"available": False}
        
        return {
            "status": "healthy",
            "service": "Clipov AI Service",
            "version": "1.0.0",
            "system": {
                "cpu_percent": cpu_percent,
                "memory": {
                    "total": memory.total,
                    "available": memory.available,
                    "percent": memory.percent,
                    "used": memory.used
                },
                "disk": {
                    "total": disk.total,
                    "free": disk.free,
                    "used": disk.used,
                    "percent": (disk.used / disk.total) * 100
                },
                "gpu": gpu_info
            }
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")

@router.get("/models")
async def models_health_check():
    """Check model loading status"""
    try:
        # Import here to avoid circular imports
        from ..main import model_manager
        
        if model_manager is None:
            return {
                "status": "initializing",
                "models": "not loaded"
            }
        
        model_info = model_manager.get_model_info()
        
        # Check if all models are loaded
        all_loaded = all(
            model["loaded"] for model in model_info["models"].values()
        )
        
        return {
            "status": "healthy" if all_loaded else "partial",
            "models": model_info
        }
        
    except Exception as e:
        logger.error(f"Model health check failed: {e}")
        raise HTTPException(status_code=500, detail=f"Model health check failed: {str(e)}")

@router.get("/readiness")
async def readiness_check():
    """Kubernetes readiness probe endpoint"""
    try:
        from ..main import model_manager
        
        if model_manager is None:
            raise HTTPException(status_code=503, detail="Models not initialized")
        
        model_info = model_manager.get_model_info()
        all_loaded = all(
            model["loaded"] for model in model_info["models"].values()
        )
        
        if not all_loaded:
            raise HTTPException(status_code=503, detail="Not all models loaded")
        
        return {"status": "ready"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        raise HTTPException(status_code=503, detail=f"Service not ready: {str(e)}")

@router.get("/liveness")
async def liveness_check():
    """Kubernetes liveness probe endpoint"""
    return {"status": "alive"} 