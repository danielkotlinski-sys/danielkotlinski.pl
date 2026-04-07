#!/bin/bash
# Quick test: download video → upload to Gemini → analyze
# Usage: GEMINI_API_KEY=xxx bash scripts/test-video-analysis.sh "https://tiktok.com/..."

set -e

URL="$1"
if [ -z "$URL" ]; then
  echo "Usage: GEMINI_API_KEY=xxx bash scripts/test-video-analysis.sh <VIDEO_URL>"
  exit 1
fi

if [ -z "$GEMINI_API_KEY" ]; then
  echo "Error: Set GEMINI_API_KEY"
  exit 1
fi

TMP_DIR="/tmp/catscan-video"
mkdir -p "$TMP_DIR"
OUTFILE="$TMP_DIR/test_$(date +%s).mp4"

echo ""
echo "1. Downloading: $URL"
yt-dlp --no-playlist --max-filesize 50M --socket-timeout 30 \
  -f "best[ext=mp4][filesize<50M]/best[ext=mp4]/best" \
  -o "$OUTFILE" "$URL" 2>&1 | tail -3

if [ ! -f "$OUTFILE" ]; then
  echo "   FAILED: download failed"
  exit 1
fi
FILESIZE=$(stat -c%s "$OUTFILE")
echo "   OK: $OUTFILE ($FILESIZE bytes)"

echo ""
echo "2. Uploading to Gemini..."
UPLOAD_INIT=$(curl -s -X POST \
  "https://generativelanguage.googleapis.com/upload/v1beta/files?key=$GEMINI_API_KEY" \
  -H "X-Goog-Upload-Protocol: resumable" \
  -H "X-Goog-Upload-Command: start" \
  -H "X-Goog-Upload-Header-Content-Length: $FILESIZE" \
  -H "X-Goog-Upload-Header-Content-Type: video/mp4" \
  -H "Content-Type: application/json" \
  -d "{\"file\": {\"display_name\": \"test_video.mp4\"}}" \
  -D -)

UPLOAD_URL=$(echo "$UPLOAD_INIT" | grep -i 'x-goog-upload-url' | sed 's/.*: //' | tr -d '\r')
if [ -z "$UPLOAD_URL" ]; then
  echo "   FAILED: no upload URL"
  rm -f "$OUTFILE"
  exit 1
fi

UPLOAD_RESULT=$(curl -s -X POST "$UPLOAD_URL" \
  -H "Content-Length: $FILESIZE" \
  -H "X-Goog-Upload-Offset: 0" \
  -H "X-Goog-Upload-Command: upload, finalize" \
  --data-binary "@$OUTFILE")

FILE_URI=$(echo "$UPLOAD_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['file']['uri'])" 2>/dev/null)
if [ -z "$FILE_URI" ]; then
  echo "   FAILED: upload failed"
  echo "   Response: $UPLOAD_RESULT"
  rm -f "$OUTFILE"
  exit 1
fi
echo "   OK: $FILE_URI"
rm -f "$OUTFILE"

echo ""
echo "3. Waiting for processing..."
FILE_NAME=$(echo "$FILE_URI" | rev | cut -d'/' -f1 | rev)
for i in $(seq 1 30); do
  STATE=$(curl -s "https://generativelanguage.googleapis.com/v1beta/files/$FILE_NAME?key=$GEMINI_API_KEY" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('state','UNKNOWN'))" 2>/dev/null)
  if [ "$STATE" = "ACTIVE" ]; then
    echo "   OK: ready"
    break
  elif [ "$STATE" = "FAILED" ]; then
    echo "   FAILED: processing failed"
    exit 1
  fi
  sleep 2
done

echo ""
echo "4. Analyzing with Gemini Flash..."

PROMPT='Analyze this short social media video (Instagram Reel or TikTok) from a diet catering brand.

Return ONLY a JSON object with these fields:
{
  "hook_type": "text-overlay | face-to-camera | product-shot | before-after | question | montage-intro | other",
  "hook_text": "what the viewer sees/reads in the first 3 seconds",
  "production_quality": "ugc | semi-pro | professional | studio",
  "format": "talking-head | montage | unboxing | tutorial | behind-scenes | testimonial | day-in-life | food-prep | promo-offer | other",
  "faces_visible": true,
  "brand_visible": true,
  "food_visible": true,
  "text_overlays": ["list of text shown on screen"],
  "music_style": "trending-audio | original | voiceover-only | no-audio | background-chill",
  "cta": "follow | link-in-bio | order-now | swipe | comment | none",
  "duration_seconds": 0,
  "pacing": "fast-cuts | medium | slow-lifestyle",
  "emotional_register": "funny | aspirational | educational | raw-authentic | promotional | aesthetic",
  "summary": "1 sentence: what this video is about and what it tries to achieve"
}

Respond with ONLY the JSON. No commentary.'

BODY=$(python3 -c "
import json
body = {
    'contents': [{'parts': [
        {'file_data': {'mime_type': 'video/mp4', 'file_uri': '$FILE_URI'}},
        {'text': '''$PROMPT'''}
    ]}],
    'generationConfig': {'temperature': 0.1, 'maxOutputTokens': 800}
}
print(json.dumps(body))
")

TMPBODY="/tmp/gemini_req_$$.json"
echo "$BODY" > "$TMPBODY"

RESULT=$(curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "@$TMPBODY")
rm -f "$TMPBODY"

echo ""
echo "=== ANALYSIS RESULT ==="
echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
text = data.get('candidates',[{}])[0].get('content',{}).get('parts',[{}])[0].get('text','')
try:
    import re
    match = re.search(r'\{[\s\S]*\}', text)
    if match:
        parsed = json.loads(match.group())
        print(json.dumps(parsed, indent=2, ensure_ascii=False))
    else:
        print(text)
except:
    print(text)
"
