"""
Model Manager for AI Service
Handles loading and management of Whisper, YOLO, and CLIP models
"""

import os
import torch
import whisper
from ultralytics import YOLO
import open_clip
from loguru import logger
from typing import Optional, Dict, Any


class ModelManager:
    """Manages loading and accessing AI models."""
    
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"🔧 Using device: {self.device}")
        
        # Model instances
        self.whisper_model: Optional[whisper.Whisper] = None
        self.yolo_model: Optional[YOLO] = None
        self.clip_model: Optional[torch.nn.Module] = None
        self.clip_preprocess = None
        self.clip_tokenizer = None
        
        # Model configurations
        self.whisper_model_name = os.getenv("WHISPER_MODEL", "base")  # base, small, medium, large
        self.yolo_model_name = os.getenv("YOLO_MODEL", "yolov8n.pt")  # n=nano, s=small, m=medium, l=large
        self.clip_model_name = os.getenv("CLIP_MODEL", "ViT-B-32")
        
    async def initialize(self):
        """Initialize all models"""
        logger.info("🔄 Initializing AI models...")
        
        try:
            await self._load_whisper()
            await self._load_yolo()
            await self._load_clip()
            logger.info("✅ All models loaded successfully!")
        except Exception as e:
            logger.error(f"❌ Failed to initialize models: {e}")
            raise
    
    async def _load_whisper(self):
        """Load Whisper model for audio transcription"""
        logger.info(f"🎵 Loading Whisper model: {self.whisper_model_name}")
        try:
            self.whisper_model = whisper.load_model(
                self.whisper_model_name,
                device=self.device
            )
            logger.info(f"✅ Whisper model loaded (~{self._get_whisper_size()}MB)")
        except Exception as e:
            logger.error(f"❌ Failed to load Whisper: {e}")
            raise
    
    async def _load_yolo(self):
        """Load YOLO model for object detection"""
        logger.info(f"👁️  Loading YOLO model: {self.yolo_model_name}")
        try:
            self.yolo_model = YOLO(self.yolo_model_name)
            # Move to device if CUDA available
            if self.device == "cuda":
                self.yolo_model.to(self.device)
            logger.info(f"✅ YOLO model loaded (~{self._get_yolo_size()}MB)")
        except Exception as e:
            logger.error(f"❌ Failed to load YOLO: {e}")
            raise
    
    async def _load_clip(self):
        """Load CLIP model for scene understanding"""
        logger.info(f"🖼️  Loading CLIP model: {self.clip_model_name}")
        try:
            self.clip_model, _, self.clip_preprocess = open_clip.create_model_and_transforms(
                self.clip_model_name, 
                pretrained='openai'
            )
            self.clip_tokenizer = open_clip.get_tokenizer(self.clip_model_name)
            self.clip_model = self.clip_model.to(self.device)
            self.clip_model.eval()
            logger.info(f"✅ CLIP model loaded (~{self._get_clip_size()}MB)")
        except Exception as e:
            logger.error(f"❌ Failed to load CLIP: {e}")
            raise
    
    def _get_whisper_size(self) -> str:
        """Get approximate Whisper model size"""
        sizes = {
            "tiny": "39",
            "base": "74",
            "small": "244",
            "medium": "769",
            "large": "1550"
        }
        return sizes.get(self.whisper_model_name, "unknown")
    
    def _get_yolo_size(self) -> str:
        """Get approximate YOLO model size"""
        sizes = {
            "yolov8n.pt": "6",
            "yolov8s.pt": "22",
            "yolov8m.pt": "52",
            "yolov8l.pt": "87",
            "yolov8x.pt": "136"
        }
        return sizes.get(self.yolo_model_name, "unknown")
    
    def _get_clip_size(self) -> str:
        """Get approximate CLIP model size"""
        sizes = {
            "ViT-B-32": "151",
            "ViT-B-16": "338",
            "ViT-L-14": "427"
        }
        return sizes.get(self.clip_model_name, "unknown")
    
    async def cleanup(self):
        """Cleanup models"""
        logger.info("🧹 Cleaning up models...")
        
        # Clear CUDA cache if using GPU
        if self.device == "cuda":
            torch.cuda.empty_cache()
        
        # Set models to None to free memory
        self.whisper_model = None
        self.yolo_model = None
        self.clip_model = None
        self.clip_preprocess = None
        self.clip_tokenizer = None
        
        logger.info("✅ Model cleanup complete")
    
    def get_model_info(self) -> dict:
        """Get information about loaded models"""
        return {
            "device": self.device,
            "models": {
                "whisper": {
                    "name": self.whisper_model_name,
                    "loaded": self.whisper_model is not None,
                    "size_mb": self._get_whisper_size()
                },
                "yolo": {
                    "name": self.yolo_model_name,
                    "loaded": self.yolo_model is not None,
                    "size_mb": self._get_yolo_size()
                },
                "clip": {
                    "name": self.clip_model_name,
                    "loaded": self.clip_model is not None,
                    "size_mb": self._get_clip_size()
                }
            }
        }

    def get_memory_usage(self) -> Dict[str, Any]:
        """Get memory usage information."""
        memory_info = {}
        
        if torch.cuda.is_available():
            memory_info["gpu"] = {
                "allocated": torch.cuda.memory_allocated() / 1024**3,  # GB
                "cached": torch.cuda.memory_reserved() / 1024**3,  # GB
                "max_allocated": torch.cuda.max_memory_allocated() / 1024**3  # GB
            }
        
        # CPU memory (requires psutil)
        try:
            import psutil
            memory_info["cpu"] = {
                "percent": psutil.virtual_memory().percent,
                "available_gb": psutil.virtual_memory().available / 1024**3
            }
        except ImportError:
            memory_info["cpu"] = {"status": "psutil not available"}
        
        return memory_info 