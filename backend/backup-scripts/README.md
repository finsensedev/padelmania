# Tudor Padel Database Backup System# Tudor Padel Database Backup System



✅ **SETUP COMPLETE!** Your database is automatically backed up to Google Drive every Sunday at 2:00 AM.✅ **SETUP COMPLETE!** Your database is automatically backed up to Google Drive every Sunday at 2:00 AM.



## 📋 Quick Commands## 📋 Quick Reference



```bash### Daily Commands:

# Run backup immediately

./backup-manager.sh backup-now```bash

# Run backup now

# View backups in Google Drive./backup-manager.sh backup-now

./backup-manager.sh view-gdrive

# View backups in Google Drive

# Check system status./backup-manager.sh view-gdrive

./backup-manager.sh status

# Check system status

# View logs./backup-manager.sh status

./backup-manager.sh logs

# View logs

# List local backups./backup-manager.sh logs

./backup-manager.sh list-local

# List local backups

# Clean old backups./backup-manager.sh list-local

./backup-manager.sh cleanup

```# Clean old backups

./backup-manager.sh cleanup

## ⚙️ Current Configuration```



- **Schedule:** Every Sunday at 2:00 AM (automatic)### Current Configuration:

- **Database:** tudor_padel @ localhost:5432

- **Local Storage:** `~/Desktop/tudor-padel-backups/weekly/`- **Schedule:** Every Sunday at 2:00 AM

- **Cloud Storage:** Google Drive → `tudor-padel-backups/weekly/`- **Database:** tudor_padel (localhost:5432)

- **Encryption:** AES-256 enabled- **Local Storage:** `~/Desktop/tudor-padel-backups/weekly/`

- **Retention:** 90 days in cloud- **Cloud Storage:** Google Drive → `tudor-padel-backups/weekly/`

- **Compression:** GZIP (saves ~90% space)- **Encryption:** AES-256 (TudorPadel2024SecureBackup!DatabaseEncryption@2024)

- **Retention:** 90 days

## 📁 Essential Files- **Compression:** GZIP (saves ~90% space)



### Core Scripts (DO NOT DELETE)---

- **`backup-database.sh`** - Main backup script (runs automatically)

- **`backup-manager.sh`** - Management commands for daily operations## 📁 Essential Files

- **`restore-database.sh`** - Restore backups when needed

- **`.env.backup`** - Configuration (contains your encryption password!)### 1. Configure Settings

```bash

### Documentation# Copy example config

- **`README.md`** - This filecp backup-config.env.example .env.backup

- **`SETUP_COMPLETE.txt`** - Setup summary with all details

- **`RESTORE_GUIDE.md`** - How to restore from backups# Edit with your settings

- **`ENCRYPTION_EXPLAINED.md`** - Security detailsnano .env.backup

```

### Health & Monitoring

- **`check-backup-health.sh`** - Verify backup integrity### 2. Setup Google Drive (OAuth2 - No password needed!)

```bash

### Configuration Template# Create remote named 'google-drive-backup'

- **`backup-config.env.example`** - Example configuration (reference only)rclone config create google-drive-backup drive scope drive



## 🔐 Important Security Info# Create folders in Google Drive

rclone mkdir google-drive-backup:tudor-padel-backups

**Encryption Password:** `TudorPadel2024SecureBackup!DatabaseEncryption@2024`rclone mkdir google-drive-backup:tudor-padel-backups/daily

rclone mkdir google-drive-backup:tudor-padel-backups/weekly

⚠️ **NEVER DELETE `.env.backup`** - It contains your encryption password!rclone mkdir google-drive-backup:tudor-padel-backups/monthly

Without this password, you cannot restore your backups.```



## 🔄 How Backups Work### 3. Setup OneDrive (Optional - for dual backup)

```bash

Every Sunday at 2:00 AM, automatically:# Create remote named 'onedrive-backup'

1. Database is dumped using `pg_dump`rclone config create onedrive-backup onedrive

2. Compressed with GZIP (696KB → 68KB)

3. Encrypted with AES-256# Create folders in OneDrive

4. Saved locallyrclone mkdir onedrive-backup:tudor-padel-backups

5. Uploaded to Google Driverclone mkdir onedrive-backup:tudor-padel-backups/daily

6. Old backups (>90 days) are cleaned uprclone mkdir onedrive-backup:tudor-padel-backups/weekly

rclone mkdir onedrive-backup:tudor-padel-backups/monthly

**You don't need to do anything - it's fully automated!**```



## 📊 Monitoring### 4. Create Backup Directories

