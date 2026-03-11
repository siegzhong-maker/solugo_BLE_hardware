#!/usr/bin/env bash
# 将 吃/ 与 摸/ 下的 PNG 帧序列合成为 吃演示.gif、摸演示.gif
# 在 比卡丘动画导出 目录下执行，不删除原有 PNG。

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 检测可用工具：优先 ImageMagick (convert 或 magick)，否则 ffmpeg
CONVERT_CMD=""
if command -v convert &>/dev/null; then
  CONVERT_CMD="convert"
elif command -v magick &>/dev/null; then
  CONVERT_CMD="magick"
fi

do_imagemagick() {
  local frames="$1"
  local out="$2"
  $CONVERT_CMD -delay 4 -loop 0 $frames "$out"
}

do_ffmpeg() {
  local dir="$1"
  local pattern="$2"
  local out="$3"
  local palette="$SCRIPT_DIR/palette_tmp.png"
  ffmpeg -y -framerate 10 -i "${dir}/${pattern}" -vf "palettegen=stats_mode=diff" "$palette" 2>/dev/null
  ffmpeg -y -framerate 10 -i "${dir}/${pattern}" -i "$palette" -lavfi "paletteuse=dither=bayer" "$out" 2>/dev/null
  rm -f "$palette"
}

# 吃: flog_eat_001.png .. flog_eat_0024.png，按数字排序
EAT_DIR="吃"
EAT_OUT="吃演示.gif"
EAT_FILES=$(ls "$EAT_DIR"/flog_eat_*.png 2>/dev/null | sort -V)
if [[ -z "$EAT_FILES" ]]; then
  echo "错误: 未找到 $EAT_DIR/flog_eat_*.png" >&2
  exit 1
fi

# 摸: frog_mo_001.png .. frog_mo_0024.png
MO_DIR="摸"
MO_OUT="摸演示.gif"
MO_FILES=$(ls "$MO_DIR"/frog_mo_*.png 2>/dev/null | sort -V)
if [[ -z "$MO_FILES" ]]; then
  echo "错误: 未找到 $MO_DIR/frog_mo_*.png" >&2
  exit 1
fi

if [[ -n "$CONVERT_CMD" ]]; then
  do_imagemagick "$EAT_FILES" "$EAT_OUT"
  echo "已生成: $EAT_OUT"
  do_imagemagick "$MO_FILES" "$MO_OUT"
  echo "已生成: $MO_OUT"
elif command -v ffmpeg &>/dev/null; then
  do_ffmpeg "$EAT_DIR" "flog_eat_%03d.png" "$EAT_OUT"
  echo "已生成: $EAT_OUT"
  do_ffmpeg "$MO_DIR" "frog_mo_%03d.png" "$MO_OUT"
  echo "已生成: $MO_OUT"
else
  echo "错误: 未找到 ImageMagick (convert/magick) 或 ffmpeg" >&2
  echo "请安装其一后重试，例如: brew install imagemagick  或  brew install ffmpeg" >&2
  exit 1
fi

echo "完成。"

