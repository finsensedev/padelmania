#!/bin/bash

###############################################################################
# Tudor Padel Backup Health Check Script
# 
# Description: Monitors backup health and sends alerts if issues detected
#
# Usage: ./check-backup-health.sh
#
# Author: Tudor Padel DevOps Team
# Version: 1.0
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load configuration
if [ -f "$SCRIPT_DIR/.env.backup" ]; then
    source "$SCRIPT_DIR/.env.backup"
else
    echo "ERROR: .env.backup file not found!"
    exit 1
fi

# Map DB_* variables to BACKUP_DB_* for backward compatibility
BACKUP_DB_HOST="${DB_HOST:-localhost}"
BACKUP_DB_PORT="${DB_PORT:-5432}"
BACKUP_DB_NAME="${DB_NAME:-tudor_padel}"
BACKUP_DB_USER="${DB_USER:-postgres}"
BACKUP_DB_PASSWORD="${DB_PASSWORD}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Variables
ISSUES=()
WARNINGS=()
DATE=$(date +%Y%m%d)
LOG_FILE="${BACKUP_DIR}/logs/health_check_${DATE}.log"

###############################################################################
# Functions
###############################################################################

log() {
    echo -e "$@" | tee -a "$LOG_FILE"
}

add_issue() {
    ISSUES+=("$1")
    log "${RED}✗ ISSUE: $1${NC}"
}

add_warning() {
    WARNINGS+=("$1")
    log "${YELLOW}⚠ WARNING: $1${NC}"
}

add_success() {
    log "${GREEN}✓ $1${NC}"
}

###############################################################################
# Health Checks
###############################################################################

echo "=========================================="
echo "Tudor Padel Backup Health Check"
echo "=========================================="
echo "Date: $(date)"
echo ""

# Check 1: Backup directories exist
log "Checking backup directories..."
if [ -d "$BACKUP_DIR" ]; then
    add_success "Backup directory exists"
else
    add_issue "Backup directory not found: $BACKUP_DIR"
fi

# Check 2: Recent backups exist
log "\nChecking for recent backups..."

# Check daily backups
LATEST_DAILY=$(find "${BACKUP_DIR}/daily" -name "*.enc" -type f -mtime -2 2>/dev/null | head -n 1)
if [ -n "$LATEST_DAILY" ]; then
    DAILY_AGE=$(find "${BACKUP_DIR}/daily" -name "*.enc" -type f -mtime -2 | wc -l)
    add_success "Daily backup found (within last 48 hours)"
    log "   Latest: $(basename $LATEST_DAILY)"
else
    add_issue "No daily backup found in the last 48 hours"
fi

# Check weekly backups
LATEST_WEEKLY=$(find "${BACKUP_DIR}/weekly" -name "*.enc" -type f -mtime -8 2>/dev/null | head -n 1)
if [ -n "$LATEST_WEEKLY" ]; then
    add_success "Weekly backup found (within last 8 days)"
else
    add_warning "No weekly backup found in the last 8 days"
fi

# Check 3: Backup file sizes
log "\nChecking backup file sizes..."

if [ -n "$LATEST_DAILY" ]; then
    BACKUP_SIZE=$(du -h "$LATEST_DAILY" | cut -f1)
    BACKUP_SIZE_BYTES=$(stat -f%z "$LATEST_DAILY" 2>/dev/null || stat -c%s "$LATEST_DAILY")
    
    if [ "$BACKUP_SIZE_BYTES" -lt 1000000 ]; then  # Less than 1MB
        add_issue "Backup file suspiciously small: $BACKUP_SIZE"
    else
        add_success "Backup file size: $BACKUP_SIZE"
    fi
    
    # Check if backup size changed significantly
    PREV_BACKUP=$(find "${BACKUP_DIR}/daily" -name "*.enc" -type f -mtime -3 -mtime +1 2>/dev/null | head -n 1)
    if [ -n "$PREV_BACKUP" ]; then
        PREV_SIZE=$(stat -f%z "$PREV_BACKUP" 2>/dev/null || stat -c%s "$PREV_BACKUP")
        SIZE_DIFF=$(echo "scale=2; ($BACKUP_SIZE_BYTES - $PREV_SIZE) / $PREV_SIZE * 100" | bc 2>/dev/null || echo "0")
        SIZE_DIFF_ABS=$(echo "$SIZE_DIFF" | tr -d '-')
        
        if (( $(echo "$SIZE_DIFF_ABS > 30" | bc -l) )); then
            add_warning "Backup size changed by ${SIZE_DIFF}% compared to previous backup"
        fi
    fi
fi

# Check 4: Disk space
log "\nChecking disk space..."

