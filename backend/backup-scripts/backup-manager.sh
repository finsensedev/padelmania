#!/bin/bash

###############################################################################
# Tudor Padel - Backup Manager
# 
# Description: Easy interface for managing backups
#
# Usage: ./backup-manager.sh [command]
#
# Commands:
#   backup-now    - Run backup immediately (weekly)
#   view-gdrive   - View backups in Google Drive
#   list-local    - List local backups
#   cleanup       - Clean up old backups
#   status        - Check backup system status
#   logs          - View recent logs
#   test-restore  - Test restore from latest backup
#
# Author: Tudor Padel DevOps Team
# Version: 1.0
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load configuration
if [ -f "$SCRIPT_DIR/.env.backup" ]; then
    source "$SCRIPT_DIR/.env.backup"
else
    echo -e "${RED}ERROR: .env.backup not found!${NC}"
    exit 1
fi

GDRIVE_REMOTE=${GDRIVE_REMOTE_NAME:-gdrive}
GDRIVE_FOLDER=${GDRIVE_BACKUP_FOLDER:-tudor-padel-backups}

###############################################################################
# Functions
###############################################################################

show_usage() {
    echo -e "${BLUE}Tudor Padel Backup Manager${NC}"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  backup-now      Run a backup immediately"
    echo "  view-gdrive     View backups in Google Drive"
    echo "  list-local      List local backups"
    echo "  cleanup         Clean up old backups"
    echo "  status          Check backup system status"
    echo "  logs            View recent backup logs"
    echo "  test-restore    Test restore from latest backup"
    echo "  schedule        View backup schedule"
    echo ""
}

backup_now() {
    echo -e "${YELLOW}Running backup now...${NC}"
    "$SCRIPT_DIR/backup-database.sh" weekly
}

view_gdrive() {
    echo -e "${YELLOW}Backups in Google Drive:${NC}"
    echo ""
    echo "Weekly backups:"
    rclone lsl "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}/weekly" 2>/dev/null | tail -20 || echo "No weekly backups found"
    echo ""
    echo "Daily backups:"
    rclone lsl "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}/daily" 2>/dev/null | tail -10 || echo "No daily backups found"
    echo ""
    echo "Monthly backups:"
    rclone lsl "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}/monthly" 2>/dev/null | tail -10 || echo "No monthly backups found"
    echo ""
    echo -e "${BLUE}Google Drive Space:${NC}"
    rclone about "${GDRIVE_REMOTE}:" 2>/dev/null || echo "Unable to fetch space info"
}

list_local() {
    echo -e "${YELLOW}Local backups:${NC}"
    echo ""
    if [ -d "$BACKUP_DIR/weekly" ]; then
        echo "Weekly backups:"
        ls -lh "$BACKUP_DIR/weekly" 2>/dev/null | tail -20 || echo "No weekly backups"
        echo ""
    fi
    if [ -d "$BACKUP_DIR/daily" ]; then
        echo "Daily backups:"
        ls -lh "$BACKUP_DIR/daily" 2>/dev/null | tail -10 || echo "No daily backups"
        echo ""
    fi
    if [ -d "$BACKUP_DIR/monthly" ]; then
        echo "Monthly backups:"
        ls -lh "$BACKUP_DIR/monthly" 2>/dev/null | tail -10 || echo "No monthly backups"
    fi
}

cleanup_backups() {
    echo -e "${YELLOW}Cleaning up old backups...${NC}"
    
    # Clean local
    echo "Cleaning local backups older than ${BACKUP_RETENTION_DAYS} days..."
    find "$BACKUP_DIR/daily" -type f -mtime +${BACKUP_RETENTION_DAYS} -delete 2>/dev/null || true
    find "$BACKUP_DIR/weekly" -type f -mtime +$((WEEKLY_RETENTION_WEEKS * 7)) -delete 2>/dev/null || true
    find "$BACKUP_DIR/monthly" -type f -mtime +$((MONTHLY_RETENTION_MONTHS * 30)) -delete 2>/dev/null || true
    
    # Clean Google Drive
    echo "Cleaning Google Drive backups older than ${GDRIVE_RETENTION_DAYS} days..."
    
    # Get list of old files
    CUTOFF_DATE=$(date -v-${GDRIVE_RETENTION_DAYS}d +%Y-%m-%d 2>/dev/null || date -d "${GDRIVE_RETENTION_DAYS} days ago" +%Y-%m-%d)
    
    echo "Files older than $CUTOFF_DATE will be removed"
    
    rclone delete "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}/daily" --min-age ${GDRIVE_RETENTION_DAYS}d 2>/dev/null || true
    rclone delete "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}/weekly" --min-age ${GDRIVE_RETENTION_DAYS}d 2>/dev/null || true
    
    echo -e "${GREEN}✅ Cleanup complete${NC}"
}

