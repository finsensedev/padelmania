#!/bin/bash

###############################################################################
# Tudor Padel Database Backup Script
# 
# Description: Automated PostgreSQL backup script with encryption, compression,
#              cloud upload, and notifications
#
# Usage: ./backup-database.sh [daily|weekly|monthly]
#
# Author: Tudor Padel DevOps Team
# Version: 1.0
# Last Updated: 2025-10-31
###############################################################################

set -euo pipefail  # Exit on error, undefined variables, and pipe failures

###############################################################################
# CONFIGURATION
###############################################################################

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables
if [ -f "$SCRIPT_DIR/.env.backup" ]; then
    source "$SCRIPT_DIR/.env.backup"
else
    echo "ERROR: .env.backup file not found!"
    echo "Please copy backup-config.env.example to .env.backup and configure it."
    exit 1
fi

# Map DB_* variables to BACKUP_DB_* for backward compatibility
BACKUP_DB_HOST="${DB_HOST:-localhost}"
BACKUP_DB_PORT="${DB_PORT:-5432}"
BACKUP_DB_NAME="${DB_NAME:-tudor_padel}"
BACKUP_DB_USER="${DB_USER:-postgres}"
BACKUP_DB_PASSWORD="${DB_PASSWORD}"

# Backup type (daily, weekly, monthly)
BACKUP_TYPE="${1:-daily}"

# Date and timestamp
DATE=$(date +%Y%m%d)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATETIME_READABLE=$(date "+%Y-%m-%d %H:%M:%S")

# Backup filename
BACKUP_FILENAME="tudor_padel_${BACKUP_TYPE}_${TIMESTAMP}.dump"
BACKUP_FILENAME_COMPRESSED="${BACKUP_FILENAME}.gz"
BACKUP_FILENAME_ENCRYPTED="${BACKUP_FILENAME_COMPRESSED}.enc"

# Backup directories
DAILY_DIR="${BACKUP_DIR}/daily"
WEEKLY_DIR="${BACKUP_DIR}/weekly"
MONTHLY_DIR="${BACKUP_DIR}/monthly"
TEMP_DIR="${BACKUP_DIR}/temp"
LOG_DIR="${BACKUP_DIR}/logs"

# Log file
LOG_FILE="${LOG_DIR}/backup_${DATE}.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

###############################################################################
# FUNCTIONS
###############################################################################

# Logging function
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

log_info() {
    log "INFO" "$@"
}

log_error() {
    log "ERROR" "${RED}$@${NC}"
}

log_success() {
    log "SUCCESS" "${GREEN}$@${NC}"
}

log_warning() {
    log "WARNING" "${YELLOW}$@${NC}"
}

# Error handler
error_handler() {
    log_error "Backup failed at line $1"
    cleanup
    send_notification "FAILURE" "Backup failed at line $1"
    exit 1
}

trap 'error_handler ${LINENO}' ERR

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f "${TEMP_DIR}/${BACKUP_FILENAME}"
    rm -f "${TEMP_DIR}/${BACKUP_FILENAME_COMPRESSED}"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_tools=()
    
    command -v pg_dump >/dev/null 2>&1 || missing_tools+=("pg_dump")
    command -v gzip >/dev/null 2>&1 || missing_tools+=("gzip")
    command -v openssl >/dev/null 2>&1 || missing_tools+=("openssl")
    
    # Check for rclone if cloud backup is enabled (for Google Drive or OneDrive)
    if [ "${CLOUD_BACKUP_ENABLED:-false}" = "true" ]; then
        local cloud_providers="${CLOUD_PROVIDERS:-${CLOUD_PROVIDER:-none}}"
        if [[ "$cloud_providers" =~ (google-drive|onedrive) ]]; then
            command -v rclone >/dev/null 2>&1 || missing_tools+=("rclone")
        fi
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        log_error "Please install missing tools and try again."
        exit 1
    fi
    
    log_success "All prerequisites met"
}

# Create directories if they don't exist
create_directories() {
    log_info "Creating backup directories..."
    mkdir -p "$DAILY_DIR" "$WEEKLY_DIR" "$MONTHLY_DIR" "$TEMP_DIR" "$LOG_DIR"
    chmod 700 "$BACKUP_DIR"
    log_success "Directories created"
}

