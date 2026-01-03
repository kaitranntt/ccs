#!/bin/bash
# CCS Dev Symlink Setup
# Creates symlinks for testing dev version with 'ccs' command
#
# Usage: ./scripts/dev-symlink.sh [--restore]
#
# Without --restore: Creates symlink from global 'ccs' to dist/ccs.js
# With --restore: Restores original global 'ccs' from backup

set -euo pipefail

RESTORE=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --restore) RESTORE=true ;;
        -h|--help)
            echo "Usage: $0 [--restore]"
            echo ""
            echo "Create symlink for dev testing:"
            echo "  $0"
            echo ""
            echo "Restore original global ccs:"
            echo "  $0 --restore"
            exit 0
            ;;
        *)
            echo "[X] Unknown option: $arg"
            echo "Use --help for usage"
            exit 1
            ;;
    esac
done

# Get to the right directory
cd "$(dirname "$0")/.."

# Check if dist/ccs.js exists
if [ ! -f "dist/ccs.js" ]; then
    echo "[X] ERROR: dist/ccs.js not found. Run 'bun run build' first."
    exit 1
fi

# Get absolute path to dev ccs.js
DEV_CCS_PATH="$(pwd)/dist/ccs.js"

# Find global ccs installation
GLOBAL_CCS_PATH=$(which ccs 2>/dev/null || true)

if [ -z "$GLOBAL_CCS_PATH" ]; then
    echo "[X] ERROR: No global 'ccs' installation found."
    echo "Install CCS globally first: npm install -g @kaitranntt/ccs"
    exit 1
fi

echo "[i] Found global ccs at: $GLOBAL_CCS_PATH"

if [ "$RESTORE" = true ]; then
    # Restore original ccs from backup
    BACKUP_PATH="${GLOBAL_CCS_PATH}.backup-dev"

    if [ ! -f "$BACKUP_PATH" ] && [ ! -L "$BACKUP_PATH" ]; then
        echo "[X] ERROR: No backup found at $BACKUP_PATH"
        echo "Cannot restore - backup may have been deleted"
        exit 1
    fi

    echo "[i] Restoring original ccs from backup..."
    rm -f "$GLOBAL_CCS_PATH"
    if [ -L "$BACKUP_PATH" ]; then
        # Restore symlink
        cp -P "$BACKUP_PATH" "$GLOBAL_CCS_PATH"
    else
        # Restore regular file
        cp "$BACKUP_PATH" "$GLOBAL_CCS_PATH"
    fi
    chmod +x "$GLOBAL_CCS_PATH"
    rm -f "$BACKUP_PATH"

    echo "[OK] Restored original global ccs"
    echo "Run 'ccs --version' to verify"
    exit 0
fi

# Check if already symlinked to our dev version
if [ -L "$GLOBAL_CCS_PATH" ]; then
    CURRENT_TARGET=$(readlink "$GLOBAL_CCS_PATH" 2>/dev/null || true)
    if [ "$CURRENT_TARGET" = "$DEV_CCS_PATH" ]; then
        echo "[OK] Already symlinked to dev version"
        exit 0
    fi
fi

# Create backup of current global ccs
BACKUP_PATH="${GLOBAL_CCS_PATH}.backup-dev"
if [ -f "$BACKUP_PATH" ] || [ -L "$BACKUP_PATH" ]; then
    echo "[i] Backup already exists, skipping backup creation"
else
    echo "[i] Creating backup of current global ccs..."
    cp -P "$GLOBAL_CCS_PATH" "$BACKUP_PATH"
    echo "[OK] Backup created at: $BACKUP_PATH"
fi

# Create symlink
echo "[i] Creating symlink to dev version..."
rm -f "$GLOBAL_CCS_PATH"
ln -s "$DEV_CCS_PATH" "$GLOBAL_CCS_PATH"

echo "[OK] Symlinked global 'ccs' to dev version"
echo ""
echo "Now you can test dev changes with: ccs <command>"
echo "To restore original: $0 --restore"
echo ""
echo "Test with: ccs --version"
