"""
Visual Analysis Routes using YOLO + CLIP
Replaces Google Cloud Video Intelligence API
"""

import os
import tempfile
import cv2
import torch
import numpy as np
from PIL import Image
from fastapi import APIRouter, UploadFile, File, HTTPException
from loguru import logger
from typing import List, Dict, Any, Optional

router = APIRouter()

@router.post("/detect-objects")
async def detect_objects(
    file: UploadFile = File(...),
    confidence_threshold: float = 0.5
):
    """
    Detect objects in image/video frame using YOLO
    Compatible with Google Video Intelligence API format
    """
    logger.info(f"👁️ Detecting objects in: {file.filename}")
    
    try:
        from ..main import model_manager
        
        if model_manager is None or model_manager.yolo_model is None:
            raise HTTPException(status_code=503, detail="YOLO model not loaded")
        
        temp_file_path = None
        try:
            # Save uploaded file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as temp_file:
                temp_file_path = temp_file.name
                content = await file.read()
                temp_file.write(content)
            
            # Run YOLO detection
            results = model_manager.yolo_model(temp_file_path, conf=confidence_threshold)
            
            # Format response
            objects = []
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    for box in boxes:
                        # Get class name
                        class_id = int(box.cls[0])
                        class_name = model_manager.yolo_model.names[class_id]
                        confidence = float(box.conf[0])
                        
                        # Get bounding box coordinates (normalized)
                        x1, y1, x2, y2 = box.xyxyn[0].tolist()
                        
                        objects.append({
                            "name": class_name,
                            "confidence": confidence,
                            "boundingBox": {
                                "left": x1,
                                "top": y1,
                                "right": x2,
                                "bottom": y2
                            }
                        })
            
            response = {
                "objectAnnotations": objects,
                "totalObjects": len(objects)
            }
            
            logger.info(f"✅ Detected {len(objects)} objects")
            return response
            
        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
                
    except Exception as e:
        logger.error(f"❌ Object detection failed: {e}")
        raise HTTPException(status_code=500, detail=f"Object detection failed: {str(e)}")

@router.post("/detect-people")
async def detect_people(
    file: UploadFile = File(...),
    confidence_threshold: float = 0.5
):
    """
    Detect people in image/video frame using YOLO
    Compatible with Google Video Intelligence API format
    """
    logger.info(f"👥 Detecting people in: {file.filename}")
    
    try:
        from ..main import model_manager
        
        if model_manager is None or model_manager.yolo_model is None:
            raise HTTPException(status_code=503, detail="YOLO model not loaded")
        
        temp_file_path = None
        try:
            # Save uploaded file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as temp_file:
                temp_file_path = temp_file.name
                content = await file.read()
                temp_file.write(content)
            
            # Run YOLO detection
            results = model_manager.yolo_model(temp_file_path, conf=confidence_threshold)
            
            # Filter for person class (class_id = 0 in COCO dataset)
            people = []
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    for box in boxes:
                        class_id = int(box.cls[0])
                        class_name = model_manager.yolo_model.names[class_id]
                        
                        # Only include people
                        if class_name.lower() == "person":
                            confidence = float(box.conf[0])
                            x1, y1, x2, y2 = box.xyxyn[0].tolist()
                            
                            people.append({
                                "confidence": confidence,
                                "boundingBox": {
                                    "left": x1,
                                    "top": y1,
                                    "right": x2,
                                    "bottom": y2
                                },
                                "attributes": {
                                    "clothing": "unknown",  # Would need additional model
                                    "pose": "unknown"       # Would need pose estimation model
                                }
                            })
            
            response = {
                "personDetectionAnnotations": people,
                "totalPeople": len(people)
            }
            
            logger.info(f"✅ Detected {len(people)} people")
            return response
            
        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
                
    except Exception as e:
        logger.error(f"❌ People detection failed: {e}")
        raise HTTPException(status_code=500, detail=f"People detection failed: {str(e)}")