AVAILABLE_SPACE=$(df -BG "$BACKUP_DIR" | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$AVAILABLE_SPACE" -lt 5 ]; then
    add_issue "Low disk space: ${AVAILABLE_SPACE}GB available"
elif [ "$AVAILABLE_SPACE" -lt 10 ]; then
    add_warning "Disk space getting low: ${AVAILABLE_SPACE}GB available"
else
    add_success "Sufficient disk space: ${AVAILABLE_SPACE}GB available"
fi

# Check 5: Backup integrity (checksums)
log "\nChecking backup integrity..."

if [ -n "$LATEST_DAILY" ]; then
    CHECKSUM_FILE="${LATEST_DAILY}.sha256"
    if [ -f "$CHECKSUM_FILE" ]; then
        add_success "Checksum file exists"
        STORED_CHECKSUM=$(cat "$CHECKSUM_FILE")
        CURRENT_CHECKSUM=$(sha256sum "$LATEST_DAILY" | cut -d' ' -f1)
        
        if [ "$STORED_CHECKSUM" = "$CURRENT_CHECKSUM" ]; then
            add_success "Checksum verification passed"
        else
            add_issue "Checksum mismatch - backup file may be corrupted!"
        fi
    else
        add_warning "Checksum file not found"
    fi
fi

# Check 6: Cloud backup status
if [ "${CLOUD_BACKUP_ENABLED:-false}" = "true" ]; then
    log "\nChecking cloud backup status..."
    
    if command -v aws >/dev/null 2>&1; then
        # Check if latest backup is in S3
        LATEST_BACKUP_NAME=$(basename "$LATEST_DAILY" 2>/dev/null)
        if [ -n "$LATEST_BACKUP_NAME" ]; then
            S3_CHECK=$(aws s3 ls "s3://${AWS_S3_BUCKET}/daily/${LATEST_BACKUP_NAME}" 2>/dev/null || echo "")
            
            if [ -n "$S3_CHECK" ]; then
                add_success "Latest backup found in S3"
            else
                add_issue "Latest backup not found in S3"
            fi
        fi
    else
        add_warning "AWS CLI not available, cannot check cloud backup"
    fi
fi

# Check 7: Database connectivity
log "\nChecking database connectivity..."

export PGPASSWORD="$BACKUP_DB_PASSWORD"
if psql -h "$BACKUP_DB_HOST" -p "$BACKUP_DB_PORT" -U "$BACKUP_DB_USER" -d "$BACKUP_DB_NAME" -c "SELECT 1;" >/dev/null 2>&1; then
    add_success "Database connection successful"
else
    add_issue "Cannot connect to database"
fi

# Check 8: Backup logs for errors
log "\nChecking recent backup logs for errors..."

RECENT_LOG=$(find "${BACKUP_DIR}/logs" -name "backup_*.log" -type f -mtime -1 | head -n 1)
if [ -n "$RECENT_LOG" ]; then
    ERROR_COUNT=$(grep -c "ERROR" "$RECENT_LOG" 2>/dev/null || echo "0")
    if [ "$ERROR_COUNT" -gt 0 ]; then
        add_warning "Found $ERROR_COUNT errors in recent backup log"
        log "   Check: $RECENT_LOG"
    else
        add_success "No errors in recent backup log"
    fi
fi

# Check 9: Cron job status
log "\nChecking cron job configuration..."

if crontab -l 2>/dev/null | grep -q "tudor-padel"; then
    add_success "Backup cron jobs are configured"
    CRON_COUNT=$(crontab -l | grep -c "tudor-padel")
    log "   Found $CRON_COUNT cron job(s)"
else
    add_warning "No backup cron jobs found"
fi

# Check 10: Old backups cleanup
log "\nChecking old backups..."

OLD_DAILY=$(find "${BACKUP_DIR}/daily" -name "*.enc" -type f -mtime +${DAILY_RETENTION_DAYS:-30} 2>/dev/null | wc -l)
if [ "$OLD_DAILY" -gt 0 ]; then
    add_warning "$OLD_DAILY daily backups older than retention period (cleanup may be needed)"
fi

###############################################################################
# Summary
###############################################################################

echo ""
echo "=========================================="
echo "Health Check Summary"
echo "=========================================="

if [ ${#ISSUES[@]} -eq 0 ] && [ ${#WARNINGS[@]} -eq 0 ]; then
    log "${GREEN}✓ All checks passed - Backup system healthy!${NC}"
    EXIT_CODE=0
elif [ ${#ISSUES[@]} -eq 0 ]; then
    log "${YELLOW}⚠ ${#WARNINGS[@]} warning(s) found${NC}"
    for warning in "${WARNINGS[@]}"; do
        log "  - $warning"
    done
    EXIT_CODE=1
else
    log "${RED}✗ ${#ISSUES[@]} critical issue(s) found${NC}"
    for issue in "${ISSUES[@]}"; do
        log "  - $issue"
    done
    
    if [ ${#WARNINGS[@]} -gt 0 ]; then
        log ""
        log "${YELLOW}⚠ ${#WARNINGS[@]} warning(s) also found${NC}"
        for warning in "${WARNINGS[@]}"; do
            log "  - $warning"
        done
    fi
    EXIT_CODE=2
fi

echo ""
echo "Report saved to: $LOG_FILE"
echo ""

###############################################################################
# Send notification if issues found
###############################################################################

if [ ${#ISSUES[@]} -gt 0 ]; then
    if [ "${EMAIL_NOTIFICATIONS_ENABLED:-false}" = "true" ]; then
        SUBJECT="ALERT: Backup Health Check Failed - Tudor Padel"
        BODY="Backup health check detected ${#ISSUES[@]} critical issue(s):\n\n"
        for issue in "${ISSUES[@]}"; do
            BODY="${BODY}- $issue\n"
        done
        BODY="${BODY}\nPlease investigate immediately.\n\nLog file: $LOG_FILE"
        
        echo -e "$BODY" | mail -s "$SUBJECT" "$BACKUP_ALERT_EMAIL" 2>/dev/null || true
    fi
fi

exit $EXIT_CODE