```bash

### Check Backup Statussudo mkdir -p /var/backups/tudor-padel/{daily,weekly,monthly,logs}

```bashsudo chown -R $USER:$USER /var/backups/tudor-padel

./backup-manager.sh statuschmod -R 755 /var/backups/tudor-padel

``````



### View Recent Logs### 5. Run Your First Backup

```bash```bash

./backup-manager.sh logs./backup-database.sh daily

``````



### Check Schedule## Usage

```bash

launchctl list | grep tudorpadel### Create Backups

``````bash

# Daily backup (anytime)

### View Google Drive Backups./backup-database.sh daily

```bash

rclone lsl gdrive:tudor-padel-backups/weekly/# Weekly backup (Sundays)

```./backup-database.sh weekly



## 🆘 Restoring from Backup# Monthly backup (1st of month)

./backup-database.sh monthly

If you need to restore your database:```



```bash### Check Backup Status

# List available backups```bash

./backup-manager.sh view-gdrive# View local backups

ls -lh /var/backups/tudor-padel/daily/

# Download and restore (creates test database)

./restore-database.sh <backup-file> tudor_padel_restore_test# View Google Drive backups

```rclone ls google-drive-backup:tudor-padel-backups/daily/



See `RESTORE_GUIDE.md` for detailed instructions.# View OneDrive backups (if configured)

rclone ls onedrive-backup:tudor-padel-backups/daily/

## 🔧 Manual Backup

# Run health check

To run a backup immediately (outside the schedule):./check-backup-health.sh

```

```bash

./backup-manager.sh backup-now### Restore Database

``````bash

# Restore from local backup

Or directly:./restore-database.sh /var/backups/tudor-padel/daily/backup_file.dump.gz.enc



```bash# Download from cloud and restore

./backup-database.sh weeklyrclone copy google-drive-backup:tudor-padel-backups/daily/backup_file.dump.gz.enc ~/Downloads/

```./restore-database.sh ~/Downloads/backup_file.dump.gz.enc

```

## 📅 Scheduled Backup Details

### View Logs

The backup is scheduled using macOS launchd:```bash

- **File:** `~/Library/LaunchAgents/com.tudorpadel.weeklybackup.plist`# Today's backup log

- **Day:** Sunday (Weekday = 0)tail -50 /var/backups/tudor-padel/logs/backup_$(date +%Y%m%d).log

- **Time:** 2:00 AM

- **Type:** Weekly full backup# All logs

ls -lt /var/backups/tudor-padel/logs/

### Stop Automatic Backups```

```bash

launchctl unload ~/Library/LaunchAgents/com.tudorpadel.weeklybackup.plist## Automated Backups (Optional)

```

Add to crontab for automatic backups:

### Start Automatic Backups

```bash```bash

launchctl load ~/Library/LaunchAgents/com.tudorpadel.weeklybackup.plistcrontab -e

```

# Add these lines:

## 🌐 Google Drive Setup# Daily backup at 2 AM

0 2 * * * /home/faisal17/Desktop/tudor-padel-full-stack/tudor-petal-backend/backup-scripts/backup-database.sh daily >> /var/backups/tudor-padel/logs/cron.log 2>&1

Already configured! Your rclone remote is named `gdrive`.

# Weekly backup on Sundays at 3 AM

To verify connection:0 3 * * 0 /home/faisal17/Desktop/tudor-padel-full-stack/tudor-petal-backend/backup-scripts/backup-database.sh weekly >> /var/backups/tudor-padel/logs/cron.log 2>&1

```bash

rclone lsd gdrive:# Monthly backup on 1st at 4 AM

```0 4 1 * * /home/faisal17/Desktop/tudor-padel-full-stack/tudor-petal-backend/backup-scripts/backup-database.sh monthly >> /var/backups/tudor-padel/logs/cron.log 2>&1

```

To check storage space:

```bash## Configuration

rclone about gdrive:

```Key settings in `.env.backup`:



## 📍 Backup Locations```bash

# Database

### LocalDB_HOST=localhost

```DB_PORT=5432

~/Desktop/tudor-padel-backups/DB_NAME=tudor_padel

├── weekly/     (automatic backups)DB_USER=postgres

├── daily/      (if you run manual daily backups)DB_PASSWORD=your_password

├── monthly/    (if you run manual monthly backups)

├── temp/       (temporary files during backup)# Encryption (keep this password safe!)

└── logs/       (backup logs)BACKUP_ENCRYPTION_PASSWORD=your_strong_password_here

```

# Cloud Providers (comma-separated for multiple)

### Google DriveCLOUD_PROVIDERS=google-drive          # Single provider

