#!/bin/bash

###############################################################################
# Tudor Padel Database Restore Script
# 
# Description: Restore PostgreSQL database from encrypted backup
#
# Usage: ./restore-database.sh <backup_file> [target_database]
#
# Author: Tudor Padel DevOps Team
# Version: 1.0
# Last Updated: 2025-10-31
###############################################################################

set -euo pipefail

###############################################################################
# CONFIGURATION
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables
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

# Check arguments
if [ $# -lt 1 ]; then
    echo "Usage: $0 <backup_file> [target_database]"
    echo "Example: $0 /var/backups/tudor-padel/daily/backup_20251031.dump.gz.enc"
    echo "         $0 /var/backups/tudor-padel/daily/backup_20251031.dump.gz.enc tudor_padel_restored"
    exit 1
fi

BACKUP_FILE=$1
TARGET_DB=${2:-$BACKUP_DB_NAME}
TEMP_DIR="${BACKUP_DIR}/temp"
LOG_DIR="${BACKUP_DIR}/logs"
DATE=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/restore_${DATE}.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

###############################################################################
# FUNCTIONS
###############################################################################

log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date "+%Y-%m-%d %H:%M:%S")
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE" >&2
}

log_info() { log "INFO" "$@"; }
log_error() { log "ERROR" "${RED}$@${NC}"; }
log_success() { log "SUCCESS" "${GREEN}$@${NC}"; }
log_warning() { log "WARNING" "${YELLOW}$@${NC}"; }

# Confirmation prompt
confirm() {
    local prompt=$1
    read -p "$prompt (yes/no): " response
    [[ "$response" == "yes" ]]
}

# Check if file exists
check_backup_file() {
    log_info "Checking backup file..."
    
    if [ ! -f "$BACKUP_FILE" ]; then
        log_error "Backup file not found: $BACKUP_FILE"
        exit 1
    fi
    
    log_success "Backup file found: $BACKUP_FILE"
}

# Decrypt backup
decrypt_backup() {
    local encrypted_file=$1
    local decrypted_file="${TEMP_DIR}/$(basename ${encrypted_file%.enc})"
    
    log_info "Decrypting backup..."
    
    if [[ "$encrypted_file" == *.enc ]]; then
        # Export password for OpenSSL
        export BACKUP_ENCRYPTION_PASSWORD
        
        openssl enc -aes-256-cbc -d -pbkdf2 \
            -in "$encrypted_file" \
            -out "$decrypted_file" \
            -pass env:BACKUP_ENCRYPTION_PASSWORD
        
        log_success "Decryption completed"
        echo "$decrypted_file"
    else
        log_warning "File is not encrypted, skipping decryption"
        echo "$encrypted_file"
    fi
}

# Decompress backup
decompress_backup() {
    local compressed_file=$1
    local decompressed_file="${TEMP_DIR}/$(basename ${compressed_file%.gz})"
    
    log_info "Decompressing backup..."
    
    if [[ "$compressed_file" == *.gz ]]; then
        gunzip -c "$compressed_file" > "$decompressed_file"
        log_success "Decompression completed"
        echo "$decompressed_file"
    else
        log_warning "File is not compressed, skipping decompression"
        echo "$compressed_file"
    fi
}

# Check database exists
database_exists() {
    local db_name=$1
    export PGPASSWORD="$BACKUP_DB_PASSWORD"
    
    psql -h "$BACKUP_DB_HOST" \
         -p "$BACKUP_DB_PORT" \
         -U "$BACKUP_DB_USER" \
         -lqt | cut -d \| -f 1 | grep -qw "$db_name"
}

# Drop database
drop_database() {
    local db_name=$1
    
    log_warning "Dropping existing database: $db_name"
    
    if ! confirm "Are you sure you want to drop database '$db_name'?"; then
        log_info "Restore cancelled by user"
        exit 0
    fi
    
    export PGPASSWORD="$BACKUP_DB_PASSWORD"
    
    # Terminate all connections
    psql -h "$BACKUP_DB_HOST" \
         -p "$BACKUP_DB_PORT" \
         -U "$BACKUP_DB_USER" \
         -d postgres \
         -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db_name';" \
         >> "$LOG_FILE" 2>&1
    
    # Drop database
    dropdb -h "$BACKUP_DB_HOST" \
           -p "$BACKUP_DB_PORT" \
           -U "$BACKUP_DB_USER" \
           "$db_name" \
           >> "$LOG_FILE" 2>&1
    
    log_success "Database dropped"
}

