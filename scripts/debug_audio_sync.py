#!/usr/bin/env python3
"""
Script to diagnose audio/video sync issues in recordings.
Compares duration of video and audio streams and checks for drift.
"""
import subprocess
import json
import sys
import os

def run_ffprobe(file_path, show_entries):
    cmd = [
        'ffprobe',
        '-v', 'error',
        '-show_entries', show_entries,
        '-of', 'json',
        file_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return None
    return json.loads(result.stdout)

def get_stream_info(file_path):
    data = run_ffprobe(file_path, 'stream=index,codec_type,duration,start_time,nb_frames,time_base')
    if not data:
        return None
    return data.get('streams', [])

def get_format_info(file_path):
    data = run_ffprobe(file_path, 'format=duration,size,bit_rate')
    if not data:
        return None
    return data.get('format', {})

def get_last_packet_time(file_path, stream_type):
    stream_spec = 'v:0' if stream_type == 'video' else 'a:0'
    cmd = [
        'ffprobe',
        '-v', 'error',
        '-select_streams', stream_spec,
        '-show_entries', 'packet=pts_time,dts_time',
        '-of', 'json',
        file_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        return None
    
    data = json.loads(result.stdout)
    packets = data.get('packets', [])
    if not packets:
        return None
    
    last_packet = packets[-1]
    pts = last_packet.get('pts_time')
    if pts:
        return float(pts)
    dts = last_packet.get('dts_time')
    if dts:
        return float(dts)
    return None

def analyze_file(file_path):
    print(f"\n{'='*60}")
    print(f"Analyzing: {file_path}")
    print(f"{'='*60}")
    
    if not os.path.exists(file_path):
        print(f"ERROR: File not found: {file_path}")
        return
    
    format_info = get_format_info(file_path)
    if format_info:
        duration = format_info.get('duration', 'N/A')
        size = format_info.get('size', 'N/A')
        if duration != 'N/A':
            duration = f"{float(duration):.3f}s"
        if size != 'N/A':
            size = f"{int(size) / 1024 / 1024:.2f} MB"
        print(f"\nContainer Info:")
        print(f"  Duration: {duration}")
        print(f"  Size: {size}")
    
    streams = get_stream_info(file_path)
    if not streams:
        print("ERROR: Could not get stream info")
        return
    
    video_duration = None
    audio_duration = None
    video_start = None
    audio_start = None
    
    print(f"\nStreams:")
    for stream in streams:
        idx = stream.get('index')
        codec_type = stream.get('codec_type')
        duration = stream.get('duration')
        start_time = stream.get('start_time')
        nb_frames = stream.get('nb_frames')
        
        print(f"\n  Stream #{idx} ({codec_type}):")
        if start_time:
            print(f"    Start Time: {float(start_time):.6f}s")
        if duration:
            print(f"    Duration:   {float(duration):.6f}s")
        if nb_frames:
            print(f"    Frames:     {nb_frames}")
        
        if codec_type == 'video' and duration:
            video_duration = float(duration)
            video_start = float(start_time) if start_time else 0
        elif codec_type == 'audio' and duration:
            audio_duration = float(duration)
            audio_start = float(start_time) if start_time else 0
    
    print(f"\n{'='*60}")
    print("ANALYSIS:")
    print(f"{'='*60}")
    
    if video_duration and audio_duration:
        diff = video_duration - audio_duration
        print(f"\n  Video Duration: {video_duration:.6f}s")
        print(f"  Audio Duration: {audio_duration:.6f}s")
        print(f"  Difference:     {diff:.6f}s ({diff*1000:.2f}ms)")
        
        if abs(diff) > 0.5:
            print(f"\n  WARNING: Audio/Video duration mismatch > 500ms!")
            if diff > 0:
                print(f"      Audio is {abs(diff):.3f}s SHORTER than video")
                print(f"      This causes audio to cut off at the end!")
            else:
                print(f"      Video is {abs(diff):.3f}s SHORTER than audio")
        elif abs(diff) > 0.1:
            print(f"\n  NOTICE: Audio/Video duration mismatch > 100ms")
        else:
            print(f"\n  OK: Audio/Video durations are well synchronized")
    
    if video_start is not None and audio_start is not None:
        start_diff = video_start - audio_start
        if abs(start_diff) > 0.01:
            print(f"\n  Start Time Offset:")
            print(f"    Video starts at: {video_start:.6f}s")
            print(f"    Audio starts at: {audio_start:.6f}s")
            print(f"    Offset: {start_diff*1000:.2f}ms")
    
    print(f"\nChecking last packet timestamps...")
    video_last = get_last_packet_time(file_path, 'video')
    audio_last = get_last_packet_time(file_path, 'audio')
    
    if video_last and audio_last:
        packet_diff = video_last - audio_last
        print(f"  Last Video Packet: {video_last:.6f}s")
        print(f"  Last Audio Packet: {audio_last:.6f}s")
        print(f"  Packet Difference: {packet_diff:.6f}s ({packet_diff*1000:.2f}ms)")
        
        if abs(packet_diff) > 0.5:
            print(f"\n  WARNING: Last packets are > 500ms apart!")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 debug_audio_sync.py <video_file> [video_file2 ...]")
        print("\nExample:")
        print("  python3 debug_audio_sync.py /tmp/mochi_raw_*.mp4")
        sys.exit(1)
    
    for file_path in sys.argv[1:]:
        analyze_file(file_path)
    
    print("\n")
