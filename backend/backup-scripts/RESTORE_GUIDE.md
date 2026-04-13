# Database Restore Guide

## 🔐 Your Encryption Password

**Password:** `TudorPadel2024SecureBackupPassword!@#$%`

⚠️ **SAVE THIS PASSWORD!** You need it to restore any backup.

---

## 🚀 Quick Restore (Automatic - Recommended)

### From Local Backup
```bash
cd /home/faisal17/Desktop/tudor-padel-full-stack/tudor-petal-backend/backup-scripts

# List available backups
ls -lh /var/backups/tudor-padel/daily/

# Restore (replace with actual filename)
./restore-database.sh /var/backups/tudor-padel/daily/tudor_padel_daily_20251031_113438.dump.gz.enc
```

### From Google Drive
```bash
# Step 1: Download from Google Drive
rclone copy google-drive-backup:tudor-padel-backups/daily/tudor_padel_daily_20251031_113438.dump.gz.enc ~/Downloads/

# Step 2: Restore
cd /home/faisal17/Desktop/tudor-padel-full-stack/tudor-petal-backend/backup-scripts
./restore-database.sh ~/Downloads/tudor_padel_daily_20251031_113438.dump.gz.enc
```

**What happens:**
1. ✅ Script decrypts the file automatically
2. ✅ Decompresses it
3. ✅ Asks for confirmation (to prevent accidents)
4. ✅ Restores to database
5. ✅ Verifies restoration
6. ✅ Cleans up temp files

---

## 🔧 Manual Decryption & Restore

If you want to do it manually or understand the process:

### Step 1: Decrypt the File
```bash
# Decrypt .enc file (password required)
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in tudor_padel_daily_20251031_113438.dump.gz.enc \
  -out tudor_padel_daily_20251031_113438.dump.gz \
  -pass pass:'TudorPadel2024SecureBackupPassword!@#$%'

# You now have: tudor_padel_daily_20251031_113438.dump.gz
```

### Step 2: Decompress the File
```bash
# Decompress .gz file
gunzip tudor_padel_daily_20251031_113438.dump.gz

# You now have: tudor_padel_daily_20251031_113438.dump (unencrypted PostgreSQL backup)
```

### Step 3: View Backup Info (Optional)
```bash
# See what's in the backup
pg_restore --list tudor_padel_daily_20251031_113438.dump | head -20
```

### Step 4: Restore to Database
```bash
# Option A: Restore and replace existing database
pg_restore --host=localhost \
           --port=5432 \
           --username=postgres \
           --dbname=tudor_padel \
           --clean \
           --if-exists \
           --verbose \
           tudor_padel_daily_20251031_113438.dump

# Option B: Restore to a new test database (safer)
createdb -U postgres tudor_padel_test
pg_restore --host=localhost \
           --port=5432 \
           --username=postgres \
           --dbname=tudor_padel_test \
           --verbose \
           tudor_padel_daily_20251031_113438.dump
```

---

## 🧪 Test Restore (Safe Practice)

### Test Without Affecting Production

```bash
# 1. Create test database
createdb -U postgres tudor_padel_restore_test

# 2. Restore to test database
cd /home/faisal17/Desktop/tudor-padel-full-stack/tudor-petal-backend/backup-scripts
./restore-database.sh /var/backups/tudor-padel/daily/tudor_padel_daily_20251031_113438.dump.gz.enc tudor_padel_restore_test

# 3. Verify data
psql -U postgres -d tudor_padel_restore_test -c "SELECT COUNT(*) FROM users;"
psql -U postgres -d tudor_padel_restore_test -c "SELECT COUNT(*) FROM bookings;"

# 4. Clean up test database
dropdb -U postgres tudor_padel_restore_test
```

---

## 📦 Encryption Details

### What is AES-256-CBC?

- **AES-256:** Advanced Encryption Standard with 256-bit key (military-grade)
- **CBC:** Cipher Block Chaining mode
- **PBKDF2:** Password-Based Key Derivation Function 2 (secure key generation)

### File Structure

```
Original: tudor_padel_daily_20251031_113438.dump (1.8 MB)
         ↓ [gzip compression]
Step 1:  tudor_padel_daily_20251031_113438.dump.gz (164 KB)
         ↓ [AES-256-CBC encryption]
Step 2:  tudor_padel_daily_20251031_113438.dump.gz.enc (161 KB) ← This is in Google Drive
```

### Security Features

✅ **Password Required:** Cannot decrypt without password  
✅ **Salt Added:** Prevents rainbow table attacks  
✅ **PBKDF2:** Makes brute force attacks extremely slow  
✅ **Checksum:** SHA256 verification for integrity  

---

## 🔍 Verify Backup Without Restoring

### Check if backup is valid (without decrypting fully)