```# CLOUD_PROVIDERS=google-drive,onedrive  # Dual backup (recommended!)

tudor-padel-backups/

├── weekly/     (automatic backups uploaded here)# Google Drive

├── daily/GDRIVE_REMOTE_NAME=google-drive-backup

└── monthly/GDRIVE_BACKUP_FOLDER=tudor-padel-backups

```GDRIVE_RETENTION_DAYS=60



## ⚙️ Configuration# OneDrive

ONEDRIVE_REMOTE_NAME=onedrive-backup

Your configuration is in `.env.backup`. Key settings:ONEDRIVE_BACKUP_FOLDER=tudor-padel-backups

ONEDRIVE_RETENTION_DAYS=60

- **Database Connection:** localhost:5432/tudor_padel```

- **Encryption:** Enabled (AES-256)

- **Compression:** Enabled (Level 6)## Files

- **Cloud Provider:** Google Drive

- **Retention:** 90 days| File | Purpose |

|------|---------|

To change settings, edit `.env.backup`:| `backup-database.sh` | Main backup script |

```bash| `restore-database.sh` | Restore from backup |

nano .env.backup| `check-backup-health.sh` | Health monitoring |

```| `cloud-upload-google-drive.sh` | Google Drive uploader |

| `cloud-upload-onedrive.sh` | OneDrive uploader |

## 💡 Tips| `.env.backup` | Your configuration (keep safe!) |

| `backup-config.env.example` | Configuration template |

- **Monitor regularly:** Check logs monthly with `./backup-manager.sh logs`

- **Test restores:** Practice restoring every few months## Features

- **Check space:** Monitor Google Drive space with `rclone about gdrive:`

- **Keep password safe:** Store your encryption password securely- ✅ **Automated PostgreSQL backups** with pg_dump

- **Watch logs:** First few Sundays, check logs to ensure backups run successfully- ✅ **Compression** (~91% size reduction with gzip)

- ✅ **AES-256-CBC encryption** for security

## 📞 Troubleshooting- ✅ **Google Drive & OneDrive support** via rclone

- ✅ **OAuth2 authentication** (no passwords stored)

### Backup didn't run- ✅ **SHA256 checksums** for integrity verification

```bash- ✅ **Automatic cleanup** of old backups

# Check if job is loaded- ✅ **Multiple cloud providers** for redundancy

launchctl list | grep tudorpadel- ✅ **Retention policies** (daily/weekly/monthly)



# Check logs## Security

./backup-manager.sh logs

```- Backups are encrypted with AES-256-CBC

- OAuth2 for cloud services (passwords never stored)

### Google Drive connection issues- Files have restricted permissions (600)

```bash- Checksums verify integrity

# Test connection- **Important:** Keep your encryption password safe - you need it to restore!

rclone lsd gdrive:

## Troubleshooting

# If needed, reconfigure

rclone config reconnect gdrive:### Google Drive connection issues

``````bash

# Test connection

### Database connection issuesrclone lsd google-drive-backup:

```bash

# Test database connection# Re-authenticate

PGPASSWORD="faisal17" psql -h localhost -U postgres -d tudor_padel -c "SELECT 1"rclone config reconnect google-drive-backup:

``````



## 🎯 Next Steps### Database connection failed

```bash

Your backup system is ready! Consider:# Test database

psql -h localhost -U postgres -d tudor_padel -c "SELECT version();"

1. ✅ Test a restore to verify everything works```

2. ✅ Add backup monitoring to your calendar (check monthly)

3. ✅ Document the encryption password for your team### Backup failed

4. ✅ Set up email notifications (optional - edit `.env.backup`)```bash

# Check logs

---tail -100 /var/backups/tudor-padel/logs/backup_$(date +%Y%m%d).log

```

**System Status:** ✅ Operational  

**Last Setup:** November 11, 2025  ### Out of disk space

**Next Backup:** This Sunday at 2:00 AM  ```bash

# Check space

🎉 Your data is safe and automatically backed up!df -h /var/backups/tudor-padel/


# Manually clean old backups (older than 60 days)
find /var/backups/tudor-padel/daily/ -name "*.enc" -mtime +60 -delete
```

## Storage Capacity

**Google Drive Free:** 15 GB  
**OneDrive Free:** 5 GB  
**Backup Size:** ~164 KB per backup

With daily (30), weekly (12), and monthly (12) backups:
- Total: ~9 MB usage
- Plenty of space available!

## Support

For issues or questions, check the logs first:
```bash
tail -100 /var/backups/tudor-padel/logs/backup_$(date +%Y%m%d).log
```

---

**Status:** ✅ Operational  
**Last Updated:** October 31, 2025