# Check disk space
check_disk_space() {
    log_info "Checking disk space..."
    
    # macOS-compatible disk space check
    local available_space=$(df -k "$BACKUP_DIR" | awk 'NR==2 {print $4}')
    local available_gb=$((available_space / 1024 / 1024))
    local required_space=5  # Minimum 5GB required
    
    if [ "$available_gb" -lt "$required_space" ]; then
        log_error "Insufficient disk space. Available: ${available_gb}GB, Required: ${required_space}GB"
        send_notification "FAILURE" "Insufficient disk space for backup"
        exit 1
    fi
    
    log_success "Sufficient disk space available: ${available_gb}GB"
}

# Database connection test
test_database_connection() {
    log_info "Testing database connection..."
    
    export PGPASSWORD="$BACKUP_DB_PASSWORD"
    
    if pg_dump --host="$BACKUP_DB_HOST" \
               --port="$BACKUP_DB_PORT" \
               --username="$BACKUP_DB_USER" \
               --dbname="$BACKUP_DB_NAME" \
               --schema-only \
               --no-owner \
               --no-privileges \
               > /dev/null 2>&1; then
        log_success "Database connection successful"
    else
        log_error "Failed to connect to database"
        send_notification "FAILURE" "Database connection failed"
        exit 1
    fi
}

# Perform database backup
backup_database() {
    {
        log_info "Starting database backup..."
        log_info "Backup type: $BACKUP_TYPE"
        log_info "Timestamp: $DATETIME_READABLE"
    } >&2
    
    local backup_file="${TEMP_DIR}/${BACKUP_FILENAME}"
    
    export PGPASSWORD="$BACKUP_DB_PASSWORD"
    
    # Run pg_dump
    pg_dump --host="$BACKUP_DB_HOST" \
            --port="$BACKUP_DB_PORT" \
            --username="$BACKUP_DB_USER" \
            --dbname="$BACKUP_DB_NAME" \
            --format=custom \
            --compress=0 \
            --verbose \
            --file="$backup_file" \
            2>> "$LOG_FILE"
    
    local backup_size=$(du -h "$backup_file" | cut -f1)
    log_success "Database backup completed. Size: $backup_size" >&2
    
    echo "$backup_file"
}

# Compress backup
compress_backup() {
    local input_file=$1
    local output_file="${input_file}.gz"
    
    log_info "Compressing backup..." >&2
    
    gzip -${BACKUP_COMPRESSION_LEVEL:-6} -c "$input_file" > "$output_file"
    
    local original_size=$(du -h "$input_file" | cut -f1)
    local compressed_size=$(du -h "$output_file" | cut -f1)
    
    log_success "Compression completed. Original: $original_size, Compressed: $compressed_size" >&2
    
    # Remove uncompressed file
    rm -f "$input_file"
    
    echo "$output_file"
}

# Encrypt backup
encrypt_backup() {
    local input_file=$1
    local output_file="${input_file}.enc"
    
    log_info "Encrypting backup..." >&2
    
    if [ "${BACKUP_ENCRYPT:-true}" = "true" ]; then
        export BACKUP_ENCRYPTION_PASSWORD
        openssl enc -aes-256-cbc -salt -pbkdf2 \
            -in "$input_file" \
            -out "$output_file" \
            -pass env:BACKUP_ENCRYPTION_PASSWORD \
            2>> "$LOG_FILE"
        
        log_success "Encryption completed" >&2
        
        # Remove unencrypted file
        rm -f "$input_file"
        
        echo "$output_file"
    else
        log_warning "Encryption disabled. This is NOT recommended for production!" >&2
        echo "$input_file"
    fi
}