@router.post("/analyze-scene")
async def analyze_scene(
    file: UploadFile = File(...),
    scene_categories: Optional[List[str]] = None
):
    """
    Analyze scene content using CLIP
    Compatible with Google Video Intelligence API format
    """
    logger.info(f"🖼️ Analyzing scene in: {file.filename}")
    
    try:
        from ..main import model_manager
        
        if model_manager is None or model_manager.clip_model is None:
            raise HTTPException(status_code=503, detail="CLIP model not loaded")
        
        temp_file_path = None
        try:
            # Save uploaded file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as temp_file:
                temp_file_path = temp_file.name
                content = await file.read()
                temp_file.write(content)
            
            # Load and preprocess image
            image = Image.open(temp_file_path)
            image_input = model_manager.clip_preprocess(image).unsqueeze(0).to(model_manager.device)
            
            # Default scene categories if none provided
            if scene_categories is None:
                scene_categories = [
                    "indoor scene", "outdoor scene", "office", "home", "restaurant",
                    "street", "park", "beach", "mountain", "city", "nature",
                    "sports", "concert", "meeting", "party", "kitchen", "bedroom"
                ]
            
            # Create text inputs for scene categories
            text_prompts = [f"a photo of {category}" for category in scene_categories]
            text_tokens = model_manager.clip_tokenizer(text_prompts).to(model_manager.device)
            
            # Calculate similarities
            with torch.no_grad():
                image_features = model_manager.clip_model.encode_image(image_input)
                text_features = model_manager.clip_model.encode_text(text_tokens)
                
                # Normalize features
                image_features /= image_features.norm(dim=-1, keepdim=True)
                text_features /= text_features.norm(dim=-1, keepdim=True)
                
                # Calculate similarities
                similarities = (100.0 * image_features @ text_features.T).softmax(dim=-1)
            
            # Format results
            scene_labels = []
            for i, category in enumerate(scene_categories):
                confidence = float(similarities[0][i])
                if confidence > 0.1:  # Only include if confidence > 10%
                    scene_labels.append({
                        "description": category,
                        "confidence": confidence,
                        "category": _categorize_scene(category)
                    })
            
            # Sort by confidence
            scene_labels.sort(key=lambda x: x["confidence"], reverse=True)
            
            response = {
                "labelAnnotations": scene_labels,
                "totalLabels": len(scene_labels),
                "dominantScene": scene_labels[0] if scene_labels else None
            }
            
            logger.info(f"✅ Analyzed scene with {len(scene_labels)} labels")
            return response
            
        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
                
    except Exception as e:
        logger.error(f"❌ Scene analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Scene analysis failed: {str(e)}")