```bash
cd /home/faisal17/Desktop/tudor-padel-full-stack/tudor-petal-backend/backup-scripts

# Check backup integrity
./check-backup-health.sh

# View backup file size
ls -lh /var/backups/tudor-padel/daily/*.enc

# Verify checksum
cd /var/backups/tudor-padel/daily/
sha256sum -c tudor_padel_daily_20251031_113438.dump.gz.enc.sha256
```

---

## 📥 Download from Google Drive

### Method 1: Using rclone (Command Line)
```bash
# List available backups
rclone ls google-drive-backup:tudor-padel-backups/daily/

# Download specific backup
rclone copy google-drive-backup:tudor-padel-backups/daily/tudor_padel_daily_20251031_113438.dump.gz.enc ~/Downloads/

# Verify download
ls -lh ~/Downloads/tudor_padel_daily_20251031_113438.dump.gz.enc
```

### Method 2: Using Web Browser
1. Go to https://drive.google.com/
2. Navigate to `tudor-padel-backups/daily/`
3. Right-click on backup file → Download
4. Save to `~/Downloads/`

---

## ⚠️ Important Safety Notes

### Before Restoring to Production:

1. **✅ ALWAYS test restore in a test database first**
   ```bash
   ./restore-database.sh backup_file.dump.gz.enc tudor_padel_test
   ```

2. **✅ ALWAYS backup current database before restoring**
   ```bash
   ./backup-database.sh daily  # Create fresh backup before restore
   ```

3. **✅ ALWAYS verify the backup date**
   ```bash
   # Check backup filename for date/time
   # tudor_padel_daily_20251031_113438.dump.gz.enc
   #                  ^^^^^^^^ ^^^^^^
   #                  Date     Time (11:34:38 AM)
   ```

4. **✅ Stop application before restoring**
   ```bash
   # Stop your backend server
   # Then restore
   # Then restart server
   ```

---

## 🆘 Emergency Recovery Procedure

### If Production Database Crashes:

```bash
# 1. Stop application
# Stop your Node.js server

# 2. Download latest backup from Google Drive
rclone ls google-drive-backup:tudor-padel-backups/daily/ | tail -1
rclone copy google-drive-backup:tudor-padel-backups/daily/LATEST_BACKUP.dump.gz.enc ~/

# 3. Restore database
cd /home/faisal17/Desktop/tudor-padel-full-stack/tudor-petal-backend/backup-scripts
./restore-database.sh ~/LATEST_BACKUP.dump.gz.enc

# 4. Verify restoration
psql -U postgres -d tudor_padel -c "SELECT COUNT(*) FROM users;"

# 5. Restart application
# Start your Node.js server
```

---

## 📞 Common Issues & Solutions

### Issue: "Wrong password" error
**Solution:** Check your encryption password in `.env.backup`
```bash
grep BACKUP_ENCRYPTION_PASSWORD /home/faisal17/Desktop/tudor-padel-full-stack/tudor-petal-backend/backup-scripts/.env.backup
```

### Issue: "File corrupted" error
**Solution:** Verify checksum
```bash
cd /var/backups/tudor-padel/daily/
sha256sum -c backup_file.dump.gz.enc.sha256
```

### Issue: "Database already exists" error
**Solution:** Use `--clean` flag or drop database first
```bash
dropdb -U postgres tudor_padel
createdb -U postgres tudor_padel
# Then restore
```

### Issue: "Permission denied"
**Solution:** Make sure you're using correct PostgreSQL user
```bash
psql -U postgres -d tudor_padel -c "SELECT version();"
```

---

## 💾 Backup Password Storage Recommendations

Save your encryption password in multiple secure locations:

1. ✅ **Password Manager** (1Password, LastPass, Bitwarden)
2. ✅ **Encrypted USB drive** (offline backup)
3. ✅ **Secure note in cloud** (encrypted note service)
4. ✅ **Team documentation** (if working in team)
5. ❌ **NOT in git repository**
6. ❌ **NOT in plain text file on desktop**

**Current Password:** `TudorPadel2024SecureBackupPassword!@#$%`

---

## ✅ Quick Reference

| Action | Command |
|--------|---------|
| **Restore (auto)** | `./restore-database.sh backup_file.dump.gz.enc` |
| **Decrypt only** | `openssl enc -d -aes-256-cbc -pbkdf2 -in file.enc -out file.gz -pass pass:'PASSWORD'` |
| **Decompress** | `gunzip file.dump.gz` |
| **List backups** | `rclone ls google-drive-backup:tudor-padel-backups/daily/` |
| **Download** | `rclone copy google-drive-backup:tudor-padel-backups/daily/file.enc ~/` |
| **Verify checksum** | `sha256sum -c file.sha256` |
| **Test database** | `createdb tudor_padel_test` |

---

**Last Updated:** October 31, 2025  
**Status:** Production-ready ✅
