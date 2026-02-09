#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Sketchfab Model Downloader for Tanzania Water Grid Mini Demo
# Usage: bash download_models.sh YOUR_SKETCHFAB_API_TOKEN
# ═══════════════════════════════════════════════════════════

TOKEN="$1"
if [ -z "$TOKEN" ]; then
  echo "Usage: bash download_models.sh YOUR_SKETCHFAB_API_TOKEN"
  exit 1
fi

MODELS_DIR="public/models"
mkdir -p "$MODELS_DIR"

download_model() {
  local MODEL_ID="$1"
  local MODEL_NAME="$2"
  local OUTPUT_NAME="$3"

  echo ""
  echo "━━━ Downloading: $MODEL_NAME ━━━"

  # Get download URL from Sketchfab API
  RESPONSE=$(curl -s -H "Authorization: Token $TOKEN" \
    "https://api.sketchfab.com/v3/models/$MODEL_ID/download")

  # Extract glTF download URL
  GLTF_URL=$(echo "$RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    gltf = data.get('gltf', {})
    url = gltf.get('url', '')
    print(url)
except:
    print('')
" 2>/dev/null)

  if [ -z "$GLTF_URL" ]; then
    echo "  ERROR: Could not get download URL for $MODEL_NAME"
    echo "  Response: $RESPONSE"
    return 1
  fi

  echo "  Downloading glTF archive..."
  curl -L -o "$MODELS_DIR/${OUTPUT_NAME}.zip" "$GLTF_URL"

  echo "  Extracting..."
  mkdir -p "$MODELS_DIR/${OUTPUT_NAME}_temp"
  unzip -o -q "$MODELS_DIR/${OUTPUT_NAME}.zip" -d "$MODELS_DIR/${OUTPUT_NAME}_temp"

  # Find the .gltf or .glb file
  GLB_FILE=$(find "$MODELS_DIR/${OUTPUT_NAME}_temp" -name "*.glb" -print -quit 2>/dev/null)
  GLTF_FILE=$(find "$MODELS_DIR/${OUTPUT_NAME}_temp" -name "*.gltf" -print -quit 2>/dev/null)

  if [ -n "$GLB_FILE" ]; then
    cp "$GLB_FILE" "$MODELS_DIR/${OUTPUT_NAME}.glb"
    echo "  Saved: $MODELS_DIR/${OUTPUT_NAME}.glb"
  elif [ -n "$GLTF_FILE" ]; then
    # Copy entire folder for gltf (needs textures/bin files)
    GLTF_DIR=$(dirname "$GLTF_FILE")
    mkdir -p "$MODELS_DIR/${OUTPUT_NAME}"
    cp -r "$GLTF_DIR/"* "$MODELS_DIR/${OUTPUT_NAME}/"
    echo "  Saved: $MODELS_DIR/${OUTPUT_NAME}/ (gltf folder)"
  else
    echo "  WARNING: No .glb or .gltf file found in archive"
  fi

  # Cleanup
  rm -rf "$MODELS_DIR/${OUTPUT_NAME}_temp" "$MODELS_DIR/${OUTPUT_NAME}.zip"
  echo "  Done!"
}

# ── Download the 3 available models ──
download_model "94a3dfb06fc2480fb19f1db3efa83169" "GoldenEye Dam" "dam"
download_model "3b56cf2037ab432397cc9f9c9e1ab18e" "Islington Canal" "canal"
download_model "db7179b9b4e74ea3b2c04708dd5d473d" "Polish Housing Estate" "homes"

echo ""
echo "═══════════════════════════════════════════"
echo "  Download complete!"
echo "  3 non-downloadable models (pump, treatment, lake)"
echo "  will use enhanced placeholders in the scene."
echo "═══════════════════════════════════════════"