check_status() {
    echo -e "${YELLOW}Backup System Status:${NC}"
    echo ""
    
    # Check rclone
    if command -v rclone >/dev/null 2>&1; then
        echo -e "${GREEN}✅ rclone installed${NC}"
    else
        echo -e "${RED}❌ rclone not installed${NC}"
    fi
    
    # Check Google Drive connection
    if rclone lsd "${GDRIVE_REMOTE}:" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Google Drive connected${NC}"
    else
        echo -e "${RED}❌ Google Drive not connected${NC}"
    fi
    
    # Check database connection
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Database accessible${NC}"
    else
        echo -e "${RED}❌ Database not accessible${NC}"
    fi
    
    # Check launchd job
    if launchctl list | grep -q "com.tudorpadel.weeklybackup"; then
        echo -e "${GREEN}✅ Weekly backup job loaded${NC}"
    else
        echo -e "${YELLOW}⚠️  Weekly backup job not loaded${NC}"
    fi
    
    # Check last backup
    echo ""
    echo "Last backups:"
    if [ -d "$BACKUP_DIR/weekly" ]; then
        LAST_WEEKLY=$(ls -t "$BACKUP_DIR/weekly" 2>/dev/null | head -1)
        if [ -n "$LAST_WEEKLY" ]; then
            echo "  Local weekly: $LAST_WEEKLY"
        fi
    fi
    
    # Check Google Drive
    LAST_GDRIVE=$(rclone lsl "${GDRIVE_REMOTE}:${GDRIVE_FOLDER}/weekly" 2>/dev/null | tail -1 | awk '{print $4}')
    if [ -n "$LAST_GDRIVE" ]; then
        echo "  Google Drive: $LAST_GDRIVE"
    fi
}

view_logs() {
    echo -e "${YELLOW}Recent backup logs:${NC}"
    echo ""
    
    if [ -d "$BACKUP_DIR/logs" ]; then
        LATEST_LOG=$(ls -t "$BACKUP_DIR/logs"/backup_*.log 2>/dev/null | head -1)
        if [ -n "$LATEST_LOG" ]; then
            echo "Showing: $LATEST_LOG"
            echo "----------------------------------------"
            tail -50 "$LATEST_LOG"
        else
            echo "No backup logs found"
        fi
    else
        echo "Log directory not found"
    fi
    
    echo ""
    echo "launchd output logs:"
    if [ -f "$BACKUP_DIR/logs/weekly-backup-stdout.log" ]; then
        tail -20 "$BACKUP_DIR/logs/weekly-backup-stdout.log"
    fi
}

test_restore() {
    echo -e "${YELLOW}Testing restore from latest backup...${NC}"
    echo ""
    
    # Find latest backup
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR/weekly"/*.enc 2>/dev/null | head -1)
    
    if [ -z "$LATEST_BACKUP" ]; then
        echo -e "${RED}No backup files found${NC}"
        exit 1
    fi
    
    echo "Latest backup: $LATEST_BACKUP"
    echo ""
    echo -e "${YELLOW}⚠️  This will test restore to database: tudor_padel_restore_test${NC}"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        "$SCRIPT_DIR/restore-database.sh" "$LATEST_BACKUP" "tudor_padel_restore_test"
    fi
}

view_schedule() {
    echo -e "${YELLOW}Backup Schedule:${NC}"
    echo ""
    echo "Weekly backups: Every Sunday at 2:00 AM"
    echo ""
    echo "launchd job status:"
    launchctl list | grep tudorpadel || echo "No jobs found"
    echo ""
    echo "Next run time: Check system logs"
}

###############################################################################
# Main
###############################################################################

if [ $# -eq 0 ]; then
    show_usage
    exit 0
fi

case "$1" in
    backup-now)
        backup_now
        ;;
    view-gdrive)
        view_gdrive
        ;;
    list-local)
        list_local
        ;;
    cleanup)
        cleanup_backups
        ;;
    status)
        check_status
        ;;
    logs)
        view_logs
        ;;
    test-restore)
        test_restore
        ;;
    schedule)
        view_schedule
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo ""
        show_usage
        exit 1
        ;;
esac
