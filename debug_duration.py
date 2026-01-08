import subprocess
import json
import sys

def get_durations(file_path):
    cmd = [
        'ffprobe', 
        '-v', 'error', 
        '-show_entries', 'format=duration:stream=index,codec_type,duration,start_time', 
        '-of', 'json', 
        file_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error running ffprobe: {result.stderr}")
        return None
    
    return json.loads(result.stdout)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 debug_duration.py <video_file>")
        sys.exit(1)
    
    data = get_durations(sys.argv[1])
    if not data:
        sys.exit(1)
    
    format_duration = float(data.get('format', {}).get('duration', 0))
    print(f"File: {sys.argv[1]}")
    print(f"Format Duration: {format_duration:.3f}s")
    
    for stream in data.get('streams', []):
        stype = stream.get('codec_type')
        idx = stream.get('index')
        duration = stream.get('duration')
        start_time = stream.get('start_time')
        
        print(f"Stream #{idx} ({stype}):")
        if start_time:
            print(f"  Start Time: {float(start_time):.3f}s")
        if duration:
            print(f"  Duration:   {float(duration):.3f}s")
        else:
            print("  Duration:   N/A (check packets)")

