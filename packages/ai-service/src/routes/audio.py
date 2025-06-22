"""
Audio Analysis Routes using Whisper
Replaces Google Cloud Speech-to-Text API
"""

import os
import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from loguru import logger
from typing import Optional, List, Dict, Any
import aiofiles

router = APIRouter()

@router.post("/transcribe")
async def transcribe_audio(
    file: UploadFile = File(...),
    language: Optional[str] = None,
    enable_diarization: bool = False
):
    """
    Transcribe audio file using Whisper
    Compatible with Google Speech-to-Text API format
    """
    logger.info(f"🎵 Transcribing audio file: {file.filename}")
    
    try:
        # Import here to avoid circular imports
        from ..main import model_manager
        
        if model_manager is None or model_manager.whisper_model is None:
            raise HTTPException(status_code=503, detail="Whisper model not loaded")
        
        # Save uploaded file temporarily
        temp_file_path = None
        try:
            # Create temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
                temp_file_path = temp_file.name
                
                # Write uploaded content to temp file
                content = await file.read()
                temp_file.write(content)
            
            # Transcribe using Whisper
            logger.info(f"🔄 Processing audio with Whisper...")
            result = model_manager.whisper_model.transcribe(
                temp_file_path,
                language=language,
                verbose=True
            )
            
            # Format response to match Google Speech-to-Text API
            response = _format_whisper_response(result, enable_diarization)
            
            logger.info(f"✅ Audio transcription completed")
            return response
            
        finally:
            # Clean up temporary file
            if temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
                
    except Exception as e:
        logger.error(f"❌ Audio transcription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

@router.post("/analyze")
async def analyze_audio_segment(
    file: UploadFile = File(...),
    start_time: float = 0.0,
    end_time: Optional[float] = None
):
    """
    Analyze audio segment (for video segment processing)
    Returns transcription with timing information
    """
    logger.info(f"🎵 Analyzing audio segment: {file.filename}")
    
    try:
        from ..main import model_manager
        
        if model_manager is None or model_manager.whisper_model is None:
            raise HTTPException(status_code=503, detail="Whisper model not loaded")
        
        temp_file_path = None
        try:
            # Save uploaded file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
                temp_file_path = temp_file.name
                content = await file.read()
                temp_file.write(content)
            
            # Transcribe segment
            result = model_manager.whisper_model.transcribe(
                temp_file_path,
                verbose=True
            )
            
            # Extract relevant segment if timing provided
            if end_time is not None:
                result = _extract_segment(result, start_time, end_time)
            
            # Format for video segment analysis
            response = {
                "transcript": result.get("text", "").strip(),
                "language": result.get("language", "unknown"),
                "segments": [
                    {
                        "text": segment["text"].strip(),
                        "start": segment["start"],
                        "end": segment["end"],
                        "confidence": 1.0  # Whisper doesn't provide confidence scores
                    }
                    for segment in result.get("segments", [])
                ],
                "word_count": len(result.get("text", "").split()),
                "duration": result.get("segments", [{}])[-1].get("end", 0) if result.get("segments") else 0
            }
            
            return response
            
        finally:
            if temp_file_path and os.path.exists(temp_file_path):
                os.unlink(temp_file_path)
                
    except Exception as e:
        logger.error(f"❌ Audio segment analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Audio analysis failed: {str(e)}")

def _format_whisper_response(whisper_result: Dict[str, Any], enable_diarization: bool) -> Dict[str, Any]:
    """Format Whisper response to match Google Speech-to-Text API format"""
    
    # Extract segments with timing
    alternatives = []
    
    if whisper_result.get("segments"):
        # Create detailed transcript with word-level timing
        words = []
        for segment in whisper_result["segments"]:
            # Whisper doesn't provide word-level timing by default
            # For now, we'll estimate based on segment timing
            segment_words = segment["text"].strip().split()
            if segment_words:
                word_duration = (segment["end"] - segment["start"]) / len(segment_words)
                for i, word in enumerate(segment_words):
                    word_start = segment["start"] + (i * word_duration)
                    word_end = word_start + word_duration
                    words.append({
                        "word": word,
                        "startTime": f"{word_start:.3f}s",
                        "endTime": f"{word_end:.3f}s",
                        "confidence": 1.0
                    })
        
        alternatives.append({
            "transcript": whisper_result["text"].strip(),
            "confidence": 1.0,
            "words": words
        })
    else:
        # Fallback for simple transcription
        alternatives.append({
            "transcript": whisper_result.get("text", "").strip(),
            "confidence": 1.0
        })
    
    # Format response
    response = {
        "results": [
            {
                "alternatives": alternatives,
                "languageCode": whisper_result.get("language", "unknown"),
                "resultEndTime": f"{whisper_result.get('segments', [{}])[-1].get('end', 0):.3f}s" if whisper_result.get("segments") else "0.000s"
            }
        ]
    }
    
    # Add speaker diarization if requested (simplified)
    if enable_diarization and whisper_result.get("segments"):
        # Whisper doesn't do speaker diarization, so we'll simulate it
        # In a real implementation, you'd use a separate diarization model
        response["results"][0]["speakerDiarization"] = {
            "speakers": [
                {
                    "speakerTag": 1,
                    "startTime": "0.000s",
                    "endTime": f"{whisper_result.get('segments', [{}])[-1].get('end', 0):.3f}s"
                }
            ]
        }
    
    return response

def _extract_segment(result: Dict[str, Any], start_time: float, end_time: float) -> Dict[str, Any]:
    """Extract specific time segment from Whisper result"""
    
    filtered_segments = []
    filtered_text_parts = []
    
    for segment in result.get("segments", []):
        # Check if segment overlaps with requested time range
        if segment["end"] >= start_time and segment["start"] <= end_time:
            # Adjust timing to be relative to start_time
            adjusted_segment = {
                "text": segment["text"],
                "start": max(0, segment["start"] - start_time),
                "end": min(end_time - start_time, segment["end"] - start_time)
            }
            filtered_segments.append(adjusted_segment)
            filtered_text_parts.append(segment["text"])
    
    return {
        "text": " ".join(filtered_text_parts),
        "language": result.get("language"),
        "segments": filtered_segments
    } 