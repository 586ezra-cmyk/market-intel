"""מוריד סרטוני אינסטגרם מרשימת קישורים (JSON id→url) ומתמלל מקומית עם faster-whisper.
שימוש: python3 transcribe_ig.py urls.json  → ig_videos/<id>.mp4, <id>.txt"""
import json, subprocess, sys, pathlib, time
from faster_whisper import WhisperModel
ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT / 'ig_videos'; OUT.mkdir(exist_ok=True)
urls = json.load(open(sys.argv[1], encoding='utf-8'))
model = WhisperModel('small', device='cpu', compute_type='int8')
FF = '/Users/zrstyt/bin/ffmpeg'
for vid, url in urls.items():
    mp4 = OUT / f'{vid}.mp4'; wav = OUT / f'{vid}.wav'; txt = OUT / f'{vid}.txt'
    if txt.exists():
        print(vid, 'done'); continue
    if not mp4.exists() or mp4.stat().st_size < 10000:
        r = subprocess.run(['curl', '-sL', '--max-time', '120', '-A', 'Mozilla/5.0', '-o', str(mp4), url])
        if not mp4.exists() or mp4.stat().st_size < 10000:
            print(vid, 'download failed'); continue
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', str(mp4), '-vn', '-ac', '1', '-ar', '16000', str(wav)])
    if not wav.exists():
        print(vid, 'no audio'); continue
    t0 = time.time()
    segs, info = model.transcribe(str(wav), beam_size=5, vad_filter=True)
    lines = [f'[{s.start:6.1f}] {s.text.strip()}' for s in segs]
    txt.write_text(f'# lang={info.language} p={info.language_probability:.2f} dur={info.duration:.0f}s\n' + '\n'.join(lines) + '\n', encoding='utf-8')
    print(vid, info.language, f'{info.duration:.0f}s', f'{time.time()-t0:.0f}s transcribe', len(lines), 'segments')