@router.post("/analyze-video-segment")
async def analyze_video_segment(
    file: UploadFile = File(...),
    start_time: float = 0.0,
    end_time: Optional[float] = None,
    extract_frames: int = 5,
    confidence_threshold: float = 0.5
):
    """
    Analyze video segment by extracting frames and running visual analysis
    This is the main endpoint that replaces Google Video Intelligence API
    """
    logger.info(f"🎬 Analyzing video segment: {file.filename} (confidence: {confidence_threshold})")
    
    try:
        from ..main import model_manager
        
        if (model_manager is None or 
            model_manager.yolo_model is None or 
            model_manager.clip_model is None):
            raise HTTPException(status_code=503, detail="Visual models not loaded")
        
        temp_video_path = None
        try:
            # Save uploaded video file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_file:
                temp_video_path = temp_file.name
                content = await file.read()
                temp_file.write(content)
            
            # Extract frames from video segment
            frames = _extract_frames(temp_video_path, start_time, end_time, extract_frames)
            
            if not frames:
                raise HTTPException(status_code=400, detail="No frames could be extracted")
            
            # Analyze each frame
            all_objects = []
            all_people = []
            all_scenes = []
            
            for i, frame in enumerate(frames):
                frame_time = start_time + (i * (end_time - start_time) / len(frames)) if end_time else start_time + i
                
                # Save frame temporarily
                frame_path = None
                try:
                    with tempfile.NamedTemporaryFile(delete=False, suffix=".jpg") as frame_file:
                        frame_path = frame_file.name
                        cv2.imwrite(frame_path, frame)
                    
                    # Object detection with configurable confidence threshold
                    objects_result = model_manager.yolo_model(frame_path, conf=confidence_threshold)
                    frame_objects = _process_yolo_results(objects_result, frame_time)
                    all_objects.extend(frame_objects)
                    
                    # People detection (filter objects for people)
                    people = [obj for obj in frame_objects if obj["name"].lower() == "person"]
                    all_people.extend(people)
                    
                    # Scene analysis with CLIP
                    image = Image.open(frame_path)
                    scene_result = _analyze_frame_with_clip(
                        image, model_manager.clip_model, model_manager.clip_preprocess, 
                        model_manager.device, frame_time
                    )
                    all_scenes.extend(scene_result)
                    
                finally:
                    if frame_path and os.path.exists(frame_path):
                        os.unlink(frame_path)
            
            # Aggregate results
            response = {
                "objects": _aggregate_detections(all_objects),
                "people": _aggregate_detections(all_people),
                "activities": _infer_activities(all_objects, all_people),
                "scenes": _aggregate_scenes(all_scenes),
                "summary": {
                    "totalObjects": len(all_objects),
                    "totalPeople": len(all_people),
                    "framesAnalyzed": len(frames),
                    "timeRange": {
                        "start": start_time,
                        "end": end_time or start_time + 5.0
                    },
                    "confidence_threshold": confidence_threshold
                }
            }
            
            logger.info(f"✅ Video segment analysis completed - Objects: {len(all_objects)}, People: {len(all_people)}")
            return response
            
        finally:
            if temp_video_path and os.path.exists(temp_video_path):
                os.unlink(temp_video_path)
                
    except Exception as e:
        logger.error(f"❌ Video segment analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Video analysis failed: {str(e)}")

# Helper functions

def _extract_frames(video_path: str, start_time: float, end_time: Optional[float], num_frames: int) -> List[np.ndarray]:
    """Extract frames from video segment"""
    cap = cv2.VideoCapture(video_path)
    
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps if fps > 0 else 0
        
        if end_time is None:
            end_time = min(start_time + 5.0, duration)
        
        start_frame = int(start_time * fps)
        end_frame = int(end_time * fps)
        
        # Calculate frame intervals
        frame_interval = max(1, (end_frame - start_frame) // num_frames)
        
        frames = []
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
        
        for i in range(num_frames):
            frame_pos = start_frame + (i * frame_interval)
            if frame_pos >= end_frame:
                break
                
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_pos)
            ret, frame = cap.read()
            
            if ret:
                frames.append(frame)
        
        return frames
        
    finally:
        cap.release()

def _process_yolo_results(results, frame_time: float) -> List[Dict]:
    """Process YOLO detection results"""
    objects = []
    
    for result in results:
        boxes = result.boxes
        if boxes is not None:
            for box in boxes:
                class_id = int(box.cls[0])
                class_name = result.names[class_id]
                confidence = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxyn[0].tolist()
                
                objects.append({
                    "name": class_name,
                    "confidence": confidence,
                    "boundingBox": {
                        "left": x1,
                        "top": y1, 
                        "right": x2,
                        "bottom": y2
                    },
                    "timestamp": frame_time
                })
    
    return objects

