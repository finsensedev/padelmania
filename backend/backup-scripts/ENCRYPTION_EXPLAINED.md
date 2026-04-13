# 🔐 Encryption & Decryption Explained Simply

## How Your Backup Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    BACKUP PROCESS (What we did)                  │
└─────────────────────────────────────────────────────────────────┘

   PostgreSQL Database (tudor_padel)
          │
          │ pg_dump (export)
          ▼
   📄 tudor_padel.dump (1.8 MB)  ← Raw SQL data
          │
          │ gzip -6 (compress)
          ▼
   📦 tudor_padel.dump.gz (164 KB)  ← 91% smaller!
          │
          │ openssl AES-256-CBC (encrypt with password)
          ▼
   🔒 tudor_padel.dump.gz.enc (161 KB)  ← Encrypted, safe
          │
          │ Upload to Google Drive
          ▼
   ☁️  Google Drive (tudor-padel-backups/daily/)


┌─────────────────────────────────────────────────────────────────┐
│                  RESTORE PROCESS (What you'll do)                │
└─────────────────────────────────────────────────────────────────┘

   ☁️  Download from Google Drive
          │
          ▼
   🔒 tudor_padel.dump.gz.enc (161 KB)
          │
          │ openssl decrypt (needs password: TudorPadel2024SecureBackupPassword!@#$%)
          ▼
   📦 tudor_padel.dump.gz (164 KB)  ← Decrypted!
          │
          │ gunzip (decompress)
          ▼
   📄 tudor_padel.dump (1.8 MB)  ← Raw SQL data
          │
          │ pg_restore (import)
          ▼
   PostgreSQL Database (tudor_padel) ← Restored! ✅
```

---

## 🔑 The Magic Ingredient: Your Password

**Your encryption password:** `TudorPadel2024SecureBackupPassword!@#$%`

This password is:
- ✅ Used to encrypt backups
- ✅ Required to decrypt backups
- ✅ Stored in `.env.backup` file
- ⚠️ **MUST BE KEPT SAFE!**

Without this password:
- ❌ Cannot decrypt backup files
- ❌ Cannot restore database
- ❌ Backup is useless

---

## 🚀 Super Simple Restore (One Command!)

```bash
cd /home/faisal17/Desktop/tudor-padel-full-stack/tudor-petal-backend/backup-scripts

# This ONE command does EVERYTHING:
./restore-database.sh /var/backups/tudor-padel/daily/tudor_padel_daily_20251031_113438.dump.gz.enc
```

**What happens automatically:**
1. 🔓 Decrypts with your password (from `.env.backup`)
2. 📦 Decompresses the file
3. ⚠️  Asks "Are you sure?" (prevents accidents)
4. 💾 Restores to PostgreSQL
5. ✅ Verifies restoration worked
6. 🧹 Cleans up temporary files

**You just need to:**
- Type `yes` when asked for confirmation
- Wait ~10 seconds
- Done! ✅

---

## 🔧 What If You Want to See Inside?

### Step 1: Decrypt (Manual)
```bash
cd ~/Downloads

# Decrypt the file (creates .dump.gz)
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in tudor_padel_daily_20251031_113438.dump.gz.enc \
  -out tudor_padel_daily_20251031_113438.dump.gz \
  -pass pass:'TudorPadel2024SecureBackupPassword!@#$%'

# Now you have: tudor_padel_daily_20251031_113438.dump.gz (unencrypted, but still compressed)
```

### Step 2: Decompress (Manual)
```bash
# Decompress the file (creates .dump)
gunzip tudor_padel_daily_20251031_113438.dump.gz

# Now you have: tudor_padel_daily_20251031_113438.dump (plain PostgreSQL backup file)
```

### Step 3: Peek Inside (Optional)
```bash
# See what's in the backup
pg_restore --list tudor_padel_daily_20251031_113438.dump

# You'll see:
# - All tables (users, bookings, courts, etc.)
# - All data
# - All indexes
# - All sequences
```

### Step 4: Restore (Manual)
```bash
# Restore to database
pg_restore --host=localhost \
           --port=5432 \
           --username=postgres \
           --dbname=tudor_padel \
           --clean \
           --verbose \
           tudor_padel_daily_20251031_113438.dump
```

---

## 🧪 Safe Testing

### Practice Restore Without Risk

```bash
# 1. Create a test database (won't affect production)
createdb -U postgres tudor_padel_TEST

# 2. Restore to test database
cd /home/faisal17/Desktop/tudor-padel-full-stack/tudor-petal-backend/backup-scripts
./restore-database.sh /var/backups/tudor-padel/daily/tudor_padel_daily_20251031_113438.dump.gz.enc tudor_padel_TEST

# 3. Check if it worked
psql -U postgres -d tudor_padel_TEST -c "SELECT COUNT(*) FROM users;"
psql -U postgres -d tudor_padel_TEST -c "SELECT COUNT(*) FROM bookings;"

# 4. Delete test database when done
dropdb -U postgres tudor_padel_TEST
```

This way you can:
- ✅ Practice restoring
- ✅ Verify backup is good
- ✅ Learn the process
- ✅ Zero risk to production!

---

## 📊 Real-World Comparison

Think of it like a locked safe:

```
Regular File (Unencrypted)
└─ Anyone can open and read
   ❌ Not secure!

Your Backup (Encrypted)
└─ Locked safe with combination lock
   └─ Combination: TudorPadel2024SecureBackupPassword!@#$%
      └─ Only people with combination can open
         ✅ Very secure!
```

**Even if someone steals your backup:**
- They see: `81 72 F3 A4 9B 2C...` (random encrypted bytes)
- They cannot read: Users, passwords, bookings, anything!
- Without your password = useless to them

---

## ⚡ Quick Reference Card

| What You Want | Command |
|---------------|---------|
| **Restore (Easy)** | `./restore-database.sh backup_file.dump.gz.enc` |
| **Decrypt File** | `openssl enc -d -aes-256-cbc -pbkdf2 -in file.enc -out file.gz -pass pass:'PASSWORD'` |
| **Decompress** | `gunzip file.dump.gz` |
| **View Contents** | `pg_restore --list file.dump` |
| **Test Restore** | `./restore-database.sh backup_file.dump.gz.enc test_db` |

---

## 🆘 Emergency Contact Info

**Your Password:** `TudorPadel2024SecureBackupPassword!@#$%`  
**Backup Location (Local):** `/var/backups/tudor-padel/daily/`  
**Backup Location (Cloud):** Google Drive → `tudor-padel-backups/daily/`  
**Database:** `tudor_padel` on `localhost:5432`  
**User:** `postgres`

**To restore RIGHT NOW if emergency:**
```bash
cd /home/faisal17/Desktop/tudor-padel-full-stack/tudor-petal-backend/backup-scripts
./restore-database.sh /var/backups/tudor-padel/daily/tudor_padel_daily_20251031_113438.dump.gz.enc
# Type: yes
# Wait 10 seconds
# Done!
```

---

**Remember:** The restore script does ALL the decryption and decompression automatically! You just run one command. 🎉