# Create database
create_database() {
    local db_name=$1
    
    log_info "Creating database: $db_name"
    
    export PGPASSWORD="$BACKUP_DB_PASSWORD"
    
    createdb -h "$BACKUP_DB_HOST" \
             -p "$BACKUP_DB_PORT" \
             -U "$BACKUP_DB_USER" \
             "$db_name" \
             >> "$LOG_FILE" 2>&1
    
    log_success "Database created"
}

# Restore database
restore_database() {
    local backup_file=$1
    local db_name=$2
    
    log_info "Restoring database from backup..."
    log_info "This may take several minutes depending on database size..."
    
    export PGPASSWORD="$BACKUP_DB_PASSWORD"
    
    pg_restore -h "$BACKUP_DB_HOST" \
               -p "$BACKUP_DB_PORT" \
               -U "$BACKUP_DB_USER" \
               -d "$db_name" \
               --verbose \
               --no-owner \
               --no-privileges \
               "$backup_file" \
               >> "$LOG_FILE" 2>&1 || true
    
    log_success "Database restore completed"
}

# Verify restored database
verify_database() {
    local db_name=$1
    
    log_info "Verifying restored database..."
    
    export PGPASSWORD="$BACKUP_DB_PASSWORD"
    
    # Count tables
    local table_count=$(psql -h "$BACKUP_DB_HOST" \
                             -p "$BACKUP_DB_PORT" \
                             -U "$BACKUP_DB_USER" \
                             -d "$db_name" \
                             -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
    
    log_info "Number of tables: $(echo $table_count | xargs)"
    
    # Check if we have data
    local row_count=$(psql -h "$BACKUP_DB_HOST" \
                           -p "$BACKUP_DB_PORT" \
                           -U "$BACKUP_DB_USER" \
                           -d "$db_name" \
                           -t -c "SELECT COUNT(*) FROM users;")
    
    log_info "Number of users: $(echo $row_count | xargs)"
    
    if [ "$(echo $table_count | xargs)" -gt 0 ]; then
        log_success "Database verification passed"
    else
        log_error "Database verification failed - no tables found"
        return 1
    fi
}

# Cleanup temporary files
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f "${TEMP_DIR}"/*
    log_success "Cleanup completed"
}

###############################################################################
# MAIN EXECUTION
###############################################################################

main() {
    log_info "=========================================="
    log_info "Tudor Padel Database Restore Script"
    log_info "=========================================="
    log_info "Backup file: $BACKUP_FILE"
    log_info "Target database: $TARGET_DB"
    
    # Pre-flight checks
    mkdir -p "$TEMP_DIR" "$LOG_DIR"
    check_backup_file
    
    # Warning
    log_warning "WARNING: This operation will replace all data in the target database!"
    if ! confirm "Do you want to continue?"; then
        log_info "Restore cancelled by user"
        exit 0
    fi
    
    # Process backup file
    local processed_file="$BACKUP_FILE"
    
    # Decrypt if encrypted
    if [[ "$processed_file" == *.enc ]]; then
        processed_file=$(decrypt_backup "$processed_file")
    fi
    
    # Decompress if compressed
    if [[ "$processed_file" == *.gz ]]; then
        processed_file=$(decompress_backup "$processed_file")
    fi
    
    # Database operations
    if database_exists "$TARGET_DB"; then
        drop_database "$TARGET_DB"
    fi
    
    create_database "$TARGET_DB"
    restore_database "$processed_file" "$TARGET_DB"
    verify_database "$TARGET_DB"
    
    # Cleanup
    cleanup
    
    log_success "=========================================="
    log_success "Database restore completed successfully!"
    log_success "=========================================="
    log_info "Database: $TARGET_DB"
    log_info "Log file: $LOG_FILE"
    
    if [ "$TARGET_DB" != "$BACKUP_DB_NAME" ]; then
        log_info ""
        log_warning "NOTE: Database was restored to '$TARGET_DB'"
        log_warning "Update your .env file if you want to use this database:"
        log_warning "DATABASE_URL=postgresql://postgres:password@localhost:5432/$TARGET_DB"
    fi
    
    exit 0
}

# Run main function
main "$@"