def _analyze_frame_with_clip(image: Image.Image, clip_model, clip_preprocess, device: str, frame_time: float) -> List[Dict]:
    """Analyze frame with CLIP for scene understanding"""
    scene_categories = [
        "indoor", "outdoor", "office", "home", "street", "park", 
        "sports", "meeting", "party", "nature", "city"
    ]
    
    try:
        from ..main import model_manager
        image_input = clip_preprocess(image).unsqueeze(0).to(device)
        
        # Create text prompts and tokenize
        text_prompts = [f"a photo of {category}" for category in scene_categories]
        text_tokens = model_manager.clip_tokenizer(text_prompts).to(device)
        
        with torch.no_grad():
            image_features = clip_model.encode_image(image_input)
            text_features = clip_model.encode_text(text_tokens)
            
            image_features /= image_features.norm(dim=-1, keepdim=True)
            text_features /= text_features.norm(dim=-1, keepdim=True)
            
            similarities = (100.0 * image_features @ text_features.T).softmax(dim=-1)
        
        scenes = []
        for i, category in enumerate(scene_categories):
            confidence = float(similarities[0][i])
            if confidence > 0.15:
                scenes.append({
                    "description": category,
                    "confidence": confidence,
                    "timestamp": frame_time
                })
        
        return scenes
        
    except Exception as e:
        logger.error(f"CLIP analysis failed: {e}")
        return []

def _categorize_scene(scene_description: str) -> str:
    """Categorize scene into broader categories"""
    indoor_scenes = ["office", "home", "restaurant", "kitchen", "bedroom", "meeting"]
    outdoor_scenes = ["street", "park", "beach", "mountain", "city", "nature"]
    
    if any(indoor in scene_description.lower() for indoor in indoor_scenes):
        return "indoor"
    elif any(outdoor in scene_description.lower() for outdoor in outdoor_scenes):
        return "outdoor"
    else:
        return "unknown"

def _aggregate_detections(detections: List[Dict]) -> List[Dict]:
    """Aggregate similar detections across frames"""
    if not detections:
        return []
    
    # Group by object name
    grouped = {}
    for detection in detections:
        name = detection["name"]
        if name not in grouped:
            grouped[name] = []
        grouped[name].append(detection)
    
    # Aggregate each group
    aggregated = []
    for name, group in grouped.items():
        avg_confidence = sum(d["confidence"] for d in group) / len(group)
        aggregated.append({
            "name": name,
            "confidence": avg_confidence,
            "occurrences": len(group),
            "firstSeen": min(d["timestamp"] for d in group),
            "lastSeen": max(d["timestamp"] for d in group)
        })
    
    return sorted(aggregated, key=lambda x: x["confidence"], reverse=True)

def _aggregate_scenes(scenes: List[Dict]) -> List[Dict]:
    """Aggregate scene detections"""
    if not scenes:
        return []
    
    grouped = {}
    for scene in scenes:
        desc = scene["description"]
        if desc not in grouped:
            grouped[desc] = []
        grouped[desc].append(scene)
    
    aggregated = []
    for desc, group in grouped.items():
        avg_confidence = sum(s["confidence"] for s in group) / len(group)
        aggregated.append({
            "description": desc,
            "confidence": avg_confidence,
            "category": _categorize_scene(desc),
            "occurrences": len(group)
        })
    
    return sorted(aggregated, key=lambda x: x["confidence"], reverse=True)

def _infer_activities(objects: List[Dict], people: List[Dict]) -> List[Dict]:
    """Infer activities based on detected objects and people"""
    activities = []
    
    # Simple activity inference based on objects
    object_names = [obj["name"].lower() for obj in objects]
    
    if "person" in object_names:
        if any(sport in object_names for sport in ["sports ball", "tennis racket", "baseball bat"]):
            activities.append({
                "description": "sports activity",
                "confidence": 0.8,
                "evidence": ["person", "sports equipment"]
            })
        
        if any(work in object_names for work in ["laptop", "keyboard", "mouse"]):
            activities.append({
                "description": "working",
                "confidence": 0.7,
                "evidence": ["person", "work equipment"]
            })
        
        if any(food in object_names for food in ["cup", "fork", "knife", "spoon"]):
            activities.append({
                "description": "eating/drinking",
                "confidence": 0.6,
                "evidence": ["person", "dining items"]
            })
    
    return activities 