# Move backup to appropriate directory
move_backup() {
    local temp_file=$1
    local dest_dir
    
    case "$BACKUP_TYPE" in
        daily)
            dest_dir="$DAILY_DIR"
            ;;
        weekly)
            dest_dir="$WEEKLY_DIR"
            ;;
        monthly)
            dest_dir="$MONTHLY_DIR"
            ;;
        *)
            log_error "Invalid backup type: $BACKUP_TYPE"
            exit 1
            ;;
    esac
    
    local dest_file="${dest_dir}/$(basename "$temp_file")"
    
    log_info "Moving backup to $dest_dir..." >&2
    mv "$temp_file" "$dest_file"
    chmod 600 "$dest_file"
    
    log_success "Backup moved to: $dest_file" >&2
    echo "$dest_file"
}

# Upload to cloud storage
upload_to_cloud() {
    local backup_file=$1
    
    if [ "${CLOUD_BACKUP_ENABLED:-false}" != "true" ]; then
        log_info "Cloud backup disabled, skipping upload"
        return 0
    fi
    
    # Support multiple cloud providers (comma-separated)
    local cloud_providers="${CLOUD_PROVIDERS:-${CLOUD_PROVIDER:-none}}"
    
    log_info "Uploading backup to cloud provider(s): $cloud_providers"
    
    # Split by comma and upload to each provider
    IFS=',' read -ra PROVIDERS <<< "$cloud_providers"
    local upload_success=0
    local upload_failed=0
    
    for provider in "${PROVIDERS[@]}"; do
        # Trim whitespace
        provider=$(echo "$provider" | xargs)
        
        log_info "Uploading to: $provider"
        
        case "$provider" in
            google-drive)
                if upload_to_google_drive "$backup_file"; then
                    ((upload_success++))
                else
                    ((upload_failed++))
                fi
                ;;
            onedrive)
                if upload_to_onedrive "$backup_file"; then
                    ((upload_success++))
                else
                    ((upload_failed++))
                fi
                ;;
            none)
                log_info "Cloud provider set to 'none', skipping upload"
                ;;
            *)
                log_warning "Unknown cloud provider: $provider (only google-drive and onedrive supported)"
                ((upload_failed++))
                ;;
        esac
    done
    
    log_info "Upload summary: $upload_success succeeded, $upload_failed failed"
    
    # Return success if at least one upload succeeded
    [ $upload_success -gt 0 ]
}

# Upload to Google Drive
upload_to_google_drive() {
    local backup_file=$1
    
    if [ -f "$SCRIPT_DIR/cloud-upload-google-drive.sh" ]; then
        "$SCRIPT_DIR/cloud-upload-google-drive.sh" "$backup_file" "$BACKUP_TYPE" 2>> "$LOG_FILE"
    else
        log_error "Google Drive upload script not found"
        return 1
    fi
}

# Upload to OneDrive
upload_to_onedrive() {
    local backup_file=$1
    
    if [ -f "$SCRIPT_DIR/cloud-upload-onedrive.sh" ]; then
        "$SCRIPT_DIR/cloud-upload-onedrive.sh" "$backup_file" "$BACKUP_TYPE" 2>> "$LOG_FILE"
    else
        log_error "OneDrive upload script not found"
        return 1
    fi
}

# Verify backup integrity
verify_backup() {
    local backup_file=$1
    
    if [ "${BACKUP_VERIFY:-true}" != "true" ]; then
        log_info "Backup verification disabled"
        return 0
    fi
    
    log_info "Verifying backup integrity..."
    
    # Check if file exists and is not empty
    if [ ! -s "$backup_file" ]; then
        log_error "Backup file is empty or does not exist"
        return 1
    fi
    
    # Calculate and log checksum
    local checksum=$(sha256sum "$backup_file" | cut -d' ' -f1)
    log_info "Backup checksum (SHA256): $checksum"
    echo "$checksum" > "${backup_file}.sha256"
    
    log_success "Backup verification completed"
}

