#!/usr/bin/env bash
# CCS Progress Indicator (bash 3.2+ compatible)
# Simple spinner for long-running operations
# NO external dependencies - ASCII-only for cross-platform compatibility

set -euo pipefail

# Show spinner while a background process is running
# Usage: show_spinner "message" $pid
show_spinner() {
  local message="$1"
  local pid="$2"

  # TTY detection: only animate if stderr is TTY and not in CI
  if [[ ! -t 2 ]] || [[ -n "${CI:-}" ]] || [[ -n "${NO_COLOR:-}" ]]; then
    # Non-TTY: just print message once
    echo "[i] $message..." >&2
    wait "$pid" 2>/dev/null || true
    return
  fi

  # ASCII-only frames for cross-platform compatibility
  local frames=('|' '/' '-' '\\')
  local frame_idx=0
  local start_time=$(date +%s)

  # Animate spinner while process is running
  while kill -0 "$pid" 2>/dev/null; do
    local frame="${frames[$frame_idx]}"
    local elapsed=$(($(date +%s) - start_time))
    printf "\r[%s] %s... (%ds)" "$frame" "$message" "$elapsed" >&2
    frame_idx=$(( (frame_idx + 1) % 4 ))
    sleep 0.1
  done

  # Clear spinner line
  printf "\r\033[K" >&2

  # Wait for process to complete and capture exit code
  wait "$pid" 2>/dev/null || true
}

# Show spinner with success/fail result
# Usage: spinner_with_result "message" "command"
spinner_with_result() {
  local message="$1"
  shift
  local command=("$@")

  local start_time=$(date +%s)

  # TTY detection
  if [[ ! -t 2 ]] || [[ -n "${CI:-}" ]] || [[ -n "${NO_COLOR:-}" ]]; then
    # Non-TTY: just print message and run command
    echo "[i] $message..." >&2
    if "${command[@]}"; then
      echo "[OK] $message" >&2
      return 0
    else
      echo "[X] $message" >&2
      return 1
    fi
  fi

  # Run command in background
  "${command[@]}" &>/dev/null &
  local pid=$!

  # Show spinner
  local frames=('|' '/' '-' '\\')
  local frame_idx=0

  while kill -0 "$pid" 2>/dev/null; do
    local frame="${frames[$frame_idx]}"
    local elapsed=$(($(date +%s) - start_time))
    printf "\r[%s] %s... (%ds)" "$frame" "$message" "$elapsed" >&2
    frame_idx=$(( (frame_idx + 1) % 4 ))
    sleep 0.1
  done

  # Clear spinner line
  printf "\r\033[K" >&2

  # Check result
  if wait "$pid" 2>/dev/null; then
    local elapsed=$(($(date +%s) - start_time))
    echo "[OK] $message (${elapsed}s)" >&2
    return 0
  else
    echo "[X] $message" >&2
    return 1
  fi
}

# Simple progress counter (for multi-step operations)
# Usage: show_progress_step 3 10 "Checking configuration"
show_progress_step() {
  local current="$1"
  local total="$2"
  local message="$3"

  # TTY detection
  if [[ ! -t 2 ]] || [[ -n "${CI:-}" ]]; then
    echo "[${current}/${total}] $message" >&2
    return
  fi

  # Show progress with carriage return (can be overwritten)
  printf "\r[%d/%d] %s..." "$current" "$total" "$message" >&2
}

# Clear progress line
clear_progress() {
  if [[ -t 2 ]] && [[ -z "${CI:-}" ]]; then
    printf "\r\033[K" >&2
  fi
}
