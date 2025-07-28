import os
import subprocess
import torch
from TTS.api import TTS
import json
from flask import Flask, jsonify, request, abort
app = Flask(__name__)

# Get device
device = "cuda" if torch.cuda.is_available() else "cpu"

# Initialize the TTS API with a specific model or path to your custom voice file
api = TTS("AstraMindAI/xtts2-gpt").to(device)

@app.route('/', methods=['POST'])
def index():
    speech = request.json['speak']
    emotion = request.json['emotion']
    voice_path = request.json.get('voice', "voices/alien.wav")  # Default to a default if not provided

    #https://coqui-tts.readthedocs.io/en/latest/tutorial_for_nervous_beginners.html#

    # change /mnt/storage/llm/lyra/.venv/lib/python3.11/site-packages/TTS/tts/models/xtts.py", line 714
    #   checkpoint = load_fsspec(model_path, map_location=torch.device("cpu"))["model"]
    # to
    #   checkpoint = load_fsspec(model_path, map_location=torch.device("cpu"), weights_only=False)["model"]

    # TTS with on the fly voice conversion
    #api = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    
    # Check if the specified voice file exists, use it if true, otherwise use default
    if os.path.exists(voice_path):
        speaker_wav = voice_path
    else:
        print("Warning: Specified voice file does not exist, using default.")
        speaker_wav = "voices/alien.wav"  # Default path
    
    api.tts_to_file(text=speech,
                    emotion=emotion,
                    file_path="output.wav",
                    speaker_wav=speaker_wav,
                    language="en")

    # Convert the output to mp3
    subprocess.run(["cvlc", "--play-and-exit", "output.wav"])
   
    os.unlink("output.wav")
    
    return jsonify({"status": "success"}), 200

@app.route('/voices', methods=['GET'])
def list_voices():
    voices_dir = 'voices'
    if not os.path.exists(voices_dir):
        return jsonify({"error": "Voices directory does not exist"}), 404
    voice_files = sorted([f for f in os.listdir(voices_dir) if os.path.isfile(os.path.join(voices_dir, f))])
    return jsonify(voice_files), 200

if __name__ == '__main__':
    app.run(port=3004)