# Clean old backups
cleanup_old_backups() {
    log_info "Cleaning up old backups..."
    
    # Clean daily backups older than retention period
    find "$DAILY_DIR" -name "*.enc" -type f -mtime +${DAILY_RETENTION_DAYS:-30} -delete
    find "$DAILY_DIR" -name "*.sha256" -type f -mtime +${DAILY_RETENTION_DAYS:-30} -delete
    
    # Clean weekly backups older than retention period
    find "$WEEKLY_DIR" -name "*.enc" -type f -mtime +$((${WEEKLY_RETENTION_WEEKS:-12} * 7)) -delete
    find "$WEEKLY_DIR" -name "*.sha256" -type f -mtime +$((${WEEKLY_RETENTION_WEEKS:-12} * 7)) -delete
    
    # Clean monthly backups older than retention period
    find "$MONTHLY_DIR" -name "*.enc" -type f -mtime +$((${MONTHLY_RETENTION_MONTHS:-12} * 30)) -delete
    find "$MONTHLY_DIR" -name "*.sha256" -type f -mtime +$((${MONTHLY_RETENTION_MONTHS:-12} * 30)) -delete
    
    # Clean old log files (keep 60 days)
    find "$LOG_DIR" -name "*.log" -type f -mtime +60 -delete
    
    log_success "Old backups cleaned up"
}

# Send notification
send_notification() {
    local status=$1
    local message=$2
    
    local subject="Database Backup ${status}: Tudor Padel"
    local body="Backup Type: ${BACKUP_TYPE}\nTimestamp: ${DATETIME_READABLE}\nStatus: ${status}\nMessage: ${message}"
    
    # Email notification
    if [ "${EMAIL_NOTIFICATIONS_ENABLED:-false}" = "true" ]; then
        echo -e "$body" | mail -s "$subject" "$BACKUP_ALERT_EMAIL" 2>/dev/null || true
    fi
    
    # Slack notification
    if [ "${SLACK_NOTIFICATIONS_ENABLED:-false}" = "true" ]; then
        local emoji=":white_check_mark:"
        [ "$status" = "FAILURE" ] && emoji=":x:"
        
        curl -X POST "$SLACK_WEBHOOK_URL" \
            -H 'Content-Type: application/json' \
            -d "{\"text\":\"${emoji} ${subject}\",\"blocks\":[{\"type\":\"section\",\"text\":{\"type\":\"mrkdwn\",\"text\":\"${body}\"}}]}" \
            2>/dev/null || true
    fi
    
    # Healthcheck ping
    if [ -n "${HEALTHCHECK_URL:-}" ] && [ "$status" = "SUCCESS" ]; then
        curl -fsS --retry 3 "$HEALTHCHECK_URL" > /dev/null 2>&1 || true
    fi
}

# Generate backup report
generate_report() {
    local backup_file=$1
    local start_time=$2
    local end_time=$3
    
    local duration=$((end_time - start_time))
    local file_size=$(du -h "$backup_file" | cut -f1)
    
    log_info "=========================================="
    log_info "BACKUP REPORT"
    log_info "=========================================="
    log_info "Backup Type: $BACKUP_TYPE"
    log_info "Database: $BACKUP_DB_NAME"
    log_info "Timestamp: $DATETIME_READABLE"
    log_info "Duration: ${duration} seconds"
    log_info "File Size: $file_size"
    log_info "Location: $backup_file"
    log_info "Status: SUCCESS"
    log_info "=========================================="
}

###############################################################################
# MAIN EXECUTION
###############################################################################

main() {
    local start_time=$(date +%s)
    
    log_info "=========================================="
    log_info "Tudor Padel Database Backup Script"
    log_info "=========================================="
    log_info "Starting backup process..."
    
    # Pre-flight checks
    check_prerequisites
    create_directories
    check_disk_space
    test_database_connection
    
    # Perform backup
    local backup_file=$(backup_database)
    
    # Post-processing
    if [ "${BACKUP_COMPRESSION:-true}" = "true" ]; then
        backup_file=$(compress_backup "$backup_file")
    fi
    
    backup_file=$(encrypt_backup "$backup_file")
    backup_file=$(move_backup "$backup_file")
    
    # Verification
    verify_backup "$backup_file"
    
    # Cloud upload
    upload_to_cloud "$backup_file"
    
    # Cleanup
    cleanup_old_backups
    cleanup
    
    # Report
    local end_time=$(date +%s)
    generate_report "$backup_file" "$start_time" "$end_time"
    
    # Notify success
    send_notification "SUCCESS" "Backup completed successfully"
    
    log_success "Backup process completed successfully!"
    
    exit 0
}

# Run main function
main "$@